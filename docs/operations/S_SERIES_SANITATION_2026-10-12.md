# S-Series S-200 documentation and benchmark sanitation — 2026-10-12

**Reconciled result:** **CLOSED / PASS for the bounded six-provider, eight-scenario composite S-200 evidence**; original **seven-provider DeepSeek parity OPEN**, physical WAN/SLO/mainnet OPEN, S-500 OPEN.

This is a documentation and evidence-ledger sanitation, not a destructive cleanup of historic test branches, failed runs or credentials. The immutable private runner and raw traces remain in `inn-media/truyn-platform`. The public repository receives only report-level derived, non-secret metrics and raw artifact identities/digests.

## Closure authority and exact trace

| Item | Frozen authority | Outcome |
|---|---|---|
| A14 baseline | private run [38156585322](https://github.com/inn-media/truyn-platform/actions/runs/38156585322), SHA `1a7a2d8509872defd4ad7df396375e69707283fd`, artifact `11713182278` / SHA-256 `726ab96c28377565d2d4e1b03eacc0e8314b5c6bdef0a813ecf097c21b0edf3c` | workflow **FAIL**; seven passing individual scenarios and balanced/seeded MIX profiles retained |
| A15 incremental closure | private run [38171454872](https://github.com/inn-media/truyn-platform/actions/runs/38171454872), SHA `112c66e0904a6dfc172bcf6d6e60ef31e891e239`, artifact `11716792652` / SHA-256 `cd19392f0c04f8f60f41bc3ec7ae1e7c7007d26f365238c9007833ce2a49a1a2` | workflow **SUCCESS**; only skewed MIX cohort paid/re-executed; 8/8 composite PASS |
| Composite lineage | `attempt15-composite-checkpoint.json` | `composite=true`, `oneRunProof=false`; source SHAs preserved per scenario/profile; all original suite/network gates true |
| Public scope | [benchmark report](../benchmarks/S_SERIES_S200_2026-10-12.md), [structured safe summary](../benchmarks/evidence/S_SERIES_S200_2026-10-12.json) | six measured providers, **not** original seven-provider benchmark closure |

## Active documents reconciled

- Root `README.md` and `ROADMAP.md`: change S-200 from entirely OPEN to scope-limited composite CLOSED and keep unproven gates explicitly OPEN.
- `docs/architecture/IMPLEMENTATION_STATUS.md`: update canonical **matrix row**, factual status and link to accepted source; keep previous D/H/N/A statuses intact.
- `docs/architecture/SEMANTIC_SCALE_S_SERIES.md`: scale ladder, executive status, measured-node definition and exceptions.
- `docs/benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`: append scoped result, **do not modify the seven-family required methods or hard numeric thresholds**.
- `docs/benchmarks/README.md` and `docs/README.md`: evidence index and documentation navigation.
- `docs/operations/GLOBAL_STATUS_RECONCILIATION_2026-10-10.md`: mark 2026-10-10 S-200 row as a **historical snapshot superseded by 2026-10-12**, rather than falsely changing the 2026-10-10 observation.
- This report is the current S-Series sanitation authority; prior `S_SERIES_SANITATION_*_2026-10-07/08.md` documents remain append-only history.

## Performance, non-regression and next independently opened gates

Eight complete scenario names and measured values appear in the [S-200 report](../benchmarks/S_SERIES_S200_2026-10-12.md). Key non-claims are: DeepSeek not measured; loopback relay does not prove physical WAN distribution; mixed A14/A15 execution SHA cannot become one-shot single-run evidence; modeled comparable provider inference cost is not full system TCO; latency p95 deteriorates under ECON/MIX load; the cost-routing selected mix was about **2.2268% more expensive** than the premium comparator despite all policy checks passing. All historical failing attempts remain preserved as evidence.

**Sanitation outcome:** statuses, evidence index, methodology scope, provenance and next gates synchronized without changing benchmark thresholds, importing private code to public or deleting historical records.
