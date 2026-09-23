# Trustability

TRUYN Trustability is claim-centric, domain-scoped, policy-dependent and continuously revisable.

## Where the code is today

This directory currently holds **design ownership notes only**. The implemented, tested Trustability slices live in `core/` and `node/`:

| Concern | Implementation |
|---|---|
| Trust evaluation, network trust | `core/trust/index.js`, `core/trust/network.js`, `node/active-trust-network.js` |
| Claim verification / relying-party checks | `core/trust/claim-verification.js`, `node/trust-verification.js` |
| Trust Receipts v2 | `core/trust/receipt-v2.js` |
| Lifecycle / revocation | `core/trust/lifecycle.js`, `node/revoke.js` |
| Source-owner PKI | `core/trust/source-owner-pki.js` |
| Transparency log | `core/trust/transparency-log.js`, `network/replication/transparency-replication.js` |
| Provenance / lineage | `core/provenance/index.js` |

Extend those modules. Components with no code yet (independence, Sybil, anomaly, reputation, scoring engine) are tracked in [`docs/architecture/PLANNED_MODULES.md`](../docs/architecture/PLANNED_MODULES.md); their directories are created with their first real file.

## Target ownership (design)

- `engine/` — orchestration of trust evaluation.
- `scoring/` — vector/score calculations; no globally fixed weights.
- `provenance/` — claim/evidence lineage graph.
- `independence/` — collapse correlated sources and estimate independent roots.
- `domains/` — domain/capability-specific history and expertise context.
- `reputation/` — historical outcome tracking.
- `aggregation/` — scalable attestation aggregation/sampling/commitments.
- `receipts/` — signed compact Trust Receipts.
- `sybil/` — Sybil/collusion defenses and admission signals.
- `anomaly/` — behavioral/outlier signals.
- `policies/` — relying-party acceptance/verification policies.

Canonical evaluation context:

```text
Trust(claim, requester, purpose, domain, time, policy)
```

Raw vote count is never sufficient evidence by itself. One upstream source repeated by a million descendants remains one lineage unless independent evidence exists.
