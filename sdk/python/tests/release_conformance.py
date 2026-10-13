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
# A second read before explicit ACK still exposes the same signed event.
requester_token = requester._auth_headers()['authorization'].removeprefix('Bearer ')
durable = TruynClient(relay_url, session_token=requester_token)
assert any(e['eventId'] == 'result:' + receipt['needId'] for e in durable.recover_durable())
assert any(e['eventId'] == 'result:' + receipt['needId'] for e in durable.recover_durable())
assert durable.acknowledge_durable('result:' + receipt['needId'])['acknowledged'] is True
assert not any(e['eventId'] == 'result:' + receipt['needId'] for e in durable.recover_durable())
cancel_receipt = requester.need(capability, {'cancel': True})
revoke = create_envelope(
    type='REVOKE',
    identity=requester.identity,
    payload={'targetId': cancel_receipt['needId'], 'targetKind': 'need', 'reason': 'sdk_conformance_cancel'},
)
_request_json('POST', relay_url.rstrip('/') + '/v1/revoke', body={'envelope': revoke}, headers=requester._auth_headers())
# Signed compact C/P/D native source execution on actual relay, no reference signer.
base_context = requester.put_context([{'id': 'seed', 'text': 'original'}])
assert base_context['ok'] is True and isinstance(base_context['cid'], str)
child_context = requester.delta_context(base_context['cid'], [{'op': 'replace', 'id': 'seed', 'text': 'changed'}])
assert child_context['ok'] is True and child_context['baseCid'] == base_context['cid'] and child_context['cid'] != base_context['cid']
try:
    provider.delta_context(base_context['cid'], [{'op': 'replace', 'id': 'seed', 'text': 'unauthorized'}])
    raise AssertionError('context owner validation bypassed')
except Exception as denied:
    assert 'context_owner_required' in str(denied) or '403' in str(denied)
try:
    requester.compact_chain([{'capability': {'name': 'missing-stage-1'}}, {'capability': {'name': 'missing-stage-2'}}])
    raise AssertionError('missing chain providers accepted')
except Exception as denied:
    assert 'no_matching_provider' in str(denied) or '404' in str(denied)
import threading
chain_results, chain_errors = [], []
def run_chain():
    try:
        chain_results.append(requester.compact_chain([{'capability': {'name': capability}}, {'capability': {'name': capability}}]))
    except Exception as e:
        chain_errors.append(e)
worker = threading.Thread(target=run_chain, daemon=True)
worker.start()
for n in range(2):
    deadline = time.monotonic() + 8
    stage = None
    while time.monotonic() < deadline and stage is None:
        stage = next((e for e in provider.poll_compact() if e['kind'] == 'CHAIN_STAGE'), None)
        if stage is None: time.sleep(0.03)
    assert stage and stage['verification']['ok'] is True
    if n: assert stage['priorVerification']['ok'] is True
    provider.compact_result(stage['requestId'], {'stage': n})
worker.join(8)
assert not worker.is_alive() and not chain_errors and chain_results[0]['ok'] is True and len(chain_results[0]['results']) == 2
print('PASS python developer-release conformance')
