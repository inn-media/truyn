# H-Series — Current benchmark status

Status snapshot: **2026-10-10**

This file is the current public status ledger for H-Series. Frozen methodology/contract documents remain immutable evidence inputs and may therefore retain historical pre-result status banners. Current measured-result status belongs here and in append-only result reports.

## Qualification model

All H-Series lanes use the binding execution model in [`H_SERIES_QUALIFICATION_POLICY.md`](H_SERIES_QUALIFICATION_POLICY.md):

```text
Frozen Candidate → Branch Qualification → Admission to Main
```

Expensive H qualification is evidence for an exact frozen candidate, not for a moving `main`. Main movement triggers `BASE_SHA → current main` admission analysis. If the delta does not touch an H-sensitive surface, candidate evidence is reused. If it does, only affected blocks are requalified first; a new live H run is not automatic. A fresh integration-state Admission Gate is mandatory before merge.

| Lane | Current state | Durable public evidence | Next action |
| --- | --- | --- | --- |
| H/CACHE-COMPOUND | **PASS / CLOSED** | [`H_CACHE_COMPOUND_2026-10-10.md`](H_CACHE_COMPOUND_2026-10-10.md) + [`H_CACHE_COMPOUND_2026-10-10.json`](H_CACHE_COMPOUND_2026-10-10.json) | no ordinary rerun |
| H/SECOND-OPINION | **PASS / CLOSED** | [`H_SECOND_OPINION_2026-10-07.md`](H_SECOND_OPINION_2026-10-07.md) + [`H_SECOND_OPINION_2026-10-07.json`](H_SECOND_OPINION_2026-10-07.json) | no ordinary rerun |
| H/ARBITRAGE | **PASS / CLOSED** | [`H_ARBITRAGE_2026-09-24.md`](H_ARBITRAGE_2026-09-24.md) + [`H_ARBITRAGE_2026-09-24.json`](H_ARBITRAGE_2026-09-24.json) | no ordinary rerun |
| H/CHAOS-FUZZ | **PENDING FINAL** | methodology only | create/qualify lane-specific frozen candidate |

## H/CACHE-COMPOUND closure

H/CACHE-COMPOUND is **PASS / CLOSED** after a preserved three-step evidence chain:

- full-factorial Attempt 7 run `37903237195` measured 37,800 logical rows and showed **93.587%** steady-state provider-gross cost reduction, **99.169%** cross-node reuse share and a negative compounding slope; Zipf 0.8 and 1.1 network-effect gates passed, while Zipf 1.4 remained inconclusive because its 95% CI crossed zero;
- targeted one-shot confirmatory run `37952123783` remained inconclusive and is preserved as negative evidence;
- separately frozen high-power independent replication run `37988342234` closed the same unchanged Zipf 1.4 gate at **+2.054 pp**, 95% CI **[+0.430, +5.798] pp**, with all safety counters zero.

The final public report is [`H_CACHE_COMPOUND_2026-10-10.md`](H_CACHE_COMPOUND_2026-10-10.md). Logical node counts are benchmark-node identities and are not a physical-host-count claim. Dollar figures use exact run-scoped provider usage multiplied by the frozen price profile; Azure resource-level metrics are corroboration only.

## H/SECOND-OPINION closure

H/SECOND-OPINION v2 Attempt 1 is **PASS / CLOSED**.

Accepted bounded result:

- 200/200 hidden holdout items;
- seven providers, 1,400 logical provider calls, 1,402 physical HTTP attempts;
- TRUST_WEIGHTED K5 accuracy **87.0%** vs MAJORITY K5 **82.0%**;
- disagreement subset **75 items** with trust lift **+13.333 pp**, paired 95% CI **[+6.667, +21.333] pp**;
- Gate A/B/C/D **PASS**;
- conservative provider-cost upper bound **$0.368344732** vs frozen **$50** cap;
- K5 p95 latency **11,528.2 ms** vs frozen **29,019 ms** envelope;
- immutable run `37672469441`, artifact `11506652560`, digest `sha256:526ee9e5f0d20253492cd3573c9c4151b2b408e08f70eb2ac1b2b9d5154c141a`.

The direct Attempt 1 launch omitted the usual pre-launch qualification/preflight/collision gates by explicit operator instruction. Frozen scientific thresholds and Gate A/B/C/D definitions were not weakened after measurement. The public result is sanitized; hidden holdout material and private operational details remain private.

## H/ARBITRAGE closure

The first completed H-Series final lane is H/ARBITRAGE.

Accepted bounded result:

- captured modeled arbitrage: **100%**;
- modeled comparative saving vs STATIC: **21.208%**;
- regret vs modeled ORACLE: **0**;
- misroute rate: **0%**;
- STATIC quality: **97.222%**;
- TRUYN quality: **98.056%**;
- quality delta: **+0.833 percentage points**;
- mean latency trade-off: **+93.99 ms / +22.23%**;
- measured provider calls: **720**;
- measured retries: **0**;
- duplicate measured calls: **0**;
- material cross-series interference: **none**.

The 21.208% result is a **modeled comparative benchmark under the frozen scripted price timeline**. Exact run-window invoice attribution was not available from both cloud billing surfaces, so no actual Azure/GCP invoice-savings percentage is claimed.

## Evidence policy

H-Series follows the repository-wide `redact-not-delete` rule:

- safe benchmark evidence is append-only;
- private operational identifiers remain private;
- public reports retain enough metrics, run/artifact identities and cryptographic digests to audit the bounded claim;
- failed or superseded evidence is preserved rather than silently rewritten;
- a closed final lane is not re-run merely to refresh documentation.

## Frozen methodology note

The private H execution contract pins the public H contract and methodology by immutable commit/blob identities. Therefore this sanitation does **not** rewrite `H_ARBITRAGE_METHODOLOGY.md` solely to change its historical status banner. The final result is recorded separately so the original experiment contract remains reproducible.

## Rerun rule

A new measurement for any closed H lane is justified only after a material, versioned change to one or more of:

- methodology;
- provider set;
- price model;
- workload;
- seed / statistical acceptance;
- claim scope.

Such a campaign must receive a new immutable run identity and may not overwrite earlier accepted or negative evidence.

For the remaining open H lane, CHAOS-FUZZ, movement of `main` alone is never a sufficient reason for a full live rerun. H/CACHE-COMPOUND, H/SECOND-OPINION and H/ARBITRAGE are closed and require a new versioned successor before any new final measurement.
