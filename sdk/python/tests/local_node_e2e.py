from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'sdk' / 'python' / 'src'))

from truyn import TruynLocalNodeClient  # noqa: E402

FLOW = json.loads((ROOT / 'sdk' / 'conformance' / 'v1' / 'local-node-e2e.json').read_text())


class PythonLocalNodeE2ETests(unittest.TestCase):
    def test_python_sdk_completes_same_verified_need_result_flow(self):
        relay_url = os.environ.get('TRUYN_E2E_RELAY_URL')
        if not relay_url:
            self.skipTest('TRUYN_E2E_RELAY_URL is supplied by the real-relay repository gate')

        self.assertEqual(FLOW['fixtureSet'], 'truyn.sdk-conformance/v1')
        self.assertEqual(FLOW['contractVersion'], 1)
        self.assertEqual(FLOW['flowId'], 'local-node.need-result/v1')

        provider = TruynLocalNodeClient.connect(relay_url, name=FLOW['providerName'])
        requester = TruynLocalNodeClient.connect(relay_url, name=FLOW['requesterName'])
        try:
            self.assertNotEqual(provider.node_id, requester.node_id)

            offer = provider.offer(FLOW['capabilityId'], FLOW['offerMetadata'])
            self.assertTrue(offer.get('offerId'))

            receipt = requester.need(FLOW['capabilityId'], FLOW['needInput'], FLOW['needPolicy'])
            self.assertTrue(receipt['ok'])
            self.assertEqual(receipt['provider'], provider.node_id)
            self.assertTrue(receipt['needId'])

            need = provider.next_need(timeout_ms=2000)
            self.assertEqual(need['needId'], receipt['needId'])
            self.assertEqual(need['requester'], requester.node_id)
            self.assertEqual(need['capability'], FLOW['capabilityId'])
            self.assertEqual(need['input'], FLOW['needInput'])
            self.assertEqual(need['policy'], FLOW['needPolicy'])
            self.assertTrue(need['verification']['ok'])

            output = {
                'text': FLOW['result']['outputPrefix'] + need['input']['text']
            }
            self.assertEqual(output, FLOW['result']['expectedOutput'])
            provider.result(need['needId'], output, FLOW['result']['metadata'])

            result = requester.wait_for_result(receipt['needId'], timeout_ms=2000)
            self.assertEqual(result['needId'], receipt['needId'])
            self.assertEqual(result['provider'], provider.node_id)
            self.assertEqual(result['output'], FLOW['result']['expectedOutput'])
            self.assertEqual(result['metadata'], FLOW['result']['metadata'])
            self.assertTrue(result['verification']['ok'])
            self.assertIsNotNone(result['trust'])
        finally:
            requester.close()
            provider.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
