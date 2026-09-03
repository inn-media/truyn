# TRUYN SDK Quickstart

**Status:** Developer Release relay-client/package implementation is source/build complete across TypeScript/JavaScript, Python, Go, Java and C#/.NET. This guide intentionally shows the smallest copy-paste TypeScript/Python local path; the full five-language executable gate is documented below. Native registry publication remains open, and Agent Descriptor refresh/interface-validation parity still has explicit gaps described below, so repository-source onboarding remains the reproducible default.

**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`

## What you will run

```text
local relay
   ↓
provider registers and publishes OFFER
   ↓
requester sends signed NEED
   ↓
provider receives and verifies NEED
   ↓
provider sends signed RESULT
   ↓
requester receives and verifies RESULT
```

No cloud provider, billing account, production relay, DHT, QUIC/Kademlia or D-1000 machinery is involved in this quickstart.

## Prerequisites

From the repository root:

```bash
npm install --ignore-scripts --no-audit --no-fund
python -m pip install --disable-pip-version-check -e ./sdk/python
```

For the two copy-paste examples above, Node.js `>=22` and Python `>=3.10` are sufficient. The **five-language conformance runner** additionally spawns the Go, Java/Maven and .NET toolchains directly. The exact CI-proven reference toolchain is:

- Node.js `22`;
- Python `3.12`;
- Go `1.22.x`;
- Temurin JDK `17` with `java` and `mvn` available on `PATH`;
- .NET SDK `8.0.x` with `dotnet` on `PATH`.

`.github/workflows/ci.yml` is the canonical executable setup for this toolchain. The quickstart otherwise assumes a local loopback relay and repository source checkout until the public registry publication gate is accepted and observed.

## Fastest path: TypeScript all-in-one

This starts an ephemeral local relay inside the example, creates a provider/requester pair, then completes `NEED -> RESULT`.

```bash
node --experimental-strip-types examples/sdk/hello-need-result.ts
```

The example uses the same local-node contract proven by the TypeScript SDK tests:

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

The CLI starts a loopback local-development relay and prints a URL such as:

```text
TRUYN local-development relay listening on http://127.0.0.1:8787
```

Keep that terminal open while the requester/provider example runs. Stop it with `Ctrl+C`.

## Python copy-paste example

Terminal 2, after the relay is running:

```bash
PYTHONPATH=sdk/python/src TRUYN_RELAY_URL=http://127.0.0.1:8787 python examples/sdk/hello_need_result.py
```

The example uses the Python local-node API:

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

## Full five-language Developer Release proof

The Developer Release client/build layer is broader than the two copy-paste examples above. Run:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

This starts one real local relay and one signed HTTP Agent Descriptor fixture, then independently exercises TypeScript, Python, Go, Java and .NET.

Each language must:

- fetch the same valid signed `truyn.agent-descriptor/v1` fixture;
- validate expiry and identity-key binding/signature;
- select `TRUYN/1` plus a supported interface from that valid fixture;
- register an independent provider/requester pair;
- publish an authorized OFFER;
- execute NEED → verified provider event → signed RESULT → verified requester RESULT;
- issue a second direct NEED and exercise cancellation from the owning requester.

This is executable network behavior, not skeleton/DTO parity. The runner does **not** by itself prove every Descriptor-negative or cancellation-authorization invariant in every language: it does not attempt a non-owner revoke, and its valid Descriptor fixture does not catch all malformed/missing-interface-endpoint cases. Those security/lifecycle properties must be backed by dedicated runtime/SDK regressions, and the current Descriptor gaps are documented below.

## Developer Release features beyond this minimal example

The bounded SDK/runtime surface also includes:

- authenticated relay event streaming;
- signed generic ordered `PARTIAL` streaming;
- direct NEED cancellation through signed `REVOKE` for the compact direct-NEED lifecycle;
- reference-oriented object/artifact payloads;
- default-off Agent Descriptor serving plus five-language fetch/signature/expiry handling against the accepted happy-path fixture;
- built npm/PyPI/Go/Maven/NuGet verification artifacts with exact source SHA, byte size and SHA-256 provenance.

Current Descriptor limitations are explicit: the runtime signs the public Descriptor once at provider startup and does not automatically refresh/re-sign it before `expiresAt`, and Go/Java/.NET do not yet all enforce a non-empty `interfaces[].endpoint` during negotiation (with Go/.NET typed endpoint mapping also not fully aligned to the schema). Therefore a long-running provider can serve an expired Descriptor until restart, and usable endpoint-negotiation parity is not yet complete.

`PARTIAL` is a generic ordered delta/chunk contract; it does not define a universal tokenizer/token-ID vocabulary. Chain-stage cancellation is not supported.

## What this guide proves — and does not prove

The TypeScript/Python copy-paste path proves a bounded local signed OFFER/NEED/RESULT transaction through a real local relay. The five-language E2E command proves that all five client implementations can execute the common happy-path relay flow and exercise the accepted Descriptor/cancellation calls described above; it is not a substitute for every negative/lifecycle regression.

Neither proves:

- public registry publication;
- stable `TRUYN/1` protocol compatibility;
- complete Agent Descriptor refresh/endpoint-negotiation parity;
- remote production relay onboarding;
- account/tenant control-plane behavior;
- QUIC/Kademlia/DHT behavior;
- D-1000 acceptance;
- mainnet readiness.

## Next developer paths

- SDK program status: `../../sdk/README.md`
- Shared conformance: `../../sdk/conformance/README.md`
- SDK architecture: `../architecture/SDK_DEVELOPER_EXPERIENCE.md`
- DX-3 runtime surface: `DX3_SDK.md`
- SDK compatibility: `../compatibility/SDK_COMPATIBILITY.md`
- SDK release/publication boundary: `../../sdk/release/PUBLISHING.md`
- MVP CLI quickstart: `MVP_QUICKSTART.md`
