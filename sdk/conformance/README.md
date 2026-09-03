# TRUYN shared SDK conformance contract

This directory is the language-neutral source of truth for shared first-party SDK contract data and the executable Developer Release conformance gates.

## Scope

The SDK program began with shared DTO/fixture mapping and later skeleton parity, but current main has progressed beyond that state. TypeScript/JavaScript, Python, Go, Java and C#/.NET now implement the bounded Developer Release relay-client semantics and are exercised by one real five-language E2E gate.

This conformance layer does **not** redefine network protocol message kinds, provider authorization, billing authority, routing behavior or D-1000 semantics. SDKs consume the existing TRUYN contracts.

The current mapping is:

| SDK surface | Existing TRUYN source | Rule |
|---|---|---|
| `Identity` | `POST /v1/register`, identity/envelope primitives | Normalize public identity facts; session tokens are not Identity. |
| `AgentDescriptor` | `spec/protocol/v1/agent-descriptor.md`; identity/protocol primitives | Validate v1, expiry, identity binding/signature and protocol/interface compatibility. |
| `Capability` | Descriptor capability IDs; runtime capability names | SDK projection only; no new authoritative wire field. |
| `Offer` | signed `OFFER`; relay offer APIs | Preserve signed provider authority and typed payload. |
| `Need` | signed `NEED`; relay NEED APIs | Preserve signed requester authority and request correlation. |
| `Result` | signed `RESULT`; relay RESULT APIs | Preserve provider/request correlation and signature verification. |
| direct cancellation | signed `REVOKE` targeting requester-owned NEED | Verify requester authority; late output fails closed. |
| `ArtifactRef` | `sdk/conformance/v1/sdk-contract.schema.json` / shared fixtures | Preserve the non-empty opaque reference string; do not reinterpret it as an inline metadata object or implicitly fetch it. |
| `ArtifactPayload` | stable SDK API-v1 artifact payload helpers | Preserve reference + media type + byte count + digest/metadata shape; no implicit remote fetch. |
| `NormalizedError` | relay/protocol/client failures | SDK-only taxonomy; never replaces wire/protocol source facts. |

## Shared source/fixture conformance

`run-conformance.mjs` checks the common language/source/fixture contract:

```bash
node sdk/conformance/run-conformance.mjs
node sdk/conformance/run-conformance.mjs --json
node sdk/conformance/run-conformance.mjs --language=go --json
node sdk/conformance/run-conformance.mjs --language=java --json
node sdk/conformance/run-conformance.mjs --language=dotnet --json
```

It validates:

- fixture-set identity and protocol generation;
- foundational DTO/source markers;
- positive/negative foundational fixture coverage and required markers;
- Agent Descriptor runtime-fixture-set linkage/identity only; this marker runner does not itself execute the Descriptor cryptographic or negotiation vectors;
- required first-party language coverage: TypeScript, Python, Go, Java and C#/.NET;
- required source files and language-specific markers;
- current public-distribution boundary.

Descriptor cryptographic/canonicalization/negotiation semantics are exercised by the dedicated reference/runtime tests and by the five-language executable Descriptor happy-path below, not by the marker runner merely loading the fixture extension.

This runner remains deliberately source/fixture oriented.

## Five-language executable Developer Release gate

`run-five-language-e2e.mjs` is the network-executable Developer Release acceptance path:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

It starts:

1. one real local TRUYN relay;
2. one HTTP Agent Descriptor fixture signed by a real ephemeral TRUYN Ed25519 identity;
3. an independent provider/requester pair in each required language.

Every language first retrieves the same signed Descriptor and must prove:

- `schema = truyn.agent-descriptor/v1`;
- supported descriptor version;
- valid expiry window;
- descriptor identity matches the trusted Ed25519 public key-derived TRUYN identity;
- signature verification over the canonical unsigned Descriptor;
- `TRUYN/1` protocol overlap;
- a supported advertised interface can be negotiated.

Then each language independently executes:

```text
register provider + requester
        ↓
authorized OFFER
        ↓
NEED
        ↓
verified provider NEED event
        ↓
RESULT
        ↓
verified requester RESULT
        ↓
second direct NEED → requester-owned signed cancellation
```

This is executable network behavior, not DTO/marker parity. The cancellation step exercises a cancellation by the owning requester; dedicated runtime negative tests, not this five-language path alone, prove non-owner rejection and the full late-output/terminal invariants.

## Canonical signed envelope

The current protocol envelope is produced by the shared protocol implementation and includes:

```text
protocol · type · id · from · to · createdAt · publicKey · payload · signature
```

`protocol` is currently `TRUYN/1`. SDKs must not fork canonical signing/correlation semantics.

## Direct cancellation and PARTIAL boundary

Requester-owned direct NEED cancellation is part of the Developer Release runtime contract and is exercised by an owning requester in the five-language E2E path. Chain-stage cancellation is not supported.

Signed generic `PARTIAL` streaming is also implemented at the runtime/protocol surface with strict request/provider correlation, zero-based monotonic sequence, identical-retry idempotency, bounded backpressure and terminal ordering.

`PARTIAL` is intentionally generic. This conformance contract does not invent a universal tokenizer, token-ID vocabulary or provider-specific token representation.

## Agent Descriptor signature contract

For the current identity-key path:

1. remove the top-level signature field(s) from the signed payload;
2. canonicalize the remaining descriptor with the TRUYN canonicalization primitive;
3. encode the canonical string as UTF-8;
4. verify Ed25519 signature material;
5. resolve/trust the participant public key outside the descriptor and require the derived node identity to match `descriptor.identity`;
6. fail closed on tampering, wrong identity, unsupported required version/interface or expiry.

A descriptor-provided key is never trusted as its own root of authenticity. Delegated Descriptor-signing keys remain outside the current alpha contract.

## Discovery and privacy boundary

Provider visibility is decided by TRUYN policy before SDK data is returned. A first-party SDK MUST NOT reconstruct hidden provider state, and a public Agent Descriptor MUST NOT become an authorization bypass.

The Developer Release serving path is disabled by default and advertises only the explicitly configured public subset of actual runtime capabilities.

## Version and interface negotiation

Unsupported required Descriptor/protocol/interface versions fail explicitly. Clients do not guess or silently promote unknown semantics.

Current v1 valid-fixture selection remains deterministic and bounded by the advertised/client-supported sets. Expired Descriptors fail by default unless an explicitly supported cache/offline policy says otherwise. Complete malformed/missing `interfaces[].endpoint` rejection and typed endpoint mapping parity across all five clients remains open and is not implied by the happy-path E2E.

## Package and release conformance

Ordinary CI builds verified distributions for npm, Python, Go, Maven and NuGet and records a source-SHA marker, coordinate/version, byte size and SHA-256 digest in the release manifest. On pull-request CI, the checkout is GitHub's synthetic merge ref while the configured `TRUYN_RELEASE_SOURCE_SHA` identifies the PR head, so the current manifest does not by itself prove exact checkout-tree provenance for PR-built bytes.

Package build/digest provenance is not the same as exact release-source binding or public registry publication. `publicDistribution=false` remains a truthful boundary until native registry publication is actually observed, and exact checked-out release source/tree binding remains a publication gate.

## Golden conformance rules

`v1/golden-fixtures.json` plus the Agent Descriptor runtime fixture extension form one logical `truyn.sdk-conformance/v1` dataset.

- foundational DTOs retain positive and negative cases;
- private capability/provider non-disclosure and version mismatch remain shared behavior rules;
- Descriptor runtime cases include signature verification, canonical bytes, tamper/wrong-key rejection, expiry, malformed input and compatibility negotiation;
- error normalization remains an SDK projection and cannot alter wire responses;
- all required languages must converge on the same semantic/security outcome.

The dataset containing those cases is broader than what `run-conformance.mjs` executes directly; dedicated tests/reference verifier and the five-language runtime path provide the executable evidence for the applicable Descriptor semantics.

## Key files

- `languages.json` — five-language source/marker/distribution manifest.
- `run-conformance.mjs` — shared source/fixture marker contract runner.
- `run-five-language-e2e.mjs` — executable five-language Developer Release relay/Descriptor/NEED/RESULT/cancellation gate.
- `v1/sdk-contract.schema.json` — language-neutral contract schema.
- `v1/golden-fixtures.json` — foundational shared DTO/behavior/error fixtures.
- `v1/agent-descriptor-runtime-fixtures.json` — cryptographic/negotiation fixture extension.
- `reference/agent-descriptor.js` — reference Descriptor parser/validator/verification semantics.

The historical DX-1/DX-2 skeleton descriptions are retained only in Git history/changelog. They are not current maturity claims.
