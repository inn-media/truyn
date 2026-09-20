# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current network-scale operational status**. Stable architecture, roadmap, and top-level documentation must link here rather than copy ephemeral run state.

## Current state

Class C heterogeneous WAN, Class D-100, and **Class D-200 are accepted**.

The D-200 closure task `truyn-d200-parallel-closure-260914-a7f3`, anchored by issue #536, is **COMPLETE / PASS**. The accepted immutable single-shot run is `35503894414`, `run_attempt=1`, with strict terminal marker `TRUYN_D200_TERMINAL result=PASS`.

Accepted D-200 identity:

- frozen tested source: `e91c165c67c655deb80df4511ca346acb9f1f45b`
- frozen tested tree: `3a402ba72502de12ed2277db3c9f472872f44b46`
- launcher merge SHA: `e785815530a59a56787e20ceb6bb232ccc93ad4f`
- exact-main CI: `35500410155` — SUCCESS
- exact-main Five-Patch: `35500410293` — SUCCESS
- qualified-tree CodeQL check: `106050818849` — SUCCESS and same-tree bound
- accepted D-200 run: `35503894414` — SUCCESS / terminal PASS
- artifact: `truyn-class-d200-e91c165c-35503894414`
- artifact ID: `10603748497`
- artifact digest: `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`

The accepted run met the unchanged strict contract: 20/20 hosts, 200 real processes, 10 processes per host, `maxPeers=32`, all-to-all forbidden, readiness 200/200, baseline 400/400, post-restart 100/100 first-attempt with zero application retries, healed routing 200/200, convergence routing 200/200, convergence p95 `256.43 ms`, restart recovery p95 `28,717 ms`, real packet-partition recovery `32,159 ms`, 100 acknowledged durable writes with zero loss, zero safety violations, campaign cleanup confirmed with zero remaining resources, and staging cleanup confirmed with zero remaining resources.

Durable public evidence: [`../benchmarks/CLASS_D_200_2026-09-20.md`](../benchmarks/CLASS_D_200_2026-09-20.md). Sanitized structured telemetry and raw-artifact file digests are stored beside that report.

Class D-500 and Class D-1000 remain **OPEN** and are separate gates. D-200 acceptance does not imply stable/mainnet or long-duration operational stability acceptance.

## Historical immutable failures

Historical D-200 failures remain immutable negative evidence and are not rewritten by the accepted run. Runs `33959493680`, `34411602064`, `34438746312`, `34448411969`, `35462775116`, and `35470182984` remain historical failures/diagnostic evidence and must not be rerun where previously marked single-shot.

PR #597 remains closed unmerged and superseded; it must not be revived or used as a repair base.

Accepted run `35503894414` is also **NEVER_RERUN** because accepted evidence is immutable.

## Execution model retained

The old sequential pattern — full D-200 until first failure, repair one defect, then relaunch — remains rejected. Future D-scale work should retain bounded parallel/non-fail-fast diagnostics, complete lane evidence aggregation, root-cause grouping, targeted requalification, exact-SHA qualification, and fresh single-shot acceptance only after the final candidate is green.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published. Raw diagnostic logs remain in immutable Actions artifacts; durable public reports retain safe structured telemetry, artifact identifiers and cryptographic digests.
