from __future__ import annotations

import os
import sys
import time

from truyn.client import TruynClient
from truyn.local_node import TruynLocalNodeClient, _request_json, create_envelope

if len(sys.argv) != 2:
    raise SystemExit('relay URL is required')
relay_url = sys.argv[1]
descriptor_url = os.environ.get('TRUYN_CONFORMANCE_DESCRIPTOR_URL')
descriptor_public_key = os.environ.get('TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY')
descriptor_identity = os.environ.get('TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY')
if not descriptor_url or not descriptor_public_key or not descriptor_identity:
    raise SystemExit('descriptor conformance fixture is required')
verified_descriptor = TruynClient(relay_url).fetch_agent_descriptor(descriptor_url, public_key_pem=descriptor_public_key)
assert verified_descriptor['descriptor']['identity'] == descriptor_identity
assert verified_descriptor['selection']['protocol'] == 'TRUYN/1'
assert verified_descriptor['selection']['interface']['type'] == 'https'
assert verified_descriptor['signer']['keyBinding'] == 'identity'

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
