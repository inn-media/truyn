# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current network-scale operational status**. Stable architecture, roadmap, and top-level documentation must link here rather than copy ephemeral run state.

## Current state

Repository sanitation is active under task `truyn-d200-repository-sanitation-2609102033-8f2c`, anchored by GitHub issue #601. Sanitation changes repository source, tests, CI, and documentation only. It does **not** launch or qualify a new real D-200 campaign.

The D-200 acceptance contract remains strict: 20/20 hosts, 200 processes, `maxPeers=32`, routing `>=0.99`, convergence/recovery `<=120000 ms`, 100 acknowledged writes with zero acknowledged-write loss, zero safety violations, and zero remaining cleanup/staging-cleanup resources.

## Historical immutable failures

Runs `34411602064`, `34438746312`, and `34448411969` are historical failed evidence and are **NEVER_RERUN**. Their existence is evidence, not current operational state.

Issue #536 remains the D-200 task-control/history anchor. PR #597 is a stale earlier staging-repair surface and is not the sanitation base.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published.
