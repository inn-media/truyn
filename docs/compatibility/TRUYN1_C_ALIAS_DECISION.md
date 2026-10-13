# Class C Proposal A: Source Short Alias Reconciliation

**Status:** PROPOSED COMPATIBILITY INTERPRETATION, NOT ACCEPTED RFC OR STABLE WIRE.
**Source:** approved original CORE SHA-256 `591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121`.
**Machine authority:** `spec/registry/truyn-core-v1.json` (existing 80 immutable CODE/name/Short records).

## Decision proposed for normative review

1. The canonical eight-digit decimal `CODE` and the existing machine `short` are the only authoritative registry identifiers. Do **not** change the original 80 machine CODE/Short/name values.
2. The alternate labels `A10`, `A20`, `B10`, `C10`, `D10`, etc., in the approved narrative source are historical **documentation labels only**. Their association with the correct CODE/name is preserved in `spec/registry/truyn1-source-short-reconciliation.json`, not in the base registry or executable wire.
3. Reference docs MAY show `originalSourceShort` as historical provenance but MUST display the canonical registry short in machine-facing tables. No SDK, relay, QUIC, compact, JSON envelope, authorization or billing path may accept the source label as an alternate wire token. A source label must never be used to guess a CODE in any runtime.
4. The document mapping is keyed by the exact eight-digit code and verifies immutable corresponding name and canonical Short; it reports all **41** discrepancies and does not add, remove or renumber any CORE entry.
5. Consumers must distinguish semantic registry lookup from a physical type: existing `MVP_TYPES`, DHT methods, compact aliases, signatures and five published SDK packages stay unchanged.

## Why this is the least-risk, most effective choice

No extra decoder aliases, collisions or downgrade paths in 20/500/1000+ node traffic; no new mandatory SDK behavior; no translation ambiguity in future negotiated expansion. Human-facing historical source material remains recoverable through a deterministic, auditable mapping. The full A–I taxonomy remains intact.

## Governance, compatibility and testing

This is a Class C proposed interpretation requiring its full review period and recorded approval. It is **not** an implementation upgrade. The new additive `tests/documentation-status-wire-short-resolution.test.js` checks 80 machine rows and all 41 archival mappings on every qualified source. Any collision or regression must fail closed; historical benchmark evidence and wire signatures remain immutable. Review against PR #1089 and ongoing five-SDK registry PR #1091 before integrating.

No P1–P14/G0–G7 or Stable TRUYN/1 declaration follows solely from this mapping.
