# D-500 Autonomous Control

TASK_ID: `truyn-d500-acceptance-repair-8f3c2a`

Scope: D-500 only. Attempt 11 run `36148344789` is immutable failed evidence and must never be rerun or relabeled.

Execution contract: follow `ready_user_task.md`, `ready_user_sequence.md` S01-S33, `ready_user_goal.md` G1-G54, `AUTONOMOUS_EXECUTION_CONTRACT_FINAL_V4.md`, and `INTELEGENCE_V2.md` from the originating task context.

Task branch: `automation/d500-acceptance-repair-8f3c2a`.

Starting authoritative main for this control capsule: `9fadd5dff9844fd022593c9bbd1c5956c35deee5`. Its only movement from the original D-500 checkpoint `19d8b65f30dca54c9e5b8f9f946d333dd109bece` is an unrelated N-Series controller file, so candidate-owned D-500 qualification is not invalidated by that movement.

Repair inputs under review:
- `d500-attempt12-repair-onto-main.patch`: two-commit patch intended to include the existing Attempt-11 time-budget/fanout repair plus bootstrap resilience repair.
- `d500-bootstrap-resilience-only.patch`: bootstrap-only variant for a tree already carrying the first repair.

Hard gates: preserve real 20x25=500 topology, maxPeers=32, D-200 floors, strict evaluators, safety/recovery/routing/cleanup thresholds, Frozen Candidate -> Sanitation Swarm -> full Blockwise B01-B16 -> Frozen Candidate Qualification -> current-main Admission, and exactly-one successor launch identity/run_attempt=1.

Never merge/launch from this branch merely because patch-local tests are GREEN. Launch authority requires the full exact-candidate chain and live collision/capacity/duplicate guards.