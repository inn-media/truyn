# S-Series Documentation Sanitation — 2026-10-07

This sanitation reconciles public S-Series documentation after the accepted S-10 baseline and accepted S-20 Attempt 3 five-scenario benchmark.

## Canonical status after reconciliation

- S-10: **ACCEPTED / PASS** for the bounded ECON/MIX integration baseline.
- S-20: **ACCEPTED / PASS** for `ECON`, `MIX`, `COST-ROUTING`, `CONTENTION`, `LANG`.
- S-50: **OPEN**; S-20 does not accept `XBORDER`, `CHAIN`, `CHURN` or the full S-50 gate.
- S-100: **OPEN**.
- S-200: **OPEN**.
- S-500: **OPEN**.

The previous blanket statements “NO S PASS”, “no accepted S result” and “S-50 is the first live baseline” are stale where they exclude the newly accepted S-10 integration baseline.

## Execution-model sanitation

The active S-N acceptance path is:

`exact immutable candidate -> minimal preflight -> one real live S-N run -> post-run evidence/acceptance`

Historical Frozen Candidate / Swarm / B01-B22 / Admission material remains valid historical qualification and diagnostic evidence. It is not a mandatory cascading precondition for every new S-N attempt. Movement of `main` alone does not invalidate a frozen candidate.

This sanitation does not weaken any acceptance threshold and does not rewrite historical failed attempts.

## Public/private evidence boundary

Public documentation records sanitized aggregate benchmark metrics and a cryptographic digest of the withheld raw evidence. Private managed-cloud topology, request traces, operational identifiers and raw evidence remain in `inn-media/truyn-platform`.

Canonical public benchmark report: `docs/benchmarks/S_SERIES_S10_2026-10-07.md`.


## S-20 reconciliation

Canonical public S-20 evidence: `docs/benchmarks/S_SERIES_S20_2026-10-07.md` and machine-readable `docs/benchmarks/evidence/S_SERIES_S20_2026-10-07.json`.

Attempt 1 and Attempt 2 remain immutable failures; Attempt 3 is the accepted S-20 checkpoint. The accepted scope is exactly `ECON + MIX + COST-ROUTING + CONTENTION + LANG`. No claim is made for `XBORDER`, `CHAIN`, `CHURN` or S-50+.
