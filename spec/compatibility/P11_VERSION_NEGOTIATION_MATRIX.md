# P11 — Required-Semantic / Protocol-Version Negotiation Matrix

**Matrix revision:** `truyn-p11-required-semantic-negotiation/rc1` (frozen decision table)  
**Status:** release-candidate decision contract, **not** a declaration that `TRUYN/1` or `TRUYN/2` is stable.  
**Machine-readable source:** [p11-negotiation-matrix.json](p11-negotiation-matrix.json)  
**Normative rule:** [`spec/protocol/v1/core.md`](../protocol/v1/core.md), section “Compatibility and negotiation”.  
**Reference implementation:** [`core/protocol/negotiation.js`](../../core/protocol/negotiation.js).

This table binds normative semantics, executable decisions and negative test evidence. **Stable** here means the matrix has a fixed revision and a regression gate; it does **not** establish stable network interoperability, stable SDK packages or Mainnet admission.

## Algorithm and invariants

1. Peers advertise generations they actually support, and the highest **shared** `TRUYN/<integer>` generation is selected. No overlap is `version_mismatch / no_protocol_overlap`.
2. Each required semantic must be advertised by **both** peers for the negotiated profile. Missing any required semantic is `version_mismatch / required_semantic_unavailable`, with a deterministic sorted `missingSemantics` array. Required semantics cannot be dropped to obtain a match.
3. Only mutually advertised **optional** semantics may be selected; missing optional semantics never grant authority, and optional-field ignorance is allowed only for compatible meaning.
4. Protocol and SDK release numbers, Agent Descriptor schemas, transport compatibility and storage migrations are independent axes. Negotiation grants **no** identity, authorization, provider, tenant, billing, cancellation or provenance rights.
5. Breaking required semantics demand a new protocol generation or an explicitly negotiated extension; there is no automatic promotion of extension support from legacy messages.

## Frozen outcome matrix

| Case ID suffix | Local ↔ remote | Required semantic rule | Expected decision | Machine-checkable outcome |
|---|---|---|---|---|
| `exact-generation-required-present` | 1 ↔ 1 | Both support required `core-envelope` | Compatible | `TRUYN/1`; mutual semantics |
| `highest-shared-generation-synthetic` | 1,2 ↔ 2,1 | Shared `core-envelope` | Compatible | `TRUYN/2` *selection algorithm only* |
| `lower-common-generation-fallback` | 2,1 ↔ 1 | Required semantic still present | Protocol fallback allowed | `TRUYN/1`, without semantic downgrade |
| `optional-semantic-intersection` | 1 ↔ 1 | Only `core-envelope` required | Compatible | Unshared `stream-partial` excluded |
| `empty-optional-overlap` | 1 ↔ 1 | No required semantic | Compatible baseline | `semantics: []` |
| `no-protocol-overlap` | 1 ↔ 2 | Irrelevant once no generation overlaps | Reject | `version_mismatch / no_protocol_overlap` |
| `empty-remote-protocols` | 1 ↔ ∅ | No common generation | Reject | `version_mismatch / no_protocol_overlap` |
| `required-semantic-unavailable` | 1 ↔ 1 | Remote lacks required `revoke-need` | Reject | `required_semantic_unavailable`, missing `revoke-need` |
| `required-semantic-missing-locally` | 1 ↔ 1 | Local lacks required `revoke-need` | Reject | Same failure, no one-sided negotiation |
| `multiple-required-semantics-missing-sorted` | 1 ↔ 1 | Two mandatory extensions unavailable | Reject | Sorted `[a-extension, z-extension]` |

**Executable assertions:** `tests/protocol-v1-compatibility-matrix.test.js` checks all 10 exact input/output rows. Existing `sdk/conformance/v1/protocol-negotiation-negative-fixtures.json` vectors are asserted unchanged by ID, input and expected output. Existing `tests/protocol-v1-negotiation.test.js` and `tests/protocol-v1-negotiation-fixtures.test.js` remain independent regression evidence.

## Authenticated entry points and security negatives

| Interface | Executable evidence | Must remain true |
|---|---|---|
| Signed relay registration | `tests/protocol-v1-registration-freshness.test.js` | Unknown generations/required semantics yield HTTP 409 `version_mismatch` **before** node/session state is created; malformed advertisements fail closed. |
| Signed peer HELLO / ACCEPT | `tests/errors-versioning-interop.test.js`; `network/sessions/authenticated-session.js` | Unsupported generations, responder-required semantics, malformed advertised sets, tampered/mismatched ACCEPT and partially absent negotiation are rejected. |
| Historical signed ACCEPT | `tests/errors-versioning-interop.test.js` | A fully legacy ACCEPT is allowed for the `TRUYN/1` baseline only; its negotiated semantic set is empty, never an implicit extension grant. |
| Relay client `register()` | `tests/errors-versioning-interop.test.js`; `node/client.js` | Missing or malformed server confirmation never installs a session token. |
| Shared negative fixtures | `sdk/conformance/v1/protocol-negotiation-negative-fixtures.json` | No-overlap and required-semantic-missing outcomes stay consistent with this matrix. |

The pure helper normalizes string lists. Authenticated registration and peer-session boundaries additionally reject malformed advertisement shapes **before** treating them as negotiated rights. This is not a substitute for signature checks, transport binding, replay protection, server-side authorization, provider recheck, or billing entitlement.

## Compatibility limits / release gate

- `TRUYN/2` appears only as synthetic data testing highest-common-generation selection and fallback. This is **not** evidence of an implemented, independently supported second generation.
- The helper currently models semantics as **flat sets**, not per-generation semantic maps. It must not be used as proof that different semantic sets have been tested for different generations; version-scoped advertisement and real mixed-generation interop require separate conformance.
- This decision matrix does not prove cross-version five-SDK interoperability, migration/cutover/rollback, stable Descriptor lifecycle, distributed exactly-once, or operational Mainnet compatibility.
- P11 is **matrix-defined / regression-linked** once the exact PR head and post-merge `main` checks pass. Stable TRUYN/1 remains gated on the other protocol RC gaps and independent exact-head security/CI/five-SDK/release qualification. Do not erase the draft/pre-stable warning to close a documentation subgate.

Changes to a row's expected outcome require a new matrix revision, normative review, corresponding fixture/test update, and fresh exact-SHA CI evidence; never silently rewrite this revision into a stable-release claim.
