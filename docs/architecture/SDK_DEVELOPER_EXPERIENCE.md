# TRUYN SDK and Developer Experience Architecture

**Status:** implemented bounded first-party SDK/runtime program with remaining parity/publication gates.  
**DX-3 synchronized through:** `main@ef61e4876617aa4099b5ddbdbbf3f24b1e6e7fcd` / PR `#378`.  
**Protocol:** `TRUYN/1` draft

The old “SDK scaffolding only” and “local cancellation only” descriptions are obsolete. TypeScript/JavaScript and Python reference clients are implemented in bounded form; the portable object/artifact payload slice is aligned across TypeScript, Python, Go, Java and C#/.NET; and the direct-NEED cancellation/PARTIAL runtime lifecycle is merged. Full five-language client parity, publication and stable ecosystem compatibility remain open.

## Target developer experience

```text
install SDK
    ↓
configure/connect to a TRUYN node/gateway
    ↓
load/verify supported identity/descriptor information
    ↓
discover authorized capabilities
    ↓
publish OFFER / submit NEED / receive PARTIAL* / RESULT
    ↓
consume references/events/provenance safely
```

`PARTIAL*` is available for direct fast NEED runtime streaming where supported. SDKs are clients of TRUYN; they do not redefine TRUYN and are never authorization bypasses.

## Required first-party SDK matrix

| Language | Repository target | Publication target | Current state |
|---|---|---|---|
| TypeScript / JavaScript | `sdk/typescript/` | npm | **Implemented bounded reference client; stable API-v1 primitives and DX-3 runtime surface** |
| Python | `sdk/python/` | PyPI | **Implemented bounded reference client; stable API-v1 primitives** |
| Go | `sdk/go/` | Go module | **Portable object/artifact payload parity slice + compiler gate implemented; broader client parity/publication open** |
| Java | `sdk/java/` | Maven-compatible | **Portable object/artifact payload parity slice + compiler gate implemented; broader client parity/publication open** |
| C# / .NET | `sdk/dotnet/` | NuGet | **Portable object/artifact payload parity slice + compiler gate implemented; broader client parity/publication open** |
| Rust | `sdk/rust/` | optional | optional secondary track |

All first-party SDK code is Apache-2.0 and subject to repository NOTICE/DCO/conformance requirements.

## Common logical SDK surface

The long-term common contract is:

```text
Client / NodeConnection
Identity
AgentDescriptor
Capability
Offer
Need
Partial / Result
ObjectRef / ArtifactRef
Event / stream
Claim / Attest / TrustReceipt where supported
Error / status taxonomy
Compatibility metadata
```

An SDK must preserve provider authorization, billing, correlation and integrity semantics; it cannot manufacture authority from application-supplied fields.

## Accepted DX-3 slices

The accepted DX-3 program is cumulative:

- PR `#373` — stable API-v1 primitives for TypeScript/Python, authenticated relay event streaming, abortable SDK-local waits/event consumption, portable object/artifact payloads and developer-site source;
- PR `#374` — portable object/artifact payload API alignment and compiler gates across Go/Java/.NET in addition to TypeScript/Python;
- PR `#378` — direct NEED cancellation, signed ordered PARTIAL runtime streaming, provider AbortSignal propagation, bounded provider work/backpressure/shutdown and explicit terminal lifecycle semantics.

“API-v1” identifies the bounded SDK surface. It does **not** mean TRUYN/1, all SDK packages or the public ecosystem have reached stable-v1 compatibility.

## Cancellation boundary

Local SDK cancellation and remote execution cancellation remain distinct, but both now exist in bounded form.

```text
cancel local SDK wait / stop consuming event stream    implemented bounded behavior
cancel requester-owned direct NEED                     implemented / CI-proven bounded lifecycle
cancel arbitrary chain stage                           NOT supported
```

For a direct NEED:

- requester authority is checked at the relay;
- OFFER and NEED revocation namespaces are explicit;
- signed fast REVOKE uses the same bounded fast long-poll/WebSocket lifecycle channel as fast NEED work;
- provider pending work can be removed before execution and in-flight work receives an `AbortSignal`;
- built-in providers propagate the signal into upstream operations;
- persistent Azure Sora / Vertex Veo jobs receive explicit bounded-retry remote cancellation;
- a custom adapter that ignores its signal may continue computing, but late RESULT/PARTIAL output is rejected fail closed;
- cancellation never grants provider authorization or changes billing responsibility.

An independent upstream `AbortError` is a provider failure unless the lifecycle signal itself is actually aborted.

## Streaming boundary

There are two implemented streaming concepts:

1. authenticated relay/event streaming for SDK consumers;
2. signed compact `PARTIAL` delivery for provider partial results.

The accepted PARTIAL contract provides:

- stable compact wire type `T`;
- provider/request correlation and signature verification;
- strict zero-based monotonic sequence;
- idempotent identical retry of the last acknowledged PARTIAL;
- bounded relay/WebSocket backpressure without sequence advancement on rejected delivery;
- ordered terminal RESULT behind accepted partials;
- host-authoritative `partialCount`;
- fail-closed post-terminal/cross-provider/cross-request delivery.

`PARTIAL` is intentionally a **generic ordered delta/chunk** contract. It can transport model token deltas, but TRUYN does not prescribe a tokenizer, token identifier format or cross-provider tokenization convention. A future compatibility layer may standardize such conventions without changing the current factual claim that generic partial-result streaming is implemented.

## Asynchronous fast request lifecycle

A compact NEED submitted with `waitMs=0` can be observed through the requester-owned status path:

```text
GET /v1/fast/requests/:id
TruynNode.compactRequestStatus(requestId)
```

The relay authorizes the requester against request ownership before returning bounded lifecycle metadata. Abandoned matched fast NEEDs expire to terminal `failed / request_expired`, release their reserved terminal capacity and reject late output.

## Runtime bounds and supervision

`TruynAdapterHost.start()` is the production lifecycle path. The accepted runtime includes:

- bounded adapter concurrency and pending work, with `PROVIDER_BUSY` overflow;
- bounded cancellation tombstones;
- bounded relay event queues and WebSocket buffering;
- bounded shutdown drain for non-cooperative adapters;
- recoverable preservation/requeue of already-dequeued work;
- fatal fast-loop visibility through `running=false`, `lastLoopError` and transport close;
- terminal reservation/backpressure and bounded request expiry.

These are reference/runtime guarantees, not a claim that every external provider SDK itself is cancellable or implements the same internal scheduler.

## Object/artifact references

SDK payloads should prefer references for large/immutable data rather than forcing large binary content into request envelopes.

The accepted reference boundary preserves:

- content identity/integrity metadata where required;
- no implicit remote URL fetch;
- no secret-bearing URL leakage;
- provider authorization independent from reference visibility;
- bounded materialization behavior;
- provenance preserved through results.

This aligns with the accepted C6 A2A artifact-integrity rules without making A2A objects native TRUYN wire primitives.

## TRUYN Agent Descriptor

The TRUYN Agent Descriptor remains a draft native self-description/bootstrap contract. Parser/verifier conformance exists for accepted slices, but a complete production serving/discovery/signature/expiry lifecycle is not yet implemented end to end.

Target public location remains:

```text
https://<domain>/.well-known/truyn-agent.json
```

A public Descriptor may contain only intentionally public interfaces/capability classes. It never grants access to a provider and must not expose credentials, private providers, privileged allowlists or secret-bearing URLs.

Descriptor and dynamic `OFFER` remain separate:

| Concern | Agent Descriptor | OFFER |
|---|---|---|
| bootstrap/self-description | yes | no |
| dynamic availability/capacity | no | yes |
| dynamic conditions/price | no | yes |
| grants provider authorization | never | never by itself; policy still decides |
| stable protocol/interface hints | yes | secondary |

## Conformance

First-party SDKs must converge on shared semantic fixtures rather than language-specific interpretations. Conformance should cover at minimum:

- identity and capability representation;
- NEED submission / RESULT correlation;
- direct NEED cancellation authority and terminal behavior where supported;
- PARTIAL ordering/idempotency/backpressure/terminal behavior where supported;
- authorization/error semantics;
- deadline/timeout behavior;
- object/artifact references;
- protocol/software/SDK compatibility metadata;
- explicit failure for unsupported semantics such as chain-stage cancellation.

Portable payload parity across five languages does not yet prove full five-language client/runtime parity.

## Security invariants

SDKs MUST NOT:

- bypass provider visibility/access/billing gates;
- treat remote A2A/MCP metadata or transport authentication as TRUYN authority;
- serialize provider credentials into TRUYN network payloads;
- automatically fetch arbitrary artifact URLs;
- silently retry/fallback in a way that duplicates provider-side execution;
- confuse local wait cancellation with remote direct-NEED cancellation;
- generalize direct NEED cancellation to unsupported chain-stage cancellation;
- accept cross-request/cross-provider RESULT or PARTIAL injection;
- guess unknown required protocol semantics.

## Developer documentation/site

External developer documentation must match this factual boundary: direct NEED cancellation and generic PARTIAL streaming are implemented bounded semantics; custom provider cancellation is cooperative; chain-stage cancellation is unsupported; tokenization format is not standardized; and no universal stable-v1/package-publication claim is made.

## Remaining SDK/DX gates

- [ ] complete native Agent Descriptor serving/discovery lifecycle;
- [ ] broader Go first-party client parity;
- [ ] broader Java first-party client parity;
- [ ] broader C#/.NET first-party client parity;
- [ ] required package publication and release provenance;
- [ ] shared five-language client/runtime conformance gate;
- [ ] stable compatibility/migration policy;
- [ ] optional standardized cross-provider token-delta/tokenizer conventions beyond generic `PARTIAL`;
- [ ] chain-stage cancellation only if/when a separate bounded protocol contract is defined and proven.

See `IMPLEMENTATION_STATUS.md` for repository-wide current status and `../../ROADMAP.md` for sequencing.
