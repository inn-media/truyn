# DX-3 SDK Runtime Surface

**Status:** runtime/API core implemented and extended by the Developer Release Layer.  
**Documentation audit:** 2026-09-23  
**Stable SDK API contract:** `1`  
**Wire protocol:** `TRUYN/1` draft

DX-3 is no longer scaffolding. TypeScript/JavaScript, Python, Go, Java and C#/.NET implement bounded relay-client semantics and participate in shared executable conformance.

## Implemented client surface

The common proven client contract includes:

- local Ed25519 identity creation;
- signed envelope generation and received-event verification;
- relay registration/authenticated session use;
- authorization-aware discovery;
- OFFER / NEED / RESULT flows;
- direct requester-owned NEED cancellation;
- ordered relay-event streaming;
- reference-oriented object/artifact payloads;
- normalized fail-closed errors;
- Agent Descriptor fetch/schema/expiry/signature validation and compatible-interface selection.

TypeScript/JavaScript additionally exposes the reference stable API marker and lifecycle helpers used by the runtime; the other required languages implement the same bounded wire/security semantics idiomatically.

## Streaming

Two distinct surfaces are implemented:

1. SDK relay-event streaming for long-running consumers;
2. signed compact `PARTIAL` frames for provider partial results.

`PARTIAL` enforces correlation, zero-based monotonic ordering, identical-retry idempotency, bounded backpressure and terminal ordering. It is a generic chunk/delta transport, not a universal provider tokenizer.

## Direct NEED cancellation

Direct/compact NEED cancellation is implemented and requester-authorized. Pending/in-flight provider work is cancelled where the runtime/provider supports it; late RESULT/PARTIAL after terminal cancellation fails closed.

Bounds that remain important:

- local wait cancellation and remote execution cancellation are different operations;
- the legacy/general `waitForResult` path is not guaranteed to be interrupted by `/v1/revoke`;
- arbitrary chain-stage cancellation remains unsupported.

## Object / artifact payloads

Object results can remain in the envelope. Large media/binary results use references with integrity metadata rather than embedded arbitrary bytes/base64 or credentials.

Canonical artifact fields remain reference-oriented (`ref`, `mediaType`, `bytes`, `sha256`, metadata).

## Agent Descriptor status

Public Descriptor serving at `/.well-known/truyn-agent.json` is disabled by default and requires explicit opt-in. The served document is signed by the current TRUYN identity key, bounded by TTL and filtered to an explicit public capability subset.

### Current lifecycle

The previous startup-only limitation is closed. Open-1.0 **S102** added bounded automatic refresh/re-sign before expiry, preserving identity binding, TTL, public-capability filtering and signature correctness. Regression coverage is in `tests/agent-descriptor-refresh.test.js`.

Still open is **complete usable-interface parity**: every language must consistently reject malformed/missing usable endpoints and expose aligned typed endpoint mapping. The valid-fixture happy path does not by itself prove every negative interface case.

Descriptor metadata never creates provider authorization or billing authority.

## Five-language executable gate

From the repository root:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

The gate runs real local relay/provider/requester flows plus signed Descriptor verification for all five required languages. Dedicated negative/lifecycle tests remain authoritative for properties not covered by the common runner.

## Public release state

Accepted immutable prereleases:

- npm `@truyn/sdk@0.1.0-alpha.2`;
- PyPI `truyn-sdk==0.1.0a1`;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`.

Implemented but public registry publication still open:

- Maven `org.truyn:truyn-sdk:0.1.0-alpha.1`;
- NuGet `Truyn.Sdk 0.1.0-alpha.1`.

CI package builds are verification artifacts tied to their source SHA; they are not registry publication proof.

## Security invariants

All SDK/runtime operations preserve the same server-side path:

```text
authenticate → authorize → billing/entitlement → dispatch → provider recheck
```

SDKs/Descriptors must not expand discovery visibility, create provider authorization, embed upstream credentials, bypass cancellation/correlation rules or turn transport authentication into authority.

## Remaining DX closure

- complete usable-interface validation/mapping parity;
- Maven Central and NuGet public publication evidence;
- generated-package byte-content leakage scanning closure;
- live public developer-site activation/liveness evidence.

Stable SDK API contract `1` does not declare stable `TRUYN/1` or stable mainnet.
