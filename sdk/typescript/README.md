# @truyn/sdk

First-party JavaScript/TypeScript SDK for TRUYN.

**Status:** implemented Developer Release client. The latest accepted immutable public npm prerelease remains `@truyn/sdk@0.1.0-alpha.2`; the current source prepares `0.1.0-alpha.4` as a release candidate for exact-main qualification and immutable publication of the managed auth/device v1 client contract. Do not treat alpha.4 as released until the trusted-publishing workflow completes successfully and independent registry verification confirms the published package.

```js
import { TruynLocalNodeClient } from '@truyn/sdk';

const client = await TruynLocalNodeClient.connect({ relayUrl: 'https://relay.example' });
const receipt = await client.need('reasoning.general', { question: 'Hello' });
const result = await client.waitForResult(receipt.needId);
```

The current bounded Developer Release surface also includes authenticated relay event streaming, requester-owned direct NEED cancellation, signed generic `PARTIAL` delivery, portable object/artifact references and Agent Descriptor fetch/verify/negotiation.