# A-Series | Assurance: TIME x REALITY

**Status: FOUNDATION ONLY / not an accepted network, wire, SLO or managed-production gate.**
This is an independent series. It must not mutate D/S/H/T control capsules, their workflow identities, or accepted evidence.

## Repo sovereignty

- **Public `inn-media/truyn`** owns the protocol contract, open conformance/golden vectors, A-WIRE, network node test tooling, A-SOAK, A-OPS, A-SLO measurement definitions and A-NET. Public execution does not import private source, credentials, entitlement logic or production configuration.
- **Private managed repository** owns managed tenants, billing/meter/ledger reconciliation, origin-lock, production secrets, resource placements, budget/capacity leases and A-MGMT. It consumes **released and digest-pinned** public SDK/contracts; never directly mutates public main.
- Cross-repository outputs are sanitized, append-only evidence identifiers, not raw cloud topology or tokens.

## Frozen, independent baseline

The currently accepted evidence is [D-500](../benchmarks/CLASS_D_500_2026-10-07.md) run `37666768998` and [D-1000](../benchmarks/CLASS_D_1000_2026-10-08.md) run `37687469411`, GitHub attempt 2. D-1000's **acceptance minima**, not its observed 100% best points, are the lower bound: baseline/healed routing >=0.99, convergence and restart-recovery p95 <=120,000 ms, acknowledged write loss = 0, and zero accepted invalid signed state, stale/revoked receipt and unauthorized provider executions. Reuse the source `benchmarks/scale/class-d.js` thresholds and packet-partition proof semantics, without re-running D-1000. D-1000's 20-host/1,000-process requirements apply to D-1000 **scale**, not a time-isolating small soak. A-SOAK adds no weaker security or consistency exemptions.

The source methodology requested 1h/3h/6h/24h/72h/7d/30d. The six-hour GitHub-hosted job ceiling leaves no safe 6-hour job margin: **1h and 3h** may run within single hosted jobs; **6h or longer** must use detached VM processes with short orchestration/poll/evaluate jobs. The attached methodology's historical 8h rung is replaced by the user's explicit 6h rung.

### Small WAN assurance topology

- 4 real VMs: **2 Azure + 2 GCP**, 8 real independent signed node processes per VM, **32 total**, RF=3. Reject synthetic/process aliases or same-cloud substitutions.
- Real UDP/QUIC cross-cloud routing; background NEED/RESULT and RF3 durable data; scheduled rolling process churn and actual packet path partition/heal; no paid AI inference required.
- This is **not** D-500's topology; D-500/1000 already isolate scale, assurance isolates **elapsed time**, operational changes and off-team deployment.
- Before allocation: verify Azure & GCP Compute Engine OIDC permissions, quotas, placement, public egress/NAT, costs, region diversity and exclusive resource leases. Previous GCP Cloud Run/Vertex access does **not** prove GCP Compute Engine permission.
- Default `cost=zero / dispatch=disabled` until cost ceiling, cleanup owner, permissions and fresh capacity checks exist. Never run a multi-day fleet from an unbounded workflow.

## A1 SOAK ladder and controller

| Rung | Duration | Execution | Promotion |
|---|---:|---|---|
| 1h | 1h | GH hosted workflow + cloud VMs | complete signed samples and review |
| 3h | 3h | GH hosted workflow + cloud VMs | 1h accepted |
| 6h | 6h | detached VM systemd + short GH controller | 3h accepted |
| 24h | 24h | detached VM | 6h accepted |
| 72h | 72h | detached VM | 24h accepted |
| 7d | 168h | detached VM | 72h accepted |
| 30d | 720h | detached VM | 7d accepted + operator budget approval |

Detached VM `systemd` service keeps an immutable `run_id + rung + source/tree/runtime digest`, UTC heartbeat, per-host signed samples, rolling checkpoints in durable Azure/GCS objects (never rely solely on GH artifact retention), and stop/teardown watchdog independent from GitHub cron delays. GH `workflow_dispatch` starts only after exact-source qualification; scheduled 15m monitor only polls/reads, evaluates, and requests fail-safe abort; postmortem evaluator runs in a new short job. VM-side watchdog enforces stop deadline even if GH cron never runs; cloud lease TTL must cover teardown and trigger orphan cleanup. No restart of an unsuccessful window masquerading as uninterrupted coverage.

At **every** sample: baseline/healed routing minima, convergence when observed, zero safety incidents, authenticated node count / RF3, enough successful NEED/RESULT probes; no imputed successes. Every actual churn/partition/recovery event must meet the accepted event-specific D floor. Reject missing timestamps, telemetry gaps, rebooted clocks, unverified host signatures and any resource drift breaches. Track *per host* RSS, heap, file descriptors, DHT bucket entries and disk/log bytes. A-Series introduces the **new drift SLI**, not a made-up D floor: first measure a warmup/plateau, then pin per-metric absolute ceiling and near-zero positive slope limit **before** attempting acceptance. No predeclared bounds => NOT EVALUATED. Repeated per-host regression can use robust trend estimators; avoid treating expected DHT bootstrap growth as a leak by freezing a documented warmup exclusion before the timer begins. Time without eligible coverage never counts as PASS.

The offline `assurance/evaluate-soak.mjs` is an intentionally conservative **pre-admission** validator: validates 32-process topology, accepted D minima, chronology, sample hash links, resource ceilings and linear slope per host, evidence of actual churn/partition, and durable hour-zero end read. It returns `REVIEW_REQUIRED`, **never** an A-Series terminal PASS. Production admission additionally requires independently validated cloud attestations, true workload, budget lease, exact SHA, immutable evidence archival and cleanup.

## A2 OPS — ≥24h maintenance lane

Inject one-at-a-time rolling upgrade, same-generation optional-field compatibility, config reload, edge cert and Ed25519 identity continuity, DHT backup/cold restore, deliberate bad config + rollback and planned maintenance. Externally measure serving through each operation. Reject any authorization bypass, lost durable write, changed identity/sequence, exceeded SLO recovery or unrecorded maintenance blackout. Private secret rotation control stays private; protocol and reusable fault probes stay public.

## A3 SLO — source contract, never copy targets into a synthetic claim

Use exactly [PRODUCTION_SLO.md](../operations/PRODUCTION_SLO.md). Rolling **28 days**, public HTTP >=99.95%, WebSocket/auth/dispatch/result/owner provider/DHT >=99.90% when applicable; stale <=0.50%; E2E p50/p95/p99 <=5/15/30s; connection <=0.75/2/5s; single-instance recovery p95/p99 <=120/300s; DHT recovery >=99% within 120s; zero non-budgetable security events. Follow its **full numerator/denominator, exclusions and burn policy**, not a simplified percentage. At least one **Azure and one GCP external probe** each minute, with immutable UTC request telemetry; two cloud probes do not replace production request-based events. A percentile with fewer than 100 qualifying observations => INSUFFICIENT_DATA. Missing telemetry => UNKNOWN. Planned maintenance is *not* an exclusion. Freeze a separate 28-day deployment window, don't sum disjoint 1h/3h test windows and call that production compliance. Treat missing production DHT profile as NOT_EVALUATED, not PASS.

## A4 WIRE — 13 canonical objects + Descriptor

Only **offline CI**; do not say `TRUYN/1 stable` while [matrix](../../spec/compatibility/matrix.md) still marks `0.1.0-mvp.2` draft. Enumerate: IDENTITY, OFFER, NEED, OBJECT, CLAIM, ATTEST, STATE, DELTA, SUBSCRIBE, COMPUTE, RESULT, TRUST_RECEIPT, REVOKE. Agent Descriptor separately. Freeze schemas and golden canonical bytes, verify Ed25519/nodeId/replay, structural limits and fuzz crash/hang budget, relay 413 keep-alive regression, SDK conformance in five languages, N/N-1 full bidirectional interoperability including rejection of unknown *required* semantics. A schema-hash regression on all 13 canonical objects blocks **unannounced** breaking changes, not a legitimate versioned change with explicit negotiated migration. This foundation runs existing protocol/interoperability tests; **not yet full conformance/fuzz/freeze**. No stable-matrix flip before all A-WIRE gates PASS.

## A5 NET — public operator reality

`canary -> open-testnet -> mainnet-candidate`. Use issued signed external operator release and open participation; identify *non-team owned* nodes and actual public ISP/NAT/CGNAT paths. Prove Class-B real UDP/QUIC + Class-C WAN/NAT, signed routing, DHT SLO/recovery over at least 7 days independently of operator-submitted self-reports. Adversarial faults, incident response, revocation and security remediation mandatory. No simulated external operators or proprietary registration gate in the public core. Do not automatically open owner-funded AI providers.

## A6 MGMT — private admission

Public must boot/test/run **with private repository absent**. Private platform tests billable usage fail-closed, meter==ledger (same idempotency/execution IDs, authorized adjustments only), no duplicate billing/no free paid execution, origin-lock, certificate and credential continuity, cross-tenant isolation, revocation, incident ledger and the whole applicable 28-day production SLO. Private acceptance is a *separate* terminal and cannot be inferred from public A-NET.

## Sequence / evidence discipline

1. Publish isolated foundation PR and offline A-WIRE starter checks; fix known white-hat regressions before external exposure.
2. Implement true GCP Compute + Azure 2x2 VM provisioning and signed telemetry. No borrowed D-1000 VM count or blanket quota.
3. Only then allow **single 1h** live run and immutable review, followed by 3h.
4. Build supervised detached 6h+ controller, durable checkpoints, cloud lease/TTL/cleanup, progressive 24h/72h/7d/30d.
5. In parallel freeze and verify wire, then enable full 28-day SLO and OPS operations; then non-team NET gates, then private MGMT.

Each run pins source SHA/tree SHA/runtime SHA256, exact `run_id/run_attempt`, frozen limits/owners, operator identities, measurement provenance, UTC sample hash chain, artifacts/digests, terminal status, cleanup records, cost. Every FAILURE / INSUFFICIENT_DATA / UNKNOWN remains immutable **negative** evidence. Missing signed cloud testimony/coverage cannot be promoted to PASS. Security response is **redact-not-delete**. Current state: **FOUNDATION / NO LIVE A-SERIES EXECUTION AUTHORIZED BY THESE FILES**.
