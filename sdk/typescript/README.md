# @truyn/sdk

First-party JavaScript/TypeScript SDK for TRUYN.

```js
import { TruynLocalNodeClient } from '@truyn/sdk';

const client = await TruynLocalNodeClient.connect({ relayUrl: 'https://relay.example' });
const receipt = await client.need('reasoning.general', { question: 'Hello' });
const result = await client.waitForResult(receipt.needId);
```

This package is a **pre-stable `0.x` SDK**. `TRUYN/1` remains a draft protocol generation. Provider authorization, billing and visibility are enforced by TRUYN server/runtime policy, never by client-supplied metadata.
