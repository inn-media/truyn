# TRUYN schema authority and wire boundary

For the bounded TRUYN/1 Wire freeze, the authoritative physical wire is the signed JSON contract in [envelope.md](../spec/protocol/v1/envelope.md), plus the separately specified compact and authenticated-session contracts. Protobuf files do not override that contract.

| Surface | Status and authority |
|---|---|
| Signed JSON, five envelope kinds | Frozen TCJ1/Ed25519 domain; normative JSON contract and five-SDK fixtures |
| Optional `ext` | Negotiated JSON metadata; [ext/1 contract](../spec/protocol/v1/envelope-ext.md) |
| `proto/v1` messages | Machine-readable semantic projections, not an implemented TRUYN/1 network codec |
| `proto/v2/trust_receipt.proto` | Versioned trust-receipt projection; not a new TRUYN envelope generation |

Protobuf numeric tags and enum numbers are preserved. `protocol_generation`, byte IDs, unix timestamps and `oneof payload` are projection fields, not aliases that may replace the JSON signed fields. Decoding a projection cannot reconstruct the original signed JSON. Keep original signed bytes for verification and archival; never verify a JSON signature over serialized protobuf or reconstructed JSON.

`attest.proto` maps its existing enum numbers to the implemented signed `support|contradict|uncertain` values as specified in [ATTEST](../spec/protocol/v1/attest.md). The mapping does not change signed bytes. Unknown optional JSON fields and `ext` must remain in the original signed representation rather than being lost in a typed projection.

A future binary wire profile requires its own explicit negotiation, unknown-field/round-trip rules, five-SDK codec vectors and migration qualification. No protobuf transport is advertised by this change. This resolves the former ambiguous “wire-schema draft” label without falsely admitting an unimplemented codec into Stable TRUYN/1.
