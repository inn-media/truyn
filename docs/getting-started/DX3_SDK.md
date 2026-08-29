# DX-3 SDK Runtime Surface

**Status:** implemented / bounded CI-proven on `main` through PR `#378`.  
**Stable SDK API contract version:** `1`.  
**Wire protocol:** `TRUYN/1` draft.

DX-3 turns the first-party SDK/runtime path from request/response scaffolding into a usable developer surface for long-running agent work. The stable API is an SDK compatibility contract; it does not create a second protocol and it does not bypass TRUYN authorization.

## What is implemented

### JavaScript / TypeScript

- `TRUYN_SDK_STABLE_API_VERSION = "1"`;
- ordered async relay event streaming through `TruynLocalNodeClient.streamEvents()`;
- abortable SDK waits and event consumption;
- typed object payloads;
- reference-only artifact payloads with media type, byte count, SHA-256 and metadata validation;
- explicit direct-NEED cancellation through the node/runtime lifecycle;
- owner-only compact request status for asynchronous fast NEEDs through `TruynNode.compactRequestStatus(requestId)`.

### Python

- the same stable API version marker;
- cancellation token for SDK-local waits/streams;
- ordered async stream helper;
- object and artifact payload helpers with the same portable field names on the wire.

### Go / Java / C#/.NET

The portable object/artifact payload API parity slice and compiler gates are implemented. Broader first-party client parity, publication and release provenance remain open work.

## Object payload

Use object payloads when the result is structured data that is small enough to remain in the TRUYN message.

```ts
import { createObjectPayload } from '@truyn/sdk';

const output = createObjectPayload({
  answer: 42,
  sources: ['artifact://sha256/example']
});
```

Wire shape:

```json
{
  "kind": "object",
  "value": {
    "answer": 42,
    "sources": ["artifact://sha256/example"]
  }
}
```

## Artifact payload

Large binary data does not belong inside a TRUYN envelope. The SDK carries an integrity-bound reference instead.

```ts
import { createArtifactPayload } from '@truyn/sdk';

const image = createArtifactPayload({
  ref: 'artifact://sha256/4f...',
  mediaType: 'image/png',
  bytes: 84213,
  sha256: '4f...64 hex characters...',
  metadata: { width: 1024, height: 1024 }
});
```

Canonical fields:

```json
{
  "kind": "artifact",
  "ref": "artifact://...",
  "mediaType": "image/png",
  "bytes": 84213,
  "sha256": "<64 hex chars>",
  "metadata": {}
}
```

The stable payload intentionally has no credential field, provider token, private download secret, base64 body, or embedded binary bytes.

## Event and partial-result streaming

Two streaming surfaces are now distinct and implemented:

1. SDK relay-event streaming through `TruynLocalNodeClient.streamEvents()`.
2. Provider partial-result delivery through signed compact `PARTIAL` frames with stable wire type `T`.

```ts
const controller = new AbortController();

for await (const event of client.streamEvents({ signal: controller.signal })) {
  console.log(event.kind);
  if (event.kind === 'RESULT') controller.abort('result received');
}
```

Provider adapters receive `emitPartial(delta, metadata)`. The relay enforces provider/request correlation, zero-based monotonic sequence ordering, identical-retry idempotency, bounded queue/WebSocket backpressure and terminal ordering. The host-owned `partialCount` in the final RESULT is authoritative.

`PARTIAL` is a generic signed ordered delta/chunk transport. It can carry model token deltas, text chunks, progress records or other bounded deltas, but TRUYN does **not** prescribe a tokenizer or provider-specific token wire format.

## Direct NEED cancellation

Protocol/runtime cancellation is implemented for **direct NEEDs**.

The explicit helpers are:

```js
import { cancelNeed, revokeOffer } from './node/revoke.js';

await cancelNeed(node, needId, 'user_cancelled');
await revokeOffer(node, offerId, 'retired');
```

`TruynNode.revoke()` also accepts an explicit namespace:

```js
await node.revoke(needId, 'user_cancelled', { targetKind: 'need' });
```

The lifecycle guarantees are:

- only the requester that owns the NEED may cancel it;
- OFFER and NEED revocation namespaces remain explicit;
- fast NEED and signed REVOKE use the same bounded fast long-poll/WebSocket lifecycle channel;
- an open compact `waitMs > 0` waiter resolves immediately with `request_cancelled`;
- an asynchronous `waitMs=0` requester can read owner-only lifecycle state with `compactRequestStatus(requestId)`;
- the provider host aborts matching in-flight work with an `AbortSignal` and removes matching pending work before execution;
- built-in providers propagate that signal into upstream auth/inference/storage calls;
- Azure Sora and Vertex Veo additionally issue explicit bounded-retry cancellation for their persistent remote jobs;
- late RESULT/PARTIAL delivery after cancellation fails closed;
- custom adapters are cooperative: if custom provider code ignores its signal, TRUYN cannot forcibly stop that computation, but its late output is still rejected by the relay.

An independent upstream `AbortError` is **not** treated as requester cancellation unless the lifecycle signal itself is actually aborted; otherwise the provider returns a failed terminal RESULT.

Chain-stage cancellation remains explicitly unsupported. Direct NEED cancellation must not be generalized into a claim that arbitrary chain stages can be revoked.

## Runtime bounds and failure semantics

The production provider path uses the lifecycle-aware `TruynAdapterHost.start()` loop. The accepted runtime keeps:

- bounded adapter concurrency and pending work (`PROVIDER_BUSY` on overflow);
- bounded cancellation tombstones;
- bounded relay queues and WebSocket buffering;
- bounded shutdown drain even for non-cooperative custom adapters;
- recoverable restart preservation for already-dequeued work;
- visible fatal fast-loop failure through `running=false`, `lastLoopError` and transport close;
- bounded expiry for abandoned matched fast NEEDs, releasing their terminal reservation and surfacing `request_expired` through owner-only request status.

## Security invariants

All DX-3 operations preserve the existing TRUYN path:

```text
authenticate -> authorize -> billing/entitlement -> dispatch -> provider recheck
```

The SDK/runtime must never:

- turn transport authentication into TRUYN authorization;
- expand discovery visibility client-side;
- select a private provider that the relay did not authorize;
- embed credentials in object/artifact payloads;
- reinterpret cancellation metadata as provider authorization or billing responsibility;
- accept cross-request/cross-provider RESULT or PARTIAL injection;
- silently weaken bounded queue, terminal-state or correlation rules.

## Stability rule

`TRUYN_SDK_STABLE_API_VERSION` versions the public SDK surface described here. It does not declare `TRUYN/1` stable and it does not claim the packages are already published to all public registries.

Breaking changes to this SDK surface require a new stable API contract version or an explicit deprecation/migration path.
