# TRUYN SDK Quickstart

**Status:** Developer Release relay-client/package implementation is source/build complete across TypeScript/JavaScript, Python, Go, Java and C#/.NET. npm `@truyn/sdk@0.1.0-alpha.5`, PyPI `truyn-sdk==0.1.0a2`, and Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2` are accepted immutable public prereleases. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.2` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.2` is independently accepted. Repository-source onboarding below is a reproducible development/conformance path; public registry onboarding is available in all five ecosystems. Bounded Descriptor refresh is implemented; cross-language malformed-interface parity and complete production lifecycle certification remain separate unproven scopes.

**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1`  
**Historical Developer Release source freeze (not current Wire Freeze package source):** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`

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

`.github/workflows/ci.yml` is the canonical executable setup for this toolchain. Consumers in all five ecosystems may use the accepted immutable Wire Freeze prereleases. Repository-source builds below are a development/conformance route, not a workaround for absent Java/.NET publication.

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
  const receipt = await requester.need('sdk.echo', { text: 'hello TRUYN' }, { purpose: 'sdk-quickstart' });
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
    receipt = requester.need('sdk.echo', {'text': 'hello TRUYN'}, {'purpose': 'sdk-quickstart'})
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

Each language must fetch and validate the same signed `truyn.agent-descriptor/v1` fixture, negotiate `TRUYN/1` plus a supported interface, register an independent provider/requester pair, publish an authorized OFFER, execute NEED → verified provider event → signed RESULT → verified requester RESULT, then issue a second direct NEED and exercise cancellation from the owning requester.

This is executable network behavior, not skeleton/DTO parity. The runner does **not** by itself prove every Descriptor-negative or cancellation-authorization invariant in every language; dedicated runtime/SDK regressions back those security/lifecycle properties.

## Developer Release features beyond this minimal example

The bounded SDK/runtime surface also includes authenticated relay event streaming, signed generic ordered `PARTIAL` streaming, direct NEED cancellation through signed `REVOKE`, reference-oriented object/artifact payloads, default-off Agent Descriptor serving plus five-language fetch/signature/expiry handling, and built npm/PyPI/Go/Maven/NuGet verification artifacts with exact source SHA, byte size and SHA-256 provenance.

Bounded Descriptor refresh/re-signing is implemented in `runtime/agent-descriptor.js` and exercised by `tests/agent-descriptor-refresh.test.js`. The current shared runtime fixture contains nine signature/expiry/negotiation/invalid-JSON cases, not an exhaustive malformed-interface matrix. An omitted interface endpoint is permitted; an explicitly empty endpoint is invalid in the current reference parser. Cross-language malformed-interface parity is not yet established. Missing or empty interface types are rejected by the reference parser; identical rejection across all five SDKs still needs executable proof. A historical S103 merge does not prove current-source parity, and no existing immutable package inherits newer source behavior. Delegated signing and final exact-SHA Open 1.0 admission remain separate.

`PARTIAL` is a generic ordered delta/chunk contract; it does not define a universal tokenizer/token-ID vocabulary. Chain-stage cancellation is not supported.

## What this guide proves — and does not prove

The TypeScript/Python copy-paste path proves a bounded local signed OFFER/NEED/RESULT transaction through a real local relay. The five-language E2E command proves that all five client implementations can execute the common happy-path relay flow and exercise the accepted Descriptor/cancellation calls described above; it is not a substitute for every negative/lifecycle regression.

It does **not** prove stable `TRUYN/1` protocol compatibility, all production Agent Descriptor lifecycle properties, remote production relay onboarding, account/tenant control-plane behavior, QUIC/Kademlia/DHT behavior, D-1000 acceptance, or mainnet readiness. Public registry status is coordinate-specific: npm alpha.5, PyPI alpha and Go alpha are accepted immutable public releases; Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.2` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.2` is independently accepted.

## Next developer paths

- SDK program status: `../../sdk/README.md`
- Shared conformance: `../../sdk/conformance/README.md`
- SDK architecture: `../architecture/SDK_DEVELOPER_EXPERIENCE.md`
- DX-3 runtime surface: `DX3_SDK.md`
- SDK compatibility: `../compatibility/SDK_COMPATIBILITY.md`
- SDK release/publication boundary: `../../sdk/release/PUBLISHING.md`
- MVP CLI quickstart: `MVP_QUICKSTART.md`

Current Descriptor contract and proof limits: [source-reconciled status](../compatibility/AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md).
