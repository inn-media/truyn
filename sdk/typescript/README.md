# @truyn/sdk

First-party JavaScript/TypeScript SDK for TRUYN.

**Status:** implemented Developer Release client; source/build complete, pre-stable, with public npm publication remaining a separate observed release gate.

```js
import { TruynLocalNodeClient } from '@truyn/sdk';

const client = await TruynLocalNodeClient.connect({ relayUrl: 'https://relay.example' });
const receipt = await client.need('reasoning.general', { question: 'Hello' });
const result = await client.waitForResult(receipt.needId);
```

The current bounded Developer Release surface also includes authenticated relay event streaming, requester-owned direct NEED cancellation, signed generic `PARTIAL` delivery, portable object/artifact references and Agent Descriptor fetch/verify/negotiation.

Run the shared executable Developer Release gate from the repository root:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI builds/verifies the npm release artifact and records exact source SHA, byte size and SHA-256 provenance. Build/provenance is not the same as public npm registry publication.

This package is a **pre-stable `0.x` SDK**. `TRUYN/1` remains a draft protocol generation. Provider authorization, billing and visibility are enforced by TRUYN server/runtime policy, never by client-supplied metadata or Agent Descriptor contents.

See `../README.md`, `../conformance/README.md` and `../../docs/compatibility/SDK_COMPATIBILITY.md`.
