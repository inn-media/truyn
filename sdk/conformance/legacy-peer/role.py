import sys
from truyn.local_node import TruynLocalNodeClient

if len(sys.argv) != 5:
    raise SystemExit('usage: role.py legacy|candidate provider|requester <relay> <capability>')
mode, role, relay_url, capability = sys.argv[1:]
peer = TruynLocalNodeClient.connect(relay_url, name=f'legacy-matrix-python-{mode}-{role}')
if role == 'provider':
    peer.offer(capability, {'mode':mode})
    print('READY', flush=True)
    need = peer.next_need(timeout_ms=15000)
    assert need['capability'] == capability, 'NEED capability mismatch'
    peer.result(need['needId'], {'ok':True, 'producedBy':mode})
    print('PASS provider', flush=True)
else:
    receipt = peer.need(capability, {'payload':'legacy-new-wire'})
    result = peer.wait_for_result(receipt['needId'], timeout_ms=15000)
    assert result['verification']['ok'] is True
    print('PASS requester', flush=True)
