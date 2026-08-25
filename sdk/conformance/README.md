# TRUYN shared SDK conformance contract

This directory is the language-neutral source of truth for SDK DTO shape and golden conformance data used by the first-party SDKs.

## Scope

DX-1 maps the SDK surface to contracts that already exist in the repository. This layer **does not add network endpoints, protocol message types, routing behavior, provider policy, authorization rules, or D-1000 behavior**.

The current mapping is:

| SDK surface | Existing TRUYN source | DX-1 rule |
|---|---|---|
| `Identity` | `POST /v1/register`, `GET /v1/nodes/:id`, `IDENTITY` envelope | Normalize the public identity facts already returned by the relay. Session tokens are not part of `Identity`. |
| `AgentDescriptor` | `spec/protocol/v1/agent-descriptor.md`; `core/identity/index.js`; `core/protocol/index.js` | Parse/validate v1, negotiate compatibility and verify identity-bound Ed25519 signatures with the existing TRUYN canonicalization primitive. |
| `Capability` | Agent Descriptor `capabilities[].id`; runtime `payload.capability.name` | SDK logical projection only. It does not introduce a new wire field. |
| `Offer` | signed `OFFER` envelope; `POST/GET /v1/offers` | Preserve the canonical signed envelope and typed OFFER payload. |
| `Need` | signed `NEED` envelope; `POST /v1/needs` | Preserve the canonical signed envelope and typed NEED payload. |
| `Result` | signed `RESULT` envelope; `POST /v1/results` | Preserve the canonical signed envelope and typed RESULT payload. |
| `ArtifactRef` | existing opaque content/context references; generic OBJECT/Artifact wire shape not stable yet | Keep the reference opaque. Do not invent a new artifact wire object in DX-1. |
| `NormalizedError` | relay HTTP error body, protocol verification reasons, client timeout/transport failures | SDK-only stable taxonomy with optional raw source details. It never replaces the relay/protocol error on the wire. |

## Canonical signed envelope

The current MVP envelope is produced by `core/protocol/index.js` and contains:

```text
protocol · type · id · from · to · createdAt · publicKey · payload · signature
```

`protocol` is currently `TRUYN/1`. `IDENTITY`, `OFFER`, `NEED`, `RESULT`, and `REVOKE` are the current MVP envelope types.

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

`v1/golden-fixtures.json` plus its `v1/agent-descriptor-runtime-fixtures.json` extension form **one logical `truyn.sdk-conformance/v1` dataset**, not language-specific test data. TypeScript and Python must consume the same cases and produce the same acceptance/normalization outcomes.

- Every foundational DTO has at least one positive and one negative case.
- Behavior cases include private capability/provider non-disclosure and descriptor/protocol version mismatch.
- Agent Descriptor runtime cases include real signature verification, `signature` and `signatures[]`, canonical-byte equality, tamper rejection, wrong-key rejection, expiry, malformed JSON and compatibility negotiation.
- `errorNormalizationCases` pins representative current protocol, relay HTTP and client failures to the shared `NormalizedError` taxonomy, including retryability.
- Raw relay/protocol values remain source facts; normalized errors are an SDK projection and do not change wire responses.
- The repository gates read current protocol/identity and Agent Descriptor sources so obvious contract drift fails PR CI instead of silently forking the SDK surface.

## Files

- `v1/sdk-contract.schema.json` — language-neutral JSON Schema definitions for the shared DTOs.
- `v1/golden-fixtures.json` — foundational shared DTO/behavior/error data.
- `v1/agent-descriptor-runtime-fixtures.json` — cryptographic and negotiation extension of the same fixture-set ID/version.
- `reference/agent-descriptor.js` — executable JavaScript reference semantics for parser/validator/negotiation/signature verification.
- `../../tests/sdk-shared-contract.test.js` — foundational DTO/source-mapping gate.
- `../../tests/sdk-agent-descriptor-runtime.test.js` — executable Agent Descriptor conformance gate.

The fixtures are contract data, not mocked claims of network productionization. TypeScript and Python implementations must consume this same logical dataset rather than maintaining language-local copies.
