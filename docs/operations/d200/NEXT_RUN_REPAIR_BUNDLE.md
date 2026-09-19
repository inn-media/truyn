# D-200 next-run repair bundle

TASK_ID: `truyn-d200-parallel-closure-260914-a7f3`

This document records the staging-only repair bundle prepared after D-200 run `35462775116` (attempt 1) failed at `restart-recovery` on launcher SHA `2ebdf89bcc31f3bfe32d934c6282b35e524ed72f`, testing `e9583d3e2c7f85d618efead38cb7853d5e8abab3`.

## Immutable failure facts

The failed run proved that provisioning and the pre-restart network were healthy enough to reach the restart phase: 20 hosts / 200 real processes, topology PASS, readiness 200/200, convergence 200/200 with routing success 1.0, baseline 400/400 with routing success 1.0, safety invariants PASS, and 100 acknowledged durable writes.

The campaign stopped in `restart-recovery`. The reported outer line was the parent-side marker parser after one or more host restart scripts failed to produce their final markers; the retained artifact does not identify the exact host-side predicate. Therefore the old run does **not** justify claiming a specific host or predicate as proven root cause.

## Correctness repairs retained for the next run

1. Session binding uses process `instanceId` (with sequence fallback for legacy records). Lease renewal does not discard a live session; a real process restart changes `instanceId` and invalidates stale transport/RPC sessions.
2. Peer-record restart readiness is gated on the Kademlia placement set (`closest(self, fanout)`), not every recovered peer. Dissemination to recovered peers remains best-effort and does not broaden the readiness gate.
3. Persistence is coalesced and unchanged peer-record hearsay does not repeatedly force whole-state snapshot/fsync work.
4. D-200-specific regressions cover restart placement, renewal/session races, persistence amplification and fail-closed durability.

## Stage-isolated cloud campaign orchestration

The next D-200 must execute the canonical campaign through `scripts/d200-stage-isolated-campaign.sh` after provisioning.

The orchestrator:

- splits the canonical campaign only at top-level `STAGE=...` boundaries;
- executes each stage in an isolated subshell;
- records `PASS`, `RED`, or `SKIPPED_DEPENDENCY` for every stage;
- preserves the first real failure as the durable failure anchor;
- continues every later stage that is still meaningful;
- skips `write-retention` only when `durable-writes` did not PASS;
- skips canonical final evidence on any earlier mandatory RED/SKIP and rebuilds strict partial evidence after diagnostics;
- archives any stage-local early failure checkpoint separately before rebuilding final partial evidence;
- keeps Azure resource cleanup owned by the provisioner EXIT trap and therefore runs it only after the diagnostic pass finishes;
- returns non-zero when any mandatory stage is RED/SKIPPED, so acceptance is never weakened.

The stage plan itself is fail-closed: an empty plan or a plan missing required restart/post-restart/partition/healed/resources/evidence stages is RED.

## Restart-recovery diagnostic hardening

`benchmarks/scale/d200-restart-recovery-stage.sh` always captures per-host remote rc, logical rc, stdout/stderr-derived markers, readiness counts, pending propagation count, valid peers, buckets, remote-host diversity, refresh status, and the last failing local node before the stage returns RED.

Logical readiness failure does not return a non-zero Azure RunCommand exit from the remote script. This prevents the existing `remote()` retry wrapper from replaying a mutating restart several times. The parent interprets `RESTART_LOGICAL_RC` and `READY` strictly instead.

The literal READY assertion required by existing regression tests is preserved:

```bash
[[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]
```

Per-host evidence is emitted to `class-d-200-restart-recovery-hosts.json` and `class-d-200-restart-recovery-host-output.log`.

## Acceptance remains strict

The GitHub acceptance launcher already requires both campaign rc = 0 and evaluator rc = 0, plus cleanup, durability and artifact gates, before emitting `TRUYN_D200_TERMINAL result=PASS`. Stage isolation changes diagnostic completeness only; it does not convert a RED/SKIP into PASS.

The existing one-shot launcher must **not** be reused as-is. After this source bundle is merged and exact-main CI/CodeQL are GREEN, prepare a separate launcher-only freeze commit pinned to that exact tested SHA/tree and update its campaign command to source the stage-isolated orchestrator. Only that new qualified launcher may start the next acceptance run.

## Still separate from correctness acceptance

Infrastructure speedups remain a separate layer: parallel provisioning/install across different VMs, later parallel host-level post-restart/healed/resources commands while keeping commands to one VM sequential, 4-vCPU placement preference, and eventually a Compute Gallery image. They must not weaken or replace the correctness gates above.
