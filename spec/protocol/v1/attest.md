# TRUYN/1 ATTEST

**Status:** draft normative skeleton.

`ATTEST` records a signed verification judgment about a claim. The core verdict space is:

- `SUPPORTS`;
- `DISPUTES`;
- `INCONCLUSIVE`.

An attestation SHOULD include confidence, relevant domain, evidence/provenance references, time and an independence/lineage hint when available. The trust engine determines how much weight the attestation receives; raw count is not automatically independent evidence.

See `verification.md` and `trustability.md`.

## Implemented signed verdict and protobuf projection (Class C reconciliation proposal)

The three uppercase labels above are **conceptual verdict meanings from the original draft**, **not literal spellings allowed inside an implemented signed `truyn-attest-v1` object**. The existing cryptographically signed `body.verdict` strings are exactly `support`, `contradict`, `uncertain`, as enforced in `core/claims/index.js`. These historical values are immutable and MUST NOT be uppercased, renamed, rewritten or re-signed by translation, schema, SDK or bridge.

| Signed `body.verdict` | Conceptual label | Protobuf semantic projection |
|---|---|---|
| `support` | `SUPPORTS` | `ATTESTATION_SUPPORTS = 1` |
| `contradict` | `DISPUTES` | `ATTESTATION_DISPUTES = 2` |
| `uncertain` | `INCONCLUSIVE` | `ATTESTATION_INCONCLUSIVE = 3` |

`ATTESTATION_UNSPECIFIED = 0` is never a valid signed verdict. This is **an explicitly versioned, read-only semantic mapping**, recorded in `spec/registry/truyn1-attest-verdict-projection.json`. It does not introduce a second signing domain, convert historical attestations to protobuf or advertise a binary codec. A future negotiated protobuf projection must first verify the **unchanged original** JSON signature and prove independent five-SDK roundtrip conformance; protobuf enum names/numeric values are never the signed JSON value. No new sixth Envelope type arises.

The existing draft conceptual wording and the accepted signed implementation are intentionally distinguished. Promotion requires ordinary Class C governance, source/SDK conformance and exact-head/post-merge qualification, not merely a passing documentation test.
