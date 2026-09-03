#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-healed-origin.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()
start_marker = 'STAGE=healed-routing\n'
end_marker = 'STAGE=write-retention\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected healed-routing stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected write-retention stage count: {text.count(end_marker)}')
start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

if 'D200_HEALED_ORIGIN_DIAG=1' in block:
    raise SystemExit('healed origin diagnostic patch already appears applied')

required = {
    'existing reconvergence classifier': ("fresh=need(j,node_id,'d1000-healed-fresh-session-retry',k,'fresh')", 1),
    'existing state helper': ('def state(j):', 1),
    'existing targeted refresh helper': ('def targeted_refresh(j,node_id,k):', 1),
    'first-attempt acceptance probe': ("first=need(j,node_id,'d1000-healed',k,'first')", 1),
    'first-attempt success accounting': ('success=sum(ok for ok,_,_ in rows)', 1),
    'strict healed gate': ("assert float('$healed_rate') >= .99, '$healed_rate'", 1),
    'v1 diagnostic schema': ("'schema':'truyn.d200.healed-reconvergence.v1'", 1),
}
for label, (snippet, expected) in required.items():
    actual = block.count(snippet)
    if actual != expected:
        raise SystemExit(f'unexpected {label} count: {actual} (expected {expected})')

need_anchor = '\ndef need(j,node_id,scenario,k,label):\n'
if block.count(need_anchor) != 1:
    raise SystemExit(f'unexpected need helper anchor count: {block.count(need_anchor)}')
helpers = r'''
D200_HEALED_ORIGIN_DIAG=1

def persisted_peer_state(j,node_id):
    global_index=host*N+j
    path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'
    result={'path':path,'present':False,'validNow':False,'expired':None,'readOk':False}
    try:
        value=json.load(open(path))
        result['readOk']=True
        result['savedAt']=value.get('savedAt')
        record=next((item for item in (value.get('peerRecords') or []) if item.get('nodeId')==node_id),None)
        if record is None:
            return result
        expires_at=record.get('expiresAt')
        expires_ms=None
        if isinstance(expires_at,str) and expires_at:
            try:
                from datetime import datetime
                expires_ms=int(datetime.fromisoformat(expires_at.replace('Z','+00:00')).timestamp()*1000)
            except Exception:
                expires_ms=None
        now_ms=int(time.time()*1000)
        expired=None if expires_ms is None else now_ms>=expires_ms
        result.update({
          'present':True,
          'recordId':record.get('recordId'),
          'sequence':record.get('sequence'),
          'issuedAt':record.get('issuedAt'),
          'expiresAt':expires_at,
          'expiresInMs':None if expires_ms is None else expires_ms-now_ms,
          'expired':expired,
          'validNow':bool(expired is False),
          'endpoint':(record.get('endpoints') or [None])[0],
        })
        return result
    except Exception as error:
        result['error']=str(error)[:256]
        return result

def post_json(url,body,timeout='8'):
    payload=json.dumps(body,separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time',timeout,'-H','content-type: application/json','--data-binary',payload,url],text=True,capture_output=True)
    value=None
    if p.returncode==0:
        try:value=json.loads(p.stdout)
        except Exception:value=None
    return {'ok':bool(p.returncode==0 and isinstance(value,dict) and value.get('enabled') is True),'curlRc':p.returncode,'value':value,'stderr':p.stderr[-512:]}

def reset_target_transport(j,node_id):
    control=f'http://127.0.0.1:{base+j}'
    partition=post_json(control+'/faults/partition',{'nodeIds':[node_id]})
    heal=post_json(control+'/faults/heal',{'nodeIds':[node_id]})
    if not heal['ok']:
        heal_retry=post_json(control+'/faults/heal',{'nodeIds':[node_id]})
    else:
        heal_retry=None
    healed=bool(heal['ok'] or (heal_retry and heal_retry['ok']))
    return {'ok':bool(partition['ok'] and healed),'partition':partition,'heal':heal,'healRetry':heal_retry}
'''
block = block.replace(need_anchor, helpers + need_anchor)

old = r'''    before=state(j)
    fresh=need(j,node_id,'d1000-healed-fresh-session-retry',k,'fresh')
    refresh=None
    after_refresh=None
    post_refresh=None
    if fresh['ok']:
        classification='fresh-session-recovered'
    else:
        refresh=targeted_refresh(j,node_id,k)
        after_refresh=state(j)
        post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
        classification='target-refresh-recovered' if post_refresh['ok'] else 'persistent-after-refresh'
    diag={
      'sourceHost':host,'sourceLocalNode':j,'targetHost':target_host,'targetLocalNode':target_local,'targetNodeId':node_id,
      'classification':classification,'firstAttempt':first,'stateBeforeRecovery':before,'freshSessionRetry':fresh,
      'targetedRefresh':refresh,'stateAfterTargetedRefresh':after_refresh,'postRefreshRetry':post_refresh,
    }
'''
new = r'''    before=state(j)
    peer_before=persisted_peer_state(j,node_id)
    time.sleep(.25)
    peer_after_timeout=persisted_peer_state(j,node_id)
    reset=None
    reset_retry=None
    refresh=None
    after_refresh=None
    peer_after_refresh=None
    post_refresh=None
    if peer_before.get('validNow') is True:
        reset=reset_target_transport(j,node_id)
        reset_retry=need(j,node_id,'d1000-healed-session-reset-retry',k,'session-reset')
        if reset_retry['ok']:
            classification='valid-record-session-reset-recovered'
        else:
            refresh=targeted_refresh(j,node_id,k)
            after_refresh=state(j)
            peer_after_refresh=persisted_peer_state(j,node_id)
            post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
            classification='valid-record-target-refresh-recovered' if post_refresh['ok'] else 'persistent-after-refresh'
    else:
        refresh=targeted_refresh(j,node_id,k)
        after_refresh=state(j)
        peer_after_refresh=persisted_peer_state(j,node_id)
        post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
        if post_refresh['ok']:
            classification='stale-record-target-refresh-recovered' if peer_before.get('readOk') else 'peer-state-unavailable-target-refresh-recovered'
        else:
            classification='persistent-after-refresh'
    record_transition='valid-before-first-attempt'
    if peer_before.get('validNow') is not True:
        record_transition='became-valid-after-timeout' if peer_after_timeout.get('validNow') is True else 'stale-or-missing-after-timeout'
    diag={
      'sourceHost':host,'sourceLocalNode':j,'targetHost':target_host,'targetLocalNode':target_local,'targetNodeId':node_id,
      'classification':classification,'recordTransition':record_transition,'firstAttempt':first,'stateBeforeRecovery':before,
      'peerRecordBeforeFirstAttempt':peer_before,'peerRecordAfterTimeout':peer_after_timeout,
      'forcedTargetTransportReset':reset,'sessionResetRetry':reset_retry,
      'targetedRefresh':refresh,'stateAfterTargetedRefresh':after_refresh,'peerRecordAfterTargetedRefresh':peer_after_refresh,'postRefreshRetry':post_refresh,
    }
'''
if block.count(old) != 1:
    raise SystemExit(f'unexpected legacy recovery block count: {block.count(old)}')
block = block.replace(old, new)
block = block.replace("'schema':'truyn.d200.healed-reconvergence.v1'", "'schema':'truyn.d200.healed-reconvergence.v2'")

for forbidden in [
    "d1000-healed-fresh-session-retry",
    "classification='fresh-session-recovered'",
]:
    if forbidden in block:
        raise SystemExit(f'ambiguous legacy classifier remained after patch: {forbidden}')
for marker in [
    'persisted_peer_state(j,node_id)',
    "control+'/faults/partition'",
    "control+'/faults/heal'",
    "d1000-healed-session-reset-retry",
    "classification='valid-record-session-reset-recovered'",
    "classification='stale-record-target-refresh-recovered'",
    "'schema':'truyn.d200.healed-reconvergence.v2'",
    "assert float('$healed_rate') >= .99, '$healed_rate'",
]:
    if marker not in block:
        raise SystemExit(f'healed origin diagnostic marker missing after patch: {marker}')

text = text[:start] + block + text[end:]
path.write_text(text)
