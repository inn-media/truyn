# Negotiated Wire freeze completion: source candidate

This record covers the remaining G4/GE1–GE3 wire work, not overall Stable TRUYN/1, package publication, private deployment, G5 or Mainnet. Historical release qualification remains unchanged in `TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md`.

## Implemented candidate

- Optional `truyn.envelope.ext/1` native validation in all five SDK paths. Legacy absence and signed unknown fields are preserved. New emission requires explicit support; signature verification precedes semantic errors. Critical priority never supplies authority.
- Default-off HTTP admission; session-bound QUIC admission and recheck after queueing. Forwarding preserves the original signed envelope. Mixed legacy/profile context stays separate from recipient support and survives durable outbox storage.
- The original two signed vectors remain; GE1–GE3 append their exact source bytes/digests/signatures. The public RFC 8032 vector key is test-only. The reviewed corpus adds 80 correctly signed semantic or tampered crypto cases including legacy pairs.
- Mandatory independent TypeScript/Node, Python, Go, Java and .NET execution: 425 fixture outcomes, plus five native emission checks. Corpus digests and complete exact results are checked; no missing language can pass. Fresh builds and a clean unchanged source SHA are required.
- Normative ECMAScript numeric formatting, existing signed ATTEST values and explicit protobuf projection boundaries are reconciled. No existing protobuf tag, signed verdict or published SDK artifact is rewritten.

## Qualification authority

[PR #1086](https://github.com/inn-media/truyn/pull/1086) records the exact accepted source and observed CI; do not infer acceptance from this candidate document alone.

The branch/PR acceptance record must link the final exact SHA, full CI and the `WIRE_FREEZE_REPORT` emitted by the native SDK job. The report identifies the source and corpus digests and every language's observed results. Local Node/Python or aggregate green checks alone do not close this gate. A merged candidate needs its own postmerge checks; previous source results cannot qualify later commits.

Current source is an opt-in implementation. Native high-level relay clients remain legacy unless the application uses the explicit negotiated envelope APIs. Release packaging and actual registry/private consumer admission are separate gates, with immutable artifacts and fresh compatibility evidence. The protobuf binary codec is deliberately outside the implemented JSON wire profile; this candidate does not declare it interoperable.
