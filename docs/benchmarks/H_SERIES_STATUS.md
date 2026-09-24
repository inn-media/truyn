# H-Series — Current benchmark status

Status snapshot: **2026-09-25**

This file is the current public status ledger for H-Series. Frozen methodology/contract documents remain immutable evidence inputs and may therefore retain historical pre-result status banners. Current measured-result status belongs here and in append-only result reports.

## Qualification model

All H-Series lanes use the binding execution model in [`H_SERIES_QUALIFICATION_POLICY.md`](H_SERIES_QUALIFICATION_POLICY.md):

```text
Frozen Candidate → Branch Qualification → Admission to Main
```

Expensive H qualification is evidence for an exact frozen candidate, not for a moving `main`. Main movement triggers `BASE_SHA → current main` admission analysis. If the delta does not touch an H-sensitive surface, candidate evidence is reused. If it does, only affected blocks are requalified first; a new live H run is not automatic. A fresh integration-state Admission Gate is mandatory before merge.

| Lane | Current state | Durable public evidence | Next action |
| --- | --- | --- | --- |
| H/CACHE-COMPOUND | **PENDING FINAL** | methodology only | create/qualify lane-specific frozen candidate |
| H/SECOND-OPINION | **PENDING FINAL / MOST EXECUTION-READY OPEN LANE** | methodology only | continue candidate-bound HS12 SECOND path |
| H/ARBITRAGE | **PASS / CLOSED** | [`H_ARBITRAGE_2026-09-24.md`](H_ARBITRAGE_2026-09-24.md) + [`H_ARBITRAGE_2026-09-24.json`](H_ARBITRAGE_2026-09-24.json) | no ordinary rerun |
| H/CHAOS-FUZZ | **PENDING FINAL** | methodology only | create/qualify lane-specific frozen candidate |

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

A new H/ARBITRAGE final measurement is justified only after a material, versioned change to one or more of:

- methodology;
- provider set;
- price model;
- workload;
- seed / statistical acceptance;
- claim scope.

Such a campaign must receive a new immutable run identity and may not overwrite the 2026-09-24 evidence.

For open H lanes, movement of `main` alone is never a sufficient reason for a full live rerun. Admission fingerprints and affected-block requalification decide whether existing frozen-candidate evidence remains compatible.
