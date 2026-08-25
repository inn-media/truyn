# TRUYN JavaScript / TypeScript SDK

**Status:** DX-1 reference core implemented in-repository; not yet published to npm and not yet stable-v1 compatible.

This directory contains the first executable first-party TRUYN SDK surface. PR3 intentionally implements only the minimum core required to establish TypeScript behavior before Python parity.

## Implemented in DX-1 PR3

- typed `TruynClient` configuration;
- authenticated identity retrieval via the existing `GET /v1/nodes/:id` relay API;
- authorization-aware capability discovery via the existing filtered `GET /v1/offers` relay API;
- shared `AgentDescriptor` parsing, compatibility negotiation, canonical signing payload and Ed25519 verification by delegating to the PR2 conformance runtime;
- descriptor retrieval that can resolve the descriptor identity key through the existing relay identity surface;
- shared normalized error taxonomy and representative relay/protocol/client mappings;
- cancellation/transport/invalid-response normalization;
- conformance tests against the exact shared `truyn.sdk-conformance/v1` fixture set.

The package does **not** reconstruct hidden providers client-side. Provider visibility remains a relay authorization/policy decision.

## Current API

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

The Descriptor path above is fetched from the target participant. PR3 does not add a new relay endpoint.

## Shared contract

TypeScript consumes the same sources that Python must consume in PR4:

- `../conformance/v1/sdk-contract.schema.json`
- `../conformance/v1/golden-fixtures.json`
- `../conformance/v1/agent-descriptor-runtime-fixtures.json`
- `../conformance/reference/agent-descriptor.js`

Descriptor crypto/version semantics are not redefined inside this package. The TypeScript wrapper calls the shared PR2 reference implementation directly.

## Runtime note

Repository tests run the `.ts` sources directly on Node 22 with `--experimental-strip-types`. Publication/build packaging is deliberately deferred to DX-3; this package remains `private` so it cannot be accidentally published before the release contract exists.

## Still open after PR3

- Python parity against the same exact fixture set (PR4);
- `OFFER` publish/revoke;
- `NEED` / `RESULT` core path;
- deadline helpers beyond `AbortSignal` propagation;
- streaming/polling abstractions;
- package build/publication and provenance.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
