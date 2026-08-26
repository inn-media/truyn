# TRUYN shared SDK conformance contract

This directory is the language-neutral source of truth for SDK DTO shape and golden conformance data used by the first-party SDKs.

## Scope

DX-1 mapped the SDK surface to contracts that already exist in the repository. DX-2 added a unified multi-language runner and skeleton parity for Go, Java and C#/.NET. DX-3 pins the stable SDK API surface for streaming, cancellation and object/artifact payloads.

This layer **does not add network endpoints, protocol message types, routing behavior, provider policy, authorization rules, public package publication, or D-1000 behavior**.

The current mapping is:

| SDK surface | Existing TRUYN source | Rule |
|---|---|---|
| `Identity` | `POST /v1/register`, `GET /v1/nodes/:id`, `IDENTITY` envelope | Normalize the public identity facts already returned by the relay. Session tokens are not part of `Identity`. |
| `AgentDescriptor` | `spec/protocol/v1/agent-descriptor.md`; `core/identity/index.js`; `core/protocol/index.js` | Parse/validate v1, negotiate compatibility and verify identity-bound Ed25519 signatures with the existing TRUYN canonicalization primitive. |
| `Capability` | Agent Descriptor `capabilities[].id`; runtime `payload.capability.name` | SDK logical projection only. It does not introduce a new wire field. |
| `Offer` | signed `OFFER` envelope; `POST/GET /v1/offers` | Preserve the canonical signed envelope and typed OFFER payload. |
| `Need` | signed `NEED` envelope; `POST /v1/needs` | Preserve the canonical signed envelope and typed NEED payload. |
| `Result` | signed `RESULT` envelope; `POST /v1/results` | Preserve the canonical signed envelope and typed RESULT payload. |
| `ArtifactRef` | existing opaque content/context references | Keep the reference opaque and portable. |
| `ArtifactPayload` | SDK object/artifact payload contract | Stable SDK DTO for `uri`, `inline` and `bytes` payloads. Does not alter current relay wire storage. |
| `NeedRequest` | SDK high-level request contract | Stable SDK request wrapper for capability, input, artifacts and metadata. |
| `ResultResponse` | SDK high-level response contract | Stable SDK response wrapper for output, artifacts and metadata. |
| `StreamEvent` | SDK streaming contract | Stable ordered event shape for `started`, `delta`, `artifact`, `result`, `error`, `completed` and `cancelled`. |
| `NormalizedError` | relay HTTP error body, protocol verification reasons, client timeout/transport/cancellation failures | SDK-only stable taxonomy with optional raw source details. It never replaces the relay/protocol error on the wire. |

## Unified runner

The runner checks the shared fixture-set and every required first-party SDK target from one place:

```bash
node sdk/conformance/run-conformance.mjs
node sdk/conformance/run-conformance.mjs --json
node sdk/conformance/run-conformance.mjs --language=go --json
node sdk/conformance/run-conformance.mjs --language=java --json
node sdk/conformance/run-conformance.mjs --language=dotnet --json
```

It validates:

- fixture-set identity and protocol generation;
- foundational DTOs in `v1/sdk-contract.schema.json` plus DX-3 stable API DTO markers;
- positive and negative DTO fixture coverage in `v1/golden-fixtures.json`;
- the Agent Descriptor runtime fixture-set extension;
- required first-party language coverage: TypeScript, Python, Go, Java and C#/.NET;
- required source files and language-specific markers;
- streaming/cancellation/artifact payload stable API markers;
- private/internal status before stable package publication.

The runner is intentionally source/fixture based. It does not publish packages, call cloud providers, start relays or mutate runtime state.

## Canonical signed envelope

The current MVP envelope is produced by `core/protocol/index.js` and contains:

```text
protocol · type · id · from · to · createdAt · publicKey · payload · signature
```

`protocol` is currently `TRUYN/1`. `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE` are the current MVP envelope types.

## DX-3 stable API rules

- Streaming preserves transport order and exposes SDK events as `StreamEvent` values.
- Cancellation is caller-owned and idiomatic per language: `AbortSignal`, `CancellationToken`, `context.Context`, Java async cancellation or .NET `CancellationToken`.
- Object/artifact payloads are represented by `ArtifactPayload` with `kind`, `contentType` and one of `uri` or encoded `data` depending on payload kind.
- SDK helper functions may be idiomatic, but DTO names and semantics remain language-neutral.
- The external developer docs entrypoint is `../../docs/developers/README.md`.

## Agent Descriptor signature contract

The executable reference implementation is `reference/agent-descriptor.js`.

For the current v1 identity-key path:

1. remove the top-level `signature` and `signatures` fields;
2. canonicalize the remaining descriptor with the same `canonicalize()` primitive used by TRUYN signed values;
3. encode the canonical string as UTF-8;
4. verify an Ed25519 signature encoded as standard base64;
5. resolve the participant public key outside the descriptor and require `nodeIdFromPublicKey(publicKey) === descriptor.identity`;
6. accept when at least one `signature`/`signatures[]` entry verifies against that identity key.

A descriptor-provided key is never trusted as its own root of authenticity. Delegated descriptor-signing keys are intentionally **fail-closed in this slice** because the draft spec has not yet defined a portable delegation proof/key-id contract. Supporting delegation later must add shared fixtures rather than weakening identity binding.

`v1/agent-descriptor-runtime-fixtures.json` publishes the exact canonical signing payload, public test key and precomputed signature. No fixture private key is stored in the repository.

## Discovery and privacy boundary

Provider visibility is decided by the relay before SDK data is returned. `GET /v1/offers` filters by the authenticated requester and provider policy. A first-party SDK MUST NOT attempt to reconstruct hidden provider state, and a public Agent Descriptor MUST NOT disclose a private capability that the requester cannot discover under provider policy.

The shared fixture `discovery.private-capability-nondisclosure` captures this invariant: the server-side test state contains both visible and hidden offers, while the SDK-facing wire response contains only the authorized offer.

## Version and interface negotiation

Clients inspect `descriptorVersion` and advertised `protocols`; unsupported required versions fail explicitly as `version_mismatch` and clients do not guess or silently downgrade.

The shared v1 negotiation rule is deterministic:

- descriptor schema/version must first parse as a supported Agent Descriptor generation;
- protocol selection follows the **client's `supportedProtocols` preference order** and chooses the first value also advertised by the descriptor;
- interface selection follows the **descriptor's interface order** and chooses the first interface type supported by the client;
- no protocol overlap fails as `version_mismatch` / `unsupported_protocol`;
- no interface overlap fails as `version_mismatch` / `unsupported_interface`.

Expiry is validated before use. Expired descriptors fail by default; an explicit offline/cache policy may opt into `allowExpired`.

## Golden conformance rules

`v1/golden-fixtures.json` plus its `v1/agent-descriptor-runtime-fixtures.json` extension form **one logical `truyn.sdk-conformance/v1` dataset**, not language-specific test data. TypeScript, Python, Go, Java and C#/.NET must consume or conform to the same cases and produce the same acceptance/normalization outcomes when their transport bindings are implemented.

- Every foundational DTO has at least one positive and one negative case.
- Behavior cases include private capability/provider non-disclosure and descriptor/protocol version mismatch.
- Agent Descriptor runtime cases include real signature verification, `signature` and `signatures[]`, canonical-byte equality, tamper rejection, wrong-key rejection, expiry, malformed JSON and compatibility negotiation.
- `errorNormalizationCases` pins representative current protocol, relay HTTP and client failures to the shared `NormalizedError` taxonomy, including retryability.
- Raw relay/protocol values remain source facts; normalized errors are an SDK projection and do not change wire responses.
- The repository gates read current protocol/identity and Agent Descriptor sources so obvious contract drift fails PR CI instead of silently forking the SDK surface.

## Files

- `languages.json` — language matrix and source marker manifest for all required first-party SDK targets.
- `run-conformance.mjs` — unified source/fixture conformance runner.
- `v1/sdk-contract.schema.json` — language-neutral JSON Schema definitions for the shared DTOs.
- `v1/golden-fixtures.json` — foundational shared DTO/behavior/error data.
- `v1/agent-descriptor-runtime-fixtures.json` — cryptographic and negotiation extension of the same fixture-set ID/version.
- `reference/agent-descriptor.js` — executable JavaScript reference semantics for parser/validator/negotiation/signature verification.
- `../../tests/sdk-shared-contract.test.js` — foundational DTO/source-mapping gate.
- `../../tests/sdk-agent-descriptor-runtime.test.js` — executable Agent Descriptor conformance gate.
- `../../tests/sdk-dx2-conformance-runner.test.js` — unified language runner and DX-3 marker gate.

The fixtures are contract data, not mocked claims of network productionization. Language implementations must consume this same logical dataset rather than maintaining language-local copies.
