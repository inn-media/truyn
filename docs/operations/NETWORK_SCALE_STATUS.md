# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current network-scale operational status**. Stable architecture, roadmap, and top-level documentation must link here rather than copy ephemeral run state.

## Current state

Repository sanitation task `truyn-d200-repository-sanitation-2609102033-8f2c` is **COMPLETE** under issue #601. PR #602 was merged and its recorded post-merge CI and CodeQL qualification succeeded. Sanitation established the canonical D-200 contract/anti-weakening floor, permanent regressions, repository hygiene, affected-test mapping, parallel CI lanes, full qualification, and evidence-preservation rules. It intentionally did **not** launch a new real D-200 and did **not** implement the Bug Hunt Swarm.

The active closure task is `truyn-d200-parallel-closure-260914-a7f3`, anchored by issue #536. Its goal is a fresh real Class D-200 acceptance campaign with authoritative `TRUYN_D200_TERMINAL=PASS`; diagnostics, CI, merge, and cloud preflights are intermediate evidence only.

The active D-200 closure candidate is being rebuilt on exact `main@8c6ec3acd169d05d997ae651989f898d16ad3eb0` after unrelated Open 1.0 main movement; all qualification from earlier candidate SHAs remains historical evidence and does not qualify the rebuilt candidate.

The D-200 acceptance contract remains strict: 20/20 hosts, 200 processes, 10 nodes per host, `maxPeers=32`, all-to-all forbidden, routing `>=0.99`, convergence/recovery `<=120000 ms`, 100 acknowledged writes with zero acknowledged-write loss, zero safety violations, and zero remaining campaign/staging-cleanup resources. Peer-record TTL and bootstrap lease-freshness floors remain unchanged-or-stricter.

No authoritative fresh D-200 PASS exists yet.

## Historical immutable failures

Runs `34411602064`, `34438746312`, and `34448411969` are historical failed evidence and are **NEVER_RERUN**.

Run `33959493680`, previously described in stale documentation as in progress, is actually a completed **failure** with `run_attempt=1`; it is historical diagnostic evidence and must not be rerun.

PR #597 is closed unmerged and superseded. It must not be revived, merged, or used as the mutation base for current D-200 closure.

## Current execution model

The old sequential pattern — full D-200 until first failure, repair one defect, then relaunch — is rejected. Current closure uses bounded parallel/non-fail-fast diagnostics, complete lane evidence aggregation, root-cause grouping, targeted requalification, and a fresh full D-200 only after the final exact candidate is fully qualified.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published.
