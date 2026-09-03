# DX-3 SDK Runtime Surface

**Status:** DX-3 runtime/API core implemented and extended by the merged Developer Release Layer.  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`.  
**Stable SDK API contract version:** `1`.  
**Wire protocol:** `TRUYN/1` draft.

DX-3 moved the first-party SDK/runtime path from request/response scaffolding into a usable developer surface for long-running agent work. The later Developer Release Layer completed bounded five-language relay-client parity, executable conformance and package build/provenance around that runtime core. Agent Descriptor serving/fetch/signature happy paths are implemented, while automatic Descriptor refresh and complete usable-interface validation/mapping parity remain open as described below.

The stable SDK API is a compatibility contract for this developer surface. It does not create a second protocol, bypass TRUYN authorization or declare `TRUYN/1` stable.

## What is implemented

### Five required first-party clients

TypeScript/JavaScript, Python, Go, Java and C#/.NET implement the bounded Developer Release relay-client semantics and share one executable E2E conformance path.

The common proven client contract includes:

- local Ed25519 identity creation;
- signed envelope generation and received-event verification;
- relay registration/authenticated session use;
- authorization-aware discovery;
- OFFER / NEED / RESULT flows;
- requester-side direct NEED cancellation calls;
- portable object/artifact references;
- normalized fail-closed errors;
- Agent Descriptor fetch/signature/expiry happy-path handling against the common fixture.

### JavaScript / TypeScript runtime surface

- `TRUYN_SDK_STABLE_API_VERSION = "1"`;
- ordered async relay event streaming through `TruynLocalNodeClient.streamEvents()`;
- abortable SDK waits and event consumption;
- typed object payloads;
- reference-only artifact payloads with media type, byte count, SHA-256 and metadata validation;
- explicit direct-NEED cancellation through the node/runtime lifecycle;
- owner-only compact request status for asynchronous fast NEEDs through `TruynNode.compactRequestStatus(requestId)`.

### Python runtime surface

- the same stable API version marker;
- cancellation token for SDK-local waits/streams;
- ordered async stream helper;
- object and artifact payload helpers with the same portable field names on the wire.

### Go / Java / C#/.NET

These are no longer skeleton-only or payload-only parity targets. The Developer Release Layer implements real relay clients in all three languages, including identity/signing, relay registration/session use, discovery, OFFER/NEED/RESULT, direct NEED cancellation calls and Agent Descriptor retrieval/verification against the accepted valid fixture, and exercises them in the shared five-language executable gate.

Native public registry publication remains separate from client implementation. Complete malformed-interface validation/mapping parity is also separate from the valid-fixture happy path.

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

The stable payload intentionally has no credential field, provider token, private download secret, base64 body or embedded binary bytes.

## Event and partial-result streaming

Two streaming surfaces are distinct and implemented:

1. SDK relay-event streaming for long-running consumers.
2. Provider partial-result delivery through signed compact `PARTIAL` frames with stable wire type `T`.

Provider adapters receive `emitPartial(delta, metadata)`. The relay enforces provider/request correlation, zero-based monotonic sequence ordering, identical-retry idempotency, bounded queue/WebSocket backpressure and terminal ordering. The host-owned `partialCount` in the final RESULT is authoritative.

`PARTIAL` is a generic signed ordered delta/chunk transport. It can carry model token deltas, text chunks, progress records or other bounded deltas, but TRUYN does **not** prescribe a tokenizer or provider-specific token wire format.

## Direct NEED cancellation

Protocol/runtime cancellation is implemented for **direct NEEDs**, but waiter behavior must be stated precisely.

The bounded compact lifecycle guarantees are:

- only the requester that owns the NEED may authorize its cancellation at the relay/runtime boundary;
- OFFER and NEED revocation namespaces remain explicit;
- an open compact `waitMs > 0` waiter resolves immediately with terminal `request_cancelled`;
- an asynchronous compact `waitMs=0` requester can read owner-only lifecycle state through `TruynNode.compactRequestStatus(requestId)`;
- provider hosts remove matching pending work where possible and abort matching in-flight work where the runtime exposes a cancellation signal;
- built-in providers propagate cancellation into upstream work where supported;
- late RESULT/PARTIAL delivery after cancellation fails closed;
- custom adapters are cooperative if their own code ignores cancellation.

The legacy/general SDK `waitForResult` path is **not** guaranteed to be interrupted by `/v1/revoke`; a waiter on that path may continue until a normal result or timeout. The five-language E2E exercises cancellation from the owning requester but does not by itself prove non-owner rejection or every terminal cancellation invariant in every client.

Chain-stage cancellation remains explicitly unsupported. Direct NEED cancellation must not be generalized into a claim that arbitrary chain stages can be revoked.

## Agent Descriptor status

The bounded public Descriptor primitives and valid-fixture client path are implemented:

- runtime serving at `/.well-known/truyn-agent.json` is disabled by default and requires explicit opt-in;
- advertised public capability classes are an explicit allowlisted subset of actual runtime capabilities;
- the Descriptor is signed with the current TRUYN identity key and carries bounded `issuedAt`/`expiresAt` validity;
- all five required SDK languages fetch the accepted signed fixture, check its supported schema/version/expiry and identity-key signature, and select a mutually supported protocol/interface type.

Two lifecycle/parity gaps remain open and must not be hidden by the happy-path conformance claim:

1. `runtime/service.js` creates the public Descriptor once at provider startup. It is not automatically re-signed/refreshed before `expiresAt`, so a long-running provider can keep serving an expired Descriptor until restart.
2. Go/Java/.NET do not yet all reject an advertised interface that has a supported `type` but no usable non-empty `endpoint`; Go/.NET typed endpoint mapping is also not fully aligned with the schema. Therefore complete usable-interface negotiation parity is not yet accepted.

A Descriptor never grants provider authorization. Delegated Descriptor-signing keys are not supported in the current alpha profile.

## Five-language executable gate

From the repository root:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

The gate starts one real local relay and one valid signed Descriptor fixture, then runs independent provider/requester flows in TypeScript, Python, Go, Java and .NET through Descriptor happy-path verification, OFFER, NEED, RESULT and a second direct NEED cancellation initiated by the owner. Dedicated negative/lifecycle regressions remain authoritative for properties the runner does not attempt.

## Package build and provenance

Ordinary CI builds consumer **verification artifacts** for npm, PyPI, Go, Maven and NuGet. The manifest records the exact source SHA, coordinate/version, byte size and SHA-256 digest for each CI build.

Ordinary CI currently rebuilds the nominal `0.1.0-alpha.1` package line on different PR/main source SHAs, so those CI outputs are not an immutable published release merely because they carry per-build provenance. A public/accepted release must bind an immutable version to one frozen/tagged source (or use a distinct version for different source) before publication is claimed.

This is a build/verification fact, not a public registry publication claim. Native registry publication and live public developer-site activation remain external release/evidence gates.

## Runtime bounds and failure semantics

The production provider path uses the lifecycle-aware adapter host. The accepted runtime keeps bounded concurrency/pending work, cancellation tombstones, relay queues/WebSocket buffering, shutdown drain and abandoned-request expiry, and exposes fatal fast-loop failure to the supervisor.

## Security invariants

All SDK/runtime operations preserve the existing TRUYN path:

```text
authenticate -> authorize -> billing/entitlement -> dispatch -> provider recheck
```

The SDK/runtime must never:

- turn transport authentication into TRUYN authorization;
- expand discovery visibility client-side;
- select a private provider that the relay did not authorize;
- embed credentials in object/artifact payloads or Descriptors;
- reinterpret cancellation or Descriptor metadata as provider authorization/billing authority;
- accept cross-request/cross-provider RESULT or PARTIAL injection;
- silently weaken bounded queue, terminal-state or correlation rules.

## Stability and release boundary

`TRUYN_SDK_STABLE_API_VERSION` versions the bounded public SDK surface described here. It does not declare `TRUYN/1` stable and it does not claim that the alpha packages are already available from all public registries.

Remaining release/lifecycle gates include:

- automatic Descriptor refresh/re-signing plus complete usable-interface validation/mapping parity;
- immutable native public package publication with observed provenance;
- live public developer-site activation/liveness evidence.

Optional later contracts include chain-stage cancellation, standardized cross-provider tokenizer semantics and delegated Descriptor-signing keys.
