# TRUYN S-Series Execution Isolation and Telemetry

Status: **S-10 + S-20 + S-50 ACCEPTED / EXECUTION CONTRACT ACTIVE — S-100+ OPEN**  
Applies to: `S-10`, `S-20`, `S-50`, `S-100`, `S-200`, `S-500`  
Documentation reconciliation: **2026-09-25**

This document defines the operational boundary for Semantic Scale execution without contaminating D/E/T/H/N benchmark evidence. The old status **`DEFINED / IMPLEMENTATION NOT STARTED` is obsolete**.

## 1. Permanent execution model

The active S-N acceptance lifecycle is:

```text
Exact immutable candidate SHA
  -> minimal live preflight
  -> exactly one real live S-N execution
  -> post-run evidence and acceptance reconciliation
```

Moving `main` alone does not invalidate the frozen candidate. The active path must not add redundant cascading pre-gates that do not protect a real safety, identity, quota, duplication or evidence invariant.

Historical Frozen Candidate / Swarm fail-collect / B01-B22 Blockwise / Admission evidence remains append-only qualification history and is available for targeted diagnostics or requalification when a concrete S-sensitive defect requires it. It is not a mandatory prerequisite chain for every new S-N run.

Acceptance thresholds, provider requirements, public/private boundaries and exactly-one execution semantics remain unchanged.

Canonical contracts:

- `../benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`
- `../../config/s-series-public-contract-manifest.json`
- historical qualification references: `../benchmarks/S_SERIES_FROZEN_CANDIDATE_QUALIFICATION.md`, `../benchmarks/S_SERIES_SWARM_BLOCKWISE_ADMISSION.md`

## 2. Public/private dependency boundary

Public `inn-media/truyn` owns reproducible methodology, contracts, generic/reference behavior and sanitized evidence. Private `inn-media/truyn-platform` owns managed orchestration, real cloud/provider identities, quotas, budgets, raw evidence and paid campaign control.

Private S automation consumes public authority through the immutable S public-contract manifest/pin. Private Admission must not clone or checkout mutable public source at runtime. A public S contract revision requires an explicit manifest/pin update and a new qualification decision; unrelated movement of public `main` is not a runtime dependency.

Public never depends on private source.

## 3. Parallel-track and resource isolation

D-Series and S-Series are independent benchmark tracks. S-Series never modifies or reuses a frozen D-Series launcher, launch token or accepted evidence file. Shared reusable public substrate may be exercised only through the declared S qualification boundary.

Cross-series resource classification follows `../benchmarks/BENCHMARK_SERIES_ISOLATION.md`:

- R0 immutable/read-only resources may be shared;
- R1 shared services require distinct attribution and interference checks;
- R2 mutable capacity/cache/index/fault targets are exclusive.

If another measured series owns an exact shared mutable R2 target, S records/waits instead of cancelling, perturbing or cleaning the owner run.

## 4. Provider and spend boundary

S-Series uses owner-authorized benchmark provider access only. The fail-closed invariant remains:

```text
unauthorized requester
-> authorization DENY
-> adapter.execute() not called
-> provider calls = 0
-> owner-funded tokens/cost = 0
```

Credentials, real service identities, private endpoints, allowlists, quotas and spend ceilings never enter public evidence.

The fixed required provider families remain:

`GPT`, `Gemini`, `Grok`, `DeepSeek`, `Llama`, `Mistral`, `Kimi`.

Provider substitution is forbidden. `blocked_access`, missing quota/deployment or unavailable required provider is incomplete/RED, not a reduced-provider PASS.

## 5. Qualification evidence

Historical B01-B22 Swarm-Blockwise evidence remains valid append-only diagnostic material. It must not be deleted, relabeled or used to weaken acceptance.

For current live S-N execution, qualification is targeted: only concrete S-sensitive changes or observed defects justify additional zero-paid or bounded diagnostic checks before the next immutable attempt. A historical GREEN SHA alone never authorizes a live campaign.

## 6. Common hard gates

The exact benchmark contract remains authoritative. Common S-Series boundaries include:

- routing/retrieval/answer correctness `>=99%` where exercised;
- provenance verification `100%`;
- minimal-context correctness `100%`;
- internal block-ID leakage `0`;
- provider WebSocket heartbeat/backpressure/reconnect closure GREEN;
- exactly-once provider execution where reconnect semantics are exercised;
- paired input-token reduction `>=90%`;
- paired comparable variable inference-cost reduction `>=90%`;
- zero unauthorized owner-funded provider execution;
- no acceptance/security threshold weakening.

## 7. Telemetry contract

Every measured record carries immutable run identity plus enough ordering/timestamp information to reconstruct the run. Required evidence layers are:

1. node/readiness identity and placement class;
2. request/provider timing, usage and terminal status;
3. semantic retrieval/provenance correctness;
4. chain/hop correlation where exercised;
5. network/run routing/recovery/write/safety/cleanup state;
6. paired DIRECT/TRUYN economic evidence for ECON.

Provider usage uses authoritative provider values where available; unknown values are `null`, never fabricated estimates. Gross/list-price-equivalent provider cost and net cash/credit-covered cost remain separate fields. Percentage claims preserve exact formula inputs.

Comparable S-50/S-100/S-200/S-500 runs emit the same normalized fields. **No interpolation or extrapolation substitutes for an unexecuted S level.**

## 8. Minimal preflight before spend

Before paid inference, every real S run verifies only the invariants necessary to make the run attributable and safe:

- exact immutable candidate identity;
- immutable public S contract/release pin;
- all seven required provider/model paths available;
- budget/quota/capacity conditions required for the declared run;
- no duplicate or already-active identical live attempt;
- unique run/resource/artifact namespace;
- cleanup path and bounded stop conditions.

A failed prerequisite yields blocked/preparation failure. It must not be converted into a reduced-provider or partial PASS.

## 9. Historical immutability

Historical S attempts are append-only evidence and are never rerun, relabeled or deleted to manufacture GREEN.

S-50 has real attempt history through **Attempt 15**. In particular:

- Attempt 13 produced the earlier `fast_socket_closed` diagnostic class; its bounded WebSocket heartbeat/backpressure/reconnect repair has since been qualified and the old repair tracker is closed;
- Attempt 14, workflow run `35913581603`, is terminal FAILURE and immutable `NEVER_RERUN`;
- Attempt 15, workflow run `35948814208`, is terminal FAILURE and immutable `NEVER_RERUN`; subsequent capacity/429 repair qualification does not rewrite that result.

**S-10 Attempt 6 is accepted / PASS** as the bounded ECON/MIX integration baseline. **S-20 Attempt 3 is accepted / PASS** for `ECON`, `MIX`, `COST-ROUTING`, `CONTENTION` and `LANG`. Public sanitized evidence: `../benchmarks/S_SERIES_S10_2026-10-07.md` and `../benchmarks/S_SERIES_S20_2026-10-07.md`. `XBORDER`, `CHAIN`, `CHURN` and S-50+ remain independently OPEN.

## 10. Current factual state

Accepted S-10 evidence remains the bounded integration baseline.

Accepted S-20 Attempt 3 evidence adds a 20-node five-scenario checkpoint:

- ECON/MIX: 60/60 correct, seven providers, 97.0939465610686% input-token reduction;
- COST-ROUTING: 20 requests, zero eligibility/authorization violations, 100% policy-hit/routing/answer/retrieval/provenance;
- CONTENTION: 20/20 concurrent completions, zero retries/timeouts/cancellations/cascading failures;
- LANG: EN/TR/ZH/RU/AZ each at 100% retrieval/answer/provenance with zero block-ID leakage.

Attempt 1 and Attempt 2 remain immutable failure evidence. Attempt 3 is the accepted checkpoint. Raw private evidence remains private; the public report exposes sanitized metrics plus the raw-artifact cryptographic digest.

## 11. Scale-level acceptance order

Each level is independent acceptance evidence:

1. preserve accepted S-10 evidence as the bounded integration baseline;
2. preserve accepted S-20 five-scenario evidence;
3. preserve accepted S-50 eight-scenario scale evidence and its immutable attempt lineage;
4. analyze the S-50 contention/backpressure curve without redefining the accepted S-50 gate;
5. execute and accept S-100 separately;
6. execute and accept S-200 separately;
7. execute and accept S-500 separately;
8. perform independent final-goal reconciliation before declaring the S-Series task complete.

Passing one level never implies a larger level.

## 12. Evidence closure

An accepted run must freeze:

- normalized telemetry/evidence;
- exact candidate, public-contract pin, private execution and run identities;
- qualification/admission manifest and affected-block decision;
- artifact digest manifest;
- terminal PASS/FAIL/INVALID classification;
- cleanup confirmation;
- public sanitized report with limitations;
- cryptographic identities for withheld unsafe raw artifacts where required.

Temporary Actions artifacts are supplementary. The durable reconciled record is the acceptance authority.
