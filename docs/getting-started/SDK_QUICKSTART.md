# TRUYN SDK Quickstart

**Status:** DX-1 in-repository developer onboarding. The TypeScript and Python reference SDK cores are executable and CI-proven, but packages are still private/unpublished and not stable-v1 compatibility contracts.

This guide is intentionally small: it shows one local provider, one local requester and one verified `NEED -> RESULT` round trip through the existing TRUYN relay/runtime contract.

## What you will run

```text
local relay
   ↓
provider registers and publishes OFFER
   ↓
requester sends signed NEED
   ↓
provider polls and verifies NEED
   ↓
provider sends signed RESULT
   ↓
requester polls and verifies RESULT
```

No cloud provider, billing account, private key, production relay, DHT, QUIC/Kademlia or D-1000 machinery is involved in this quickstart.

## Prerequisites

From the repository root:

```bash
npm install --ignore-scripts --no-audit --no-fund
python -m pip install --disable-pip-version-check -e ./sdk/python
```

Runtime assumptions:

- Node.js `>=22`;
- Python `>=3.10`;
- local loopback relay only;
- repository source checkout, because the SDK packages are not published yet.

## Fastest path: TypeScript all-in-one

This starts an ephemeral local relay inside the example, creates a provider/requester pair, then completes `NEED -> RESULT`.

```bash
node --experimental-strip-types examples/sdk/hello-need-result.ts
```

The example uses the same public DX-1 local-node API proven by `sdk/typescript/test/local-node-e2e.test.ts`:

```ts
import { createRelay } from '../../network/relay/server.js';
import { TruynLocalNodeClient } from '../../sdk/typescript/src/local-node.ts';

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });

const provider = await TruynLocalNodeClient.connect({ relayUrl, name: 'hello-provider' });
const requester = await TruynLocalNodeClient.connect({ relayUrl, name: 'hello-requester' });

try {
  await provider.offer('sdk.echo', { example: 'hello-need-result' });

  const receipt = await requester.need(
    'sdk.echo',
    { text: 'hello TRUYN' },
    { purpose: 'sdk-quickstart' }
  );

  const need = await provider.nextNeed({ timeoutMs: 2_000 });
  const output = { text: `RESULT: ${(need.input as { text: string }).text}` };

  await provider.result(need.needId, output, { example: 'hello-need-result' });

  const result = await requester.waitForResult(receipt.needId, { timeoutMs: 2_000 });
  console.log(JSON.stringify({ ok: result.verification.ok, output: result.output }, null, 2));
} finally {
  requester.close();
  provider.close();
  await relay.close();
}
```

## Local relay start guide

Use this when another process, such as the Python example, needs a relay URL.

Terminal 1:

```bash
npm run relay -- --host 127.0.0.1 --port 8787
```

The CLI starts `createRelay({ localDevelopmentMode: true })` and prints a loopback URL such as:

```text
TRUYN local-development relay listening on http://127.0.0.1:8787
```

Keep that terminal open while the requester/provider example runs. Stop it with `Ctrl+C`.

## Python copy-paste example

Terminal 2, after the relay is running:

```bash
PYTHONPATH=sdk/python/src TRUYN_RELAY_URL=http://127.0.0.1:8787 python examples/sdk/hello_need_result.py
```

The example uses the Python DX-1 parity API proven by `sdk/python/tests/local_node_e2e.py`:

```python
import json
import os

from truyn import TruynLocalNodeClient

relay_url = os.environ.get('TRUYN_RELAY_URL') or os.environ.get('TRUYN_E2E_RELAY_URL')
if not relay_url:
    raise SystemExit('Set TRUYN_RELAY_URL, for example http://127.0.0.1:8787')

provider = TruynLocalNodeClient.connect(relay_url, name='hello-provider')
requester = TruynLocalNodeClient.connect(relay_url, name='hello-requester')

try:
    provider.offer('sdk.echo', {'example': 'hello-need-result'})

    receipt = requester.need(
        'sdk.echo',
        {'text': 'hello TRUYN'},
        {'purpose': 'sdk-quickstart'},
    )

    need = provider.next_need(timeout_ms=2000)
    output = {'text': 'RESULT: ' + need['input']['text']}

    provider.result(need['needId'], output, {'example': 'hello-need-result'})

    result = requester.wait_for_result(receipt['needId'], timeout_ms=2000)
    print(json.dumps({'ok': result['verification']['ok'], 'output': result['output']}, indent=2))
finally:
    requester.close()
    provider.close()
```

## Expected output

Both examples should print a verified result similar to:

```json
{
  "ok": true,
  "output": {
    "text": "RESULT: hello TRUYN"
  }
}
```

## What this proves

DX-1 quickstart proves the same bounded local contract as the CI E2E tests:

- two distinct node identities are created;
- the provider publishes an `OFFER`;
- the requester sends a signed `NEED`;
- the provider receives and verifies that `NEED`;
- the provider sends a signed `RESULT`;
- the requester receives and verifies the matching `RESULT`;
- the existing relay/runtime paths are used; no mock relay transport is used.

## What this does not claim

This quickstart does **not** prove or change:

- production package publication;
- stable-v1 API compatibility;
- remote production relay onboarding;
- account/tenant control-plane behavior;
- QUIC/Kademlia/DHT behavior;
- D-1000 evaluator, thresholds, bootstrap, runtime or evidence;
- mainnet readiness.

## Next developer paths

- TypeScript reference SDK: `../../sdk/typescript/README.md`
- Python reference SDK: `../../sdk/python/README.md`
- Shared conformance data: `../../sdk/conformance/README.md`
- SDK architecture: `../architecture/SDK_DEVELOPER_EXPERIENCE.md`
- SDK compatibility: `../compatibility/SDK_COMPATIBILITY.md`
- MVP CLI quickstart: `MVP_QUICKSTART.md`
