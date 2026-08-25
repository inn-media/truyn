from __future__ import annotations
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'sdk' / 'python' / 'src'))

from truyn import (  # noqa: E402
    HttpResponse,
    TruynClient,
    agent_descriptor_signing_payload,
    negotiate_agent_descriptor,
    normalize_error,
    parse_agent_descriptor,
    verify_agent_descriptor_signature,
)

GOLDEN = json.loads((ROOT / 'sdk' / 'conformance' / 'v1' / 'golden-fixtures.json').read_text())
RUNTIME = json.loads((ROOT / 'sdk' / 'conformance' / 'v1' / 'agent-descriptor-runtime-fixtures.json').read_text())
RUNTIME_BY_ID = {case['id']: case for case in RUNTIME['descriptorRuntimeCases']}

def runtime_value(case):
    if 'value' in case: return copy.deepcopy(case['value'])
    if 'valueFrom' in case: return runtime_value(RUNTIME_BY_ID[case['valueFrom']])
    return case.get('input')

class PythonParityTests(unittest.TestCase):
    def test_exact_shared_fixture_set(self):
        self.assertEqual(GOLDEN['fixtureSet'], 'truyn.sdk-conformance/v1')
        self.assertEqual(RUNTIME['fixtureSet'], GOLDEN['fixtureSet'])
        self.assertEqual(RUNTIME['contractVersion'], GOLDEN['contractVersion'])
        self.assertEqual(RUNTIME['extends'], 'golden-fixtures.json')

    def test_normalized_errors_match_every_shared_case(self):
        for case in GOLDEN['errorNormalizationCases']:
            with self.subTest(case=case['id']):
                actual = normalize_error(case['source'])
                self.assertEqual(actual['code'], case['expect']['code'])
                self.assertEqual(actual['retryable'], case['expect']['retryable'])

    def test_agent_descriptor_runtime_vectors(self):
        valid = RUNTIME_BY_ID['descriptor.signature-valid']
        self.assertEqual(agent_descriptor_signing_payload(valid['value']), valid['canonicalSigningPayload'])
        for case in RUNTIME['descriptorRuntimeCases']:
            with self.subTest(case=case['id']):
                value = runtime_value(case)
                if case['operation'] == 'verifyDescriptor':
                    actual = verify_agent_descriptor_signature(value, public_key_pem=case.get('identityPublicKey'), now=case.get('now'))
                elif case['operation'] == 'parseDescriptor':
                    actual = parse_agent_descriptor(value, now=case.get('now'))
                elif case['operation'] == 'negotiateDescriptor':
                    client = case.get('client', {})
                    actual = negotiate_agent_descriptor(
                        value,
                        now=case.get('now'),
                        supported_descriptor_versions=client.get('supportedDescriptorVersions'),
                        supported_protocols=client.get('supportedProtocols'),
                        supported_interfaces=client.get('supportedInterfaces'),
                    )
                else:
                    self.fail(f"unsupported fixture operation {case['operation']}")
                self.assertEqual(actual['ok'], case['expect']['accepted'])
                if not actual['ok']:
                    self.assertEqual(actual['reason'], case['expect']['reason'])
                    self.assertEqual(actual['error']['code'], case['expect']['error']['code'])
                    self.assertEqual(actual['error']['retryable'], case['expect']['error']['retryable'])
                elif case['operation'] == 'verifyDescriptor':
                    self.assertEqual(actual['signer']['keyBinding'], case['expect']['keyBinding'])
                elif case['operation'] == 'negotiateDescriptor':
                    self.assertEqual(actual['selection']['descriptorVersion'], case['expect']['descriptorVersion'])
                    self.assertEqual(actual['selection']['protocol'], case['expect']['protocol'])
                    self.assertEqual(actual['selection']['interface']['type'], case['expect']['interfaceType'])

    def test_pr1_descriptor_version_mismatch_is_executed_by_python(self):
        case = next(item for item in GOLDEN['behaviorCases'] if item['id'] == 'descriptor.version-mismatch')
        actual = parse_agent_descriptor(case['value'], now='2026-08-25T12:00:00.000Z')
        self.assertFalse(actual['ok'])
        self.assertEqual(actual['error']['code'], case['expect']['error']['code'])
        self.assertEqual(actual['error']['retryable'], case['expect']['error']['retryable'])

    def test_identity_and_authorized_discovery_match_server_boundary(self):
        identity_case = next(item for item in GOLDEN['dtoCases'] if item['id'] == 'identity.public.valid')
        privacy = next(item for item in GOLDEN['behaviorCases'] if item['id'] == 'discovery.private-capability-nondisclosure')
        calls = []
        def transport(method, url, headers):
            calls.append((method, url, dict(headers)))
            if '/v1/nodes/' in url: return HttpResponse(200, json.dumps(identity_case['value']).encode())
            if '/v1/offers?' in url: return HttpResponse(200, json.dumps(privacy['wireResponse']).encode())
            raise AssertionError(url)
        client = TruynClient('https://relay.example', session_token='fixture-session', transport=transport)
        identity = client.get_identity(identity_case['value']['nodeId'])
        offers = client.discover(privacy['capabilityId'])
        self.assertEqual(identity['nodeId'], identity_case['value']['nodeId'])
        self.assertEqual([offer['id'] for offer in offers], privacy['expect']['visibleOfferIds'])
        self.assertTrue(set(privacy['expect']['absentOfferIds']).isdisjoint({offer['id'] for offer in offers}))
        self.assertTrue(all(call[2].get('authorization') == 'Bearer fixture-session' for call in calls))

    def test_integrated_descriptor_fetch_resolves_identity_and_verifies(self):
        case = RUNTIME_BY_ID['descriptor.signature-valid']
        descriptor = case['value']
        descriptor_url = 'https://fixture.example/.well-known/truyn-agent.json'
        def transport(method, url, headers):
            if url == descriptor_url: return HttpResponse(200, json.dumps(descriptor).encode())
            if '/v1/nodes/' in url:
                return HttpResponse(200, json.dumps({
                    'nodeId': descriptor['identity'],
                    'publicKey': case['identityPublicKey'],
                    'algorithm': 'Ed25519',
                    'protocols': ['TRUYN/1'],
                    'name': 'Signed Fixture Provider',
                }).encode())
            raise AssertionError(url)
        client = TruynClient('https://relay.example', session_token='fixture-session', transport=transport)
        result = client.fetch_agent_descriptor(descriptor_url, now=case['now'])
        self.assertEqual(result['descriptor']['identity'], descriptor['identity'])
        self.assertEqual(result['signer']['keyBinding'], 'identity')
        self.assertEqual(result['selection']['protocol'], 'TRUYN/1')
        self.assertEqual(result['selection']['interface']['type'], 'https')

if __name__ == '__main__':
    unittest.main()
