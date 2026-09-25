# N/SOVEREIGNTY-10 — qualification result

Status: **GREEN qualification/smoke**.

Accepted execution lineage: Public Swarm `36175161619`, Public Admission `36175208566`, Private Admission `36175238194`, SOVEREIGNTY-10 `36175269021`.

The 10-node qualification proved the N/SOVEREIGNTY control-plane contract: 3 jurisdiction classes, 2 cloud classes, allowed execution, denial of a deliberately cheaper/faster forbidden candidate, fail-closed behavior when no eligible route exists, data-stays-source behavior, evidence capture, coordinator resource/collision gates and zero observed leak events.

Observed qualification telemetry: 2 allowed executions, 2 policy denials, 0 leak events, and 0 paid provider calls.

The paired values 20 ms versus 24 ms and 1.00 versus 1.10 cost units are deterministic qualification fixtures. They are **not** real Azure/GCP performance measurements and are not a publishable TRUYN latency/cost-overhead claim.

The next N/SOVEREIGNTY cells are 50 and 100. They retain the successful safety semantics but require real unique Azure/GCP nodes/endpoints and real measured RTT p50/p95/p99, throughput, success rate, routing-decision latency, sovereignty overhead, infrastructure/egress cost and forbidden-flow/leak proof.
