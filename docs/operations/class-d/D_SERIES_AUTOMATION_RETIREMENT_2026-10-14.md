# Historical Class-D Auto-Admission Retirement

**State:** CLOSED / AUTO-TRIGGERS DISABLED / STRICT MANUAL ADMISSION RETAINED.
**Effective date:** 2026-10-14. **Authorized by:** explicit project-owner instruction after accepted D-Series scale closure.

## Immutable accepted milestones

| Campaign | Accepted primary run | Independent verification | Authoritative record |
|---|---|---|---|
| D-200 | 35503894414 | 35517248924 | [Network Scale Status](../NETWORK_SCALE_STATUS.md) |
| D-500 | 37666768998 | 37676472133 | [D-500/D-1000](D500_D1000_ACCEPTANCE_STATUS.md) |
| D-1000 | 37687469411 | 37785777704 | [D-500/D-1000](D500_D1000_ACCEPTANCE_STATUS.md) |
| D-5000 | 38130631096 | 38129035985 (Attempt 12 immutable replay; not a repeat of Attempt 13) | [Class D-5000](../../benchmarks/CLASS_D_5000_2026-10-11.md) |

All four bounded scales have already been accepted; no new tests or proof should be manufactured from unrelated application commits. This does not assert the network's long-duration SLO, Stable TRUYN/1 Protocol or Mainnet admission.

## Cause of repeated false-red results

The historical D-200 workflows remained configured to run on every unrelated pull request, triggering both Sanitation Swarm and Blockwise preflight. Their completion invoked Frozen Candidate Qualification, which sometimes reported success while intentionally skipping creation of its qualification manifest because a same-SHA evidence pair did not exist. The Admission Gate then ran via workflow_run and reported `qualification_manifest_missing_after_attempt`; every main push also independently triggered the legacy Admission Gate. This produced recurring red checks unrelated to previously accepted D-Series runs.

## Permanent and bounded correction

The five historical orchestrator workflows are **manual-only**: D-Series Admission Gate; D-Series Frozen Candidate Qualification; D-Series Candidate Self-Admission; D-Series Blockwise Preflight; D-Series Sanitation Swarm. Their automatic `push`, `pull_request` and `workflow_run` events are removed. Their code, exact-source validations, artifact verification, strict failure cases and manual entry points stay available. Blockwise and Swarm retain reusable `workflow_call` interfaces for an explicitly authorized new Class-D qualification.

**Missing manifest remains a hard FAIL when a new candidate is explicitly submitted.** We do not convert absent evidence into success or downgrade retry/security/regression acceptance. The frozen candidate policy and D-series architecture lock remain unchanged; all legacy benchmark artifacts, accepted trees and historical failures are immutable. This change performs no paid inference, provisions no VMs and does not relaunch D/S/T/E/N/H/A campaigns.

A new D-Series candidate requires a separately named task, frozen source SHA, explicit owner approval, a complete fresh Swarm/Blockwise pair and its immutable qualification manifest, current-main admission, fail-closed safety/evidence checks and single authorized execution. It cannot reuse a historical PASS as automatic permission for a new paid campaign.

The machine-readable retirement record is `config/d-series-legacy-automation-retirement.json`. A source-level regression test checks that none of the five retired orchestration workflows can acquire an automatic trigger. Retained Class-D baseline checks in normal CI and Class D Five-Patch Preflight continue to protect changes to runtime contracts.
