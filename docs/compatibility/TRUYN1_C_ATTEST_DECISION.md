# Class C Proposal C: ATTEST Signed Verdict to Protobuf Projection

**Status:** PROPOSED DOCUMENTATION/SEMANTIC RECONCILIATION. No new attestation wire codec, no changed signatures or automatic stable-v1 declaration.

## Decision

Existing `truyn-attest-v1` signed JSON content remains the authority. Only the three lowercase strings `support`, `contradict`, `uncertain` are legal in `body.verdict`, enforced by `ATTEST_VERDICTS`. The abstract labels `SUPPORTS`, `DISPUTES`, `INCONCLUSIVE` mean the same respective judgments but are **not aliases in a signed object**. The existing protobuf enum labels and numeric tags `1`, `2`, `3` are unchanged, reserved for a future separately negotiated semantic projection; `0` means unspecified and is not admissible.

Authenticate issuer, validate claim and verify original Ed25519 signature against unchanged TCJ1 bytes **before** any object projection. A reconstructed protobuf object may not be substituted for the original JSON unsigned representation; raw signed bytes and fields must be preserved. Never implement dual-canonicalization fallback.

## Why this is efficient and safe

Eliminates semantic confusion at zero runtime/signature migration cost, retains future protobuf interoperability, preserves existing trustability/evidence history and prevents forged approvals by casing changes. All five currently published alpha SDKs and all current providers continue using existing signed JSON. Versioned migration, independent SDK vectors and a separate RFC will be required to admit a binary wire profile.

Machine-readable mapping: `spec/registry/truyn1-attest-verdict-projection.json`; source conformance: `tests/documentation-status-attest-projection.test.js`. The only change to `proto/v1/attest.proto` is an explanatory comment; all numeric tags, member fields and enumerators remain untouched.
