# TRUYN shared SDK conformance contract

This directory is the language-neutral source of truth for SDK DTO shape and golden conformance data used by the first-party SDKs.

## Scope

DX-1 starts by mapping the SDK surface to contracts that already exist in the repository. This layer **does not add network endpoints, protocol message types, routing behavior, provider policy, authorization rules, or D-1000 behavior**.

The current mapping is:

| SDK surface | Existing TRUYN source | PR1 rule |
|---|---|---|
| `Identity` | `POST /v1/register`, `GET /v1/nodes/:id`, `IDENTITY` envelope | Normalize the public identity facts already returned by the relay. Session tokens are not part of `Identity`. |
| `AgentDescriptor` | `spec/protocol/v1/agent-descriptor.md` | Represent the draft descriptor contract only. Serving and cryptographic descriptor verification are later DX-1 implementation work. |
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

## Discovery and privacy boundary

Provider visibility is decided by the relay before SDK data is returned. `GET /v1/offers` filters by the authenticated requester and provider policy. A first-party SDK MUST NOT attempt to reconstruct hidden provider state, and a public Agent Descriptor MUST NOT disclose a private capability that the requester cannot discover under provider policy.

The shared fixture `discovery.private-capability-nondisclosure` captures this invariant: the server-side test state contains both visible and hidden offers, while the SDK-facing wire response contains only the authorized offer.

## Version behavior

Clients must inspect both Agent Descriptor `descriptorVersion` and advertised `protocols`. Unsupported required versions fail explicitly as `version_mismatch`; clients must not guess or silently downgrade.

## Files

- `v1/sdk-contract.schema.json` — language-neutral JSON Schema definitions for the shared DTOs.
- `v1/golden-fixtures.json` — the single golden dataset that TypeScript and Python must consume in DX-1.
- `../../tests/sdk-shared-contract.test.js` — repository gate that checks fixture coverage and the invariants above without adding a JSON Schema runtime dependency.

The fixtures are contract data, not mocked claims of network productionization. Later SDK PRs will consume the same dataset for TypeScript and Python runtime conformance.
