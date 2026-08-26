# TRUYN SDK and Developer Experience Architecture

**Status:** architecture + partially implemented first-party SDK program.  
**Snapshot:** 2026-08-27  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`  
**Protocol:** `TRUYN/1` draft

The old “SDK scaffolding only” status is obsolete. TypeScript/JavaScript and Python reference clients are implemented in bounded form, and DX-3 is merged. The five-language stable/publication target is not complete.

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
publish OFFER / submit NEED / receive RESULT
    ↓
consume references/events/provenance safely
```

SDKs are clients of TRUYN; they do not redefine TRUYN and are never authorization bypasses.

## Required first-party SDK matrix

| Language | Repository target | Publication target | Current state |
|---|---|---|---|
| TypeScript / JavaScript | `sdk/typescript/` | npm | **Implemented bounded reference client; DX-3 API-v1 primitives merged** |
| Python | `sdk/python/` | PyPI | **Implemented bounded reference client; DX-3 API-v1 primitives merged** |
| Go | `sdk/go/` | Go module | **Incomplete / parity target** |
| Java | `sdk/java/` | Maven-compatible | **Incomplete / parity target** |
| C# / .NET | `sdk/dotnet/` | NuGet | **Incomplete / parity target** |
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
Result
ObjectRef / ArtifactRef
Event / stream
Claim / Attest / TrustReceipt where supported
Error / status taxonomy
Compatibility metadata
```

An SDK must preserve provider authorization, billing, correlation and integrity semantics; it cannot manufacture authority from application-supplied fields.

## Current TypeScript/Python bounded surface

Current main includes the accepted earlier client/conformance slices plus merged DX-3 (PR `#373`). DX-3 adds:

- stable API-v1 primitives for TypeScript/Python within the current pre-stable repository contract;
- authenticated relay event streaming;
- abortable local waits/event consumption;
- reference-only object/artifact payload representation;
- conformance markers;
- developer-site source for the exposed developer workflow.

“API-v1” here identifies the bounded SDK surface implemented by DX-3. It does **not** mean TRUYN/1, all SDK packages or the public ecosystem have reached stable-v1 compatibility.

## Cancellation boundary

Abortable local waits/event streams and remote provider execution cancellation are different semantics.

Current factual state:

```text
cancel local SDK wait / stop consuming event stream    implemented bounded behavior
cancel a remote provider-side NEED/execution           NOT implemented
```

A client cancel signal must not be documented as remote side-effect cancellation until the network/provider protocol and runtime can prove that behavior exactly once/fail closed.

## Streaming boundary

Current DX-3 event streaming is authenticated relay/event delivery. **Token-delta/model-output streaming is not implemented.** A future token/partial-result stream must define correlation, ordering, integrity, backpressure, terminal/error semantics and cancellation behavior before it can be claimed.

## Object/artifact references

SDK payloads should prefer references for large/immutable data rather than forcing large binary content into request envelopes.

The accepted reference boundary must preserve:

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
- authorization/error semantics;
- deadline/timeout behavior;
- object/artifact references;
- event ordering/terminal behavior where supported;
- protocol/software/SDK compatibility metadata;
- explicit failure for unsupported semantics.

The TypeScript/Python bounded conformance evidence does not satisfy Go/Java/.NET parity.

## Security invariants

SDKs MUST NOT:

- bypass provider visibility/access/billing gates;
- treat remote A2A/MCP metadata as TRUYN authority;
- serialize provider credentials into TRUYN network payloads;
- automatically fetch arbitrary artifact URLs;
- silently retry/fallback in a way that duplicates provider-side execution;
- claim remote cancellation when only the local wait was aborted;
- guess unknown required protocol semantics.

## Developer documentation/site

DX-3 introduces developer-site source for the current bounded API. External documentation must match the same factual status as repository docs: implemented TypeScript/Python surface, no remote provider cancellation/token-delta claim, no universal stable-v1 statement.

## Remaining SDK/DX gates

- [ ] remote provider-side NEED cancellation semantics;
- [ ] token-delta / partial-result streaming contract and implementation;
- [ ] complete native Agent Descriptor serving/discovery lifecycle;
- [ ] Go parity;
- [ ] Java parity;
- [ ] C#/.NET parity;
- [ ] required package publication and release provenance;
- [ ] shared five-language conformance gate;
- [ ] stable compatibility/migration policy.

See `IMPLEMENTATION_STATUS.md` for repository-wide current status and `../../ROADMAP.md` for sequencing.
