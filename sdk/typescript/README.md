# TRUYN JavaScript / TypeScript SDK

**Status:** DX-1 reference core implemented in-repository; not yet published to npm and not yet stable-v1 compatible.

This directory contains the executable first-party TypeScript reference SDK. PR3 established the shared descriptor/error/discovery core, PR4 proved Python fixture parity, PR5 added the first real local-node SDK transaction, and PR6 binds the TypeScript and Python execution paths to the same shared local-node flow contract.

## Implemented

- typed `TruynClient` configuration;
- authenticated identity retrieval via existing `GET /v1/nodes/:id`;
- authorization-aware discovery via existing filtered `GET /v1/offers`;
- shared `AgentDescriptor` parsing, compatibility negotiation, canonical signing payload and Ed25519 verification;
- shared normalized error taxonomy and relay/protocol/client mappings;
- cancellation/transport/invalid-response normalization;
- shared conformance tests against `truyn.sdk-conformance/v1`;
- `TruynLocalNodeClient`, a thin SDK adapter over the existing `TruynNode` runtime for local development/E2E;
- real signed `OFFER`, `NEED`, provider event polling, `RESULT`, requester result polling and signature verification through the existing relay runtime;
- exact local-node E2E flow data shared with Python via `../conformance/v1/local-node-e2e.json`.

The SDK does **not** reconstruct hidden providers client-side. Provider visibility remains a relay authorization/policy decision.

## Remote/client core

```ts
import { TruynClient } from '@truyn/sdk';

const client = new TruynClient({
  relayUrl: 'https://relay.example',
  sessionToken: process.env.TRUYN_SESSION_TOKEN
});

const identity = await client.getIdentity('truyn:node:...');
const offers = await client.discover('reasoning.general');
const descriptor = await client.fetchAgentDescriptor(
  'https://agent.example/.well-known/truyn-agent.json'
);
```

## Local-node NEED -> RESULT

PR5 deliberately reuses the existing runtime signing, registration and relay paths instead of defining a second SDK wire implementation. PR6 keeps that implementation and moves the flow inputs/expected outputs into one language-neutral fixture consumed by both TypeScript and Python.

```ts
import { TruynLocalNodeClient } from '@truyn/sdk';

const requester = await TruynLocalNodeClient.connect({ relayUrl, name: 'Requester' });
const provider = await TruynLocalNodeClient.connect({ relayUrl, name: 'Provider' });

await provider.offer('research');
const receipt = await requester.need('research', { question: 'Why TRUYN?' });
const need = await provider.nextNeed();
await provider.result(need.needId, { answer: 'Verified agent-to-agent work.' });
const result = await requester.waitForResult(receipt.needId);
```

The TypeScript and Python repository E2E gates each use a real local relay on an ephemeral port, create two distinct identities, publish an OFFER, send a signed NEED, verify the provider-side NEED, send a signed RESULT, and verify the requester-side RESULT. Neither execution-path test uses a mocked relay transport.

## Shared contract

TypeScript and Python consume the same conformance sources:

- `../conformance/v1/sdk-contract.schema.json`
- `../conformance/v1/golden-fixtures.json`
- `../conformance/v1/agent-descriptor-runtime-fixtures.json`
- `../conformance/v1/local-node-e2e.json`
- `../conformance/reference/agent-descriptor.js`

Descriptor crypto/version semantics are not redefined inside this package.

## Runtime note

Repository tests run `.ts` sources directly on Node 22 with `--experimental-strip-types`. Publication/build packaging remains deferred; the package stays `private` so it cannot be accidentally published before the release contract exists.

## Still open

- production SDK registration/identity lifecycle APIs beyond the local-node adapter;
- richer deadlines/cancellation and streaming abstractions;
- compact-frame/WebSocket parity across SDKs;
- package build/publication and provenance.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
