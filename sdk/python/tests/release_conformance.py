from __future__ import annotations

import sys
import time

from truyn.local_node import TruynLocalNodeClient, _request_json, create_envelope

if len(sys.argv) != 2:
    raise SystemExit('relay URL is required')
relay_url = sys.argv[1]
provider = TruynLocalNodeClient.connect(relay_url, name='python-provider')
requester = TruynLocalNodeClient.connect(relay_url, name='python-requester')
capability = f'sdk.release.python.{time.time_ns()}'
provider.offer(capability, {'language': 'python'})
receipt = requester.need(capability, {'question': 'hello'})
need = provider.next_need(timeout_ms=5000)
assert need['needId'] == receipt['needId']
assert need['requester'] == requester.node_id
assert need['capability'] == capability
provider.result(need['needId'], {'ok': True, 'language': 'python'})
result = requester.wait_for_result(receipt['needId'], timeout_ms=5000)
assert result['provider'] == provider.node_id
assert result['verification']['ok'] is True
cancel_receipt = requester.need(capability, {'cancel': True})
revoke = create_envelope(
    type='REVOKE',
    identity=requester.identity,
    payload={'targetId': cancel_receipt['needId'], 'targetKind': 'need', 'reason': 'sdk_conformance_cancel'},
)
_request_json('POST', relay_url.rstrip('/') + '/v1/revoke', body={'envelope': revoke}, headers=requester._auth_headers())
print('PASS python developer-release conformance')
