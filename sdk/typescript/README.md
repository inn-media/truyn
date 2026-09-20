# @truyn/sdk

First-party JavaScript/TypeScript SDK for TRUYN.

**Status:** implemented Developer Release client. The latest accepted immutable public npm prerelease remains `@truyn/sdk@0.1.0-alpha.2`; the current source is versioned `0.1.0-alpha.4` for exact-main qualification and a future immutable publication of the managed auth/device v1 client contract. `0.1.0-alpha.4` is a source/release-candidate coordinate only and must not be described as released until the trusted-publishing workflow and independent public-registry verification complete successfully.

```js
import { TruynLocalNodeClient } from '@truyn/sdk';

const client = await TruynLocalNodeClient.connect({ relayUrl: 'https://relay.example' });
const receipt = await client.need('reasoning.general', { question: 'Hello' });
const result = await client.waitForResult(receipt.needId);