import json, sys
from truyn.local_node import TruynLocalNodeClient
peers = {}
mode, relay = sys.argv[1:]
for line in sys.stdin:
    message = None
    try:
        message = json.loads(line)
        a = message.get('args', {})
        action = message['action']
        p = peers.get(a.get('actor'))
        if action == 'connect':
            p = TruynLocalNodeClient.connect(relay, name=a['actor'], protocols=a.get('protocols', ['TRUYN/1']))
            peers[a['actor']] = p
            value = dict(nodeId=p.node_id, cancel=callable(getattr(p, 'cancel_need', None)),
                         withdraw=callable(getattr(p, 'revoke_offer', None)),
                         partial=all(callable(getattr(p, k, None)) for k in ('partial','compact_need','compact_result','poll_compact')), surface='client-api')
        elif action == 'reregister': value = p._register(name=a['actor'], protocols=['TRUYN/1'])
        elif action == 'offer': value = p.offer(a['capability'], a.get('metadata', {}))
        elif action == 'need': value = p.need(a['capability'], {'probe':True})
        elif action == 'result': value = p.result(a['needId'], a.get('output', {'answer':42}))
        elif action == 'nextNeed':
            r=p.next_need(timeout_ms=3000); value=dict(needId=r['needId'], verified=r['verification']['ok'] is True)
        elif action == 'waitResult':
            r=p.wait_for_result(a['needId'], timeout_ms=3000); value=dict(needId=r['needId'], verified=r['verification']['ok'] is True)
            if a.get('includeOutput'): value['output'] = r['output']
        elif action == 'cancel': value = p.cancel_need(a['needId'], 'test_cancel')
        elif action == 'withdraw': value = p.revoke_offer(a['offerId'], 'test_withdraw')
        elif action == 'poll': value = [dict(kind=x['kind'],verified=x['verification']['ok'] is True) for x in p._poll()]
        elif action == 'compactNeed': value = p.compact_need(a['capability'], {'probe':True})
        elif action == 'partial': value = p.partial(a['needId'], a['sequence'], a['delta'])
        elif action == 'compactResult': value = p.compact_result(a['needId'], {'answer':42})
        elif action == 'pollCompact':
            value = []
            for x in p.poll_compact():
                row = dict(kind=x['kind'], verified=x['verification']['ok'] is True)
                if 'sequence' in x.get('payload', {}): row['sequence'] = x['payload']['sequence']
                value.append(row)
        else: raise ValueError('unsupported_action')
        print(json.dumps(dict(id=message['id'],ok=True,value=value)),flush=True)
    except Exception as error:
        print(json.dumps(dict(id=message.get('id') if message else None,ok=False,code=getattr(error, 'code', None),error=str(error)[:150])),flush=True)
for p in peers.values(): p.close()
