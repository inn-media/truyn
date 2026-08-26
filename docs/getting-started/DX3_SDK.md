# DX-3 SDK Runtime Surface

**Status:** implementation in progress.  
**Stable SDK API contract version:** `1`.  
**Wire protocol:** `TRUYN/1` draft.

DX-3 turns the first-party SDKs from request/response scaffolding into a usable developer surface for long-running agent work. The stable API is an SDK compatibility contract; it does not create a second protocol and it does not bypass TRUYN authorization.

## What is implemented in this slice

### JavaScript / TypeScript

- `TRUYN_SDK_STABLE_API_VERSION = "1"`;
- ordered async streaming primitive;
- `TruynLocalNodeClient.streamEvents()` over the authenticated relay event path;
- `AbortSignal` cancellation for SDK waits and event streams;
- typed object payloads;
- reference-only artifact payloads with media type, byte count, SHA-256 and metadata validation.

### Python

- the same stable API version marker;
- cancellation token;
- ordered async stream helper;
- object and artifact payload helpers with the same field names on the wire.

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

## Event streaming

The TypeScript local-node client exposes an async event stream over the same authenticated relay event path used by polling:

```ts
const controller = new AbortController();

for await (const event of client.streamEvents({ signal: controller.signal })) {
  console.log(event.kind);
  if (event.kind === 'RESULT') controller.abort('result received');
}
```

This slice provides **event streaming**, not token-delta generation streaming. A provider must not advertise token/chunk streaming until a canonical TRUYN wire contract for partial results exists and the security/correlation tests cover it.

## Cancellation semantics

Cancellation in this slice is deliberately precise:

- cancelling an SDK wait/stream returns normalized `cancelled` behavior;
- an already-cancelled operation does not perform another relay poll;
- cancellation does **not yet revoke an in-flight NEED at the provider**;
- the existing `REVOKE` wire operation must not be misused to pretend remote NEED cancellation exists.

Protocol-level provider cancellation is a separate DX-3 subtask. It requires requester-authority checks, provider delivery, deterministic request lifecycle state, and rejection of late/cross-request results before it can be advertised as supported.

## Security invariants

All DX-3 operations preserve the existing TRUYN path:

```text
authenticate -> authorize -> billing/entitlement -> dispatch -> provider recheck
```

The SDK must never:

- turn transport authentication into TRUYN authorization;
- expand discovery visibility client-side;
- select a private provider that the relay did not authorize;
- embed credentials in object/artifact payloads;
- reinterpret an AbortSignal as provider authorization or billing responsibility.

## Stability rule

`TRUYN_SDK_STABLE_API_VERSION` versions the public SDK surface described here. It does not declare `TRUYN/1` stable and it does not claim the packages are already published to public registries.

Breaking changes to this SDK surface require a new stable API contract version or an explicit deprecation/migration path.
