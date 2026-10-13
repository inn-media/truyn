# TRUYN/1 ATTEST

**Status:** normative mapping for the implemented `truyn-attestation-v1` signed object. ATTEST remains a structured trust object, not a sixth top-level bounded JSON envelope kind.

The signed `body.verdict` values are exactly the `ATTEST_VERDICTS` values in `core/claims/index.js`:

| Implemented signed value | Meaning | Protobuf projection enum |
|---|---|---|
| `support` | Evidence supports the claim | `ATTESTATION_SUPPORTS = 1` |
| `contradict` | Evidence contradicts the claim | `ATTESTATION_DISPUTES = 2` |
| `uncertain` | Evidence is inconclusive | `ATTESTATION_INCONCLUSIVE = 3` |

`SUPPORTS`, `DISPUTES` and `INCONCLUSIVE` are conceptual labels from the earlier draft, not accepted spellings in this signed object. Never substitute an enum label, uppercase alias or translated verdict before verifying a historical signature. A future schema may define a mapping only with explicit version negotiation and preserved original signed bytes. The protobuf projection is not a second signing domain.

An attestation SHOULD include confidence, relevant domain, evidence/provenance references, time and an independence/lineage hint when available. The trust engine determines its weight; raw count is not independent evidence.

See `verification.md`, `trustability.md` and `../../../proto/README.md`.
