# TRUYN/1 P12 — Object / Artifact Reference Integrity Qualification

**Scope:** bounded strict verified-reference profile `truyn.object-reference-integrity/1`, NOT the entire draft `OBJECT` transport and NOT overall TRUYN/1 Stable v1.

## Executable source evidence

- First exact implementation qualification SHA: `035e4b815e4815bece1cf2cc5bb9ed387af466b3`.
- [CI run #38153247377](https://github.com/inn-media/truyn/actions/runs/38153247377): **SUCCESS**, including DCO, mandatory security, component, regression, integration, network, five-SDK executable conformance and SDK release verification, plus exact-head full qualification and full repository tests.
- [PR #982](https://github.com/inn-media/truyn/pull/982): public P12 bounded conformance change. Later documentation-only SHA and post-merge main MUST be requalified before final source acceptance.
- Previously accepted independent A2A/MCP black-box referenced-artifact profile: [Sprint E evidence](A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md) (PR #427, exact digests and failing negatives). P12 does not rewrite that compatibility generation.

## Bound normative surface

| Layer | Source / invariant |
| --- | --- |
| Normative | `spec/protocol/v1/object.md`: digest, size, integrity failure, opaque reference and no implicit fetch |
| Protobuf | `proto/v1/object.proto` `ContentObject` + `proto/v1/common.proto` `Reference`: explicit content size/digest fields, not a new runtime JSON kind |
| SDK DTO | `sdk/conformance/v1/sdk-contract.schema.json` + five language artifact payload projections, preserving an opaque `ArtifactRef` |
| Strict runtime | `core/object/integrity.js`: required SHA-256/size, maxBytes, explicit resolver only and verified final bytes |
| Vectors | `sdk/conformance/v1/p12-object-reference-vectors.json` |
| Executable | `tests/truyn1-p12-reference-integrity.test.js`: binding to spec/proto/five SDK source, positive digest and chunks, integrity negatives, no resolver/no fetch, bounded resolver calls, A2A compatibility and signed RESULT reference |
| Independent precedent | `tests/interoperability-external-artifact.test.js` and accepted C6/C8/Sprint E external processes |

## P12 negative acceptance

No successful verification of missing/invalid SHA-256, missing/invalid byte size, conflicting aliases, wrong digest, wrong size, oversized declared or received bytes, invalid resolver result or absent resolver. A URL/URI remains descriptive data, even when placed in a signed RESULT. An explicitly installed resolver may be called only for a validated and bounded reference; no implicit HTTP/file/MCP/A2A read, no silent fallback, no automatic retry, and no cross-tenant/provider/billing authority is granted.

## Qualification boundaries

- The `ArtifactRef` SDK type remains an opaque string; verified reference metadata is a separately validated profile. This avoids adding a sixth signed JSON wire message kind or changing published SDK binaries.
- The Protobuf schema remains an encoding scaffold for broader `OBJECT`, not proof of generalized object distribution, remote chunk transport, or global storage availability.
- P12 acceptance does not imply other protocol RC gaps P1–P11/P13–P14, Stable TRUYN/1, stable A2A/MCP v1, paid provider authorization, or Mainnet qualification.
- The GitHub CodeQL advisory for this PR was **neutral**, with a preexisting missing Rust default-setup configuration; it is not represented as a successful CodeQL scan. The independently executing mandatory-security-safety job did PASS. General hosted CodeQL coverage remains a separate repository/security configuration concern.
- **Final certification condition:** the documentation successor head passes required CI/DCO/security and exact-head full qualification; the merged main receives its own successful required post-merge CI. Do not mark this requirement satisfied from the first run alone.
