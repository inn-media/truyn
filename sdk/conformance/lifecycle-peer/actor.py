"""Fixture actor; package signing and event verification remain in the selected SDK."""
import json, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from truyn.local_node import TruynLocalNodeClient, create_envelope
peer = None
for line in sys.stdin:
    item = json.loads(line)
    try:
        op = item['op']; out = None
        if op == 'init':
            peer = TruynLocalNodeClient.connect(item['url'], protocols=item.get('protocols', ['TRUYN/1']))
            out = {'nodeId':peer.node_id, 'cancelSurface':'public-create_envelope',
                   'compactApi':all(callable(getattr(peer, k, None)) for k in ('compact_need','partial','poll_compact'))}
        elif op == 'offer': out = peer.offer(item['capability'])
        elif op == 'need': out = peer.need(item['capability'], {'fixture':True})
        elif op == 'result': out = peer.result(item['id'], {'answer':42})
        elif op == 'next':
            value = peer.next_need(timeout_ms=3000); out = {'needId':value['needId'], 'verified':value['verification']['ok']}
        elif op == 'wait':
            value = peer.wait_for_result(item['id'], timeout_ms=3000); out = {'needId':value['needId'], 'verified':value['verification']['ok']}
        elif op in ('cancel','withdraw'):
            # Published Python exposes signing primitives, not a cancel method.
            # This is primitive-level coverage, not convenience-API parity.
            env = create_envelope(type='REVOKE', identity=peer.identity,
                payload={'targetId':item['id'], 'targetKind':'need' if op=='cancel' else 'offer', 'reason':'fixture'})
            request = Request(peer.relay_url+'/v1/revoke', method='POST', data=json.dumps({'envelope':env}).encode(),
                headers={'content-type':'application/json','authorization':'Bearer '+peer.session_token})
            with urlopen(request, timeout=5) as response: out=json.load(response)
        elif op == 'close':
            if peer is not None: peer.close()
            print(json.dumps({'ok':True,'value':None}),flush=True); break
        else: raise ValueError('unsupported_fixture_operation')
        print(json.dumps({'ok':True,'value':out}),flush=True)
    except Exception as exc:
        status=getattr(exc,'code',None)
        if isinstance(exc,HTTPError): body=exc.read().decode(); status=exc.code
        else: body=str(exc)
        print(json.dumps({'ok':False,'error':str(status),'message':body}),flush=True)
