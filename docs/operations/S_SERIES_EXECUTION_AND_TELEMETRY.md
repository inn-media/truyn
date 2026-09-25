# TRUYN S-Series Execution Isolation and Telemetry

Status: **EXECUTION CONTRACT IMPLEMENTED / QUALIFICATION ACTIVE — NO S PASS**  
Applies to: `S-50`, `S-100`, `S-200`, `S-500`  
Documentation reconciliation: **2026-09-25**

This document defines the operational boundary for Semantic Scale execution without contaminating D/E/T/H/N benchmark evidence. The old status **`DEFINED / IMPLEMENTATION NOT STARTED` is obsolete**.

## 1. Permanent execution model

S-Series uses the non-bypassable lifecycle:

```text
Frozen Candidate
  -> Swarm fail-collect qualification
  -> Blockwise B01..B22 evidence
  -> Admission to current integration state
  -> targeted zero-paid requalification only for changed S-sensitive blocks
  -> fresh collision/capacity/duplicate-history gate
  -> exactly one explicitly authorized live campaign
```

Expensive qualification binds to the frozen candidate/evidence set, not to moving `main`. Movement of `main` alone does not invalidate frozen evidence and does not authorize a full S rerun. Admission analyzes impact and refreshes only the cheap compatibility snapshot unless an S-sensitive change requires targeted proof.

Canonical contracts:

- `../benchmarks/S_SERIES_FROZEN_CANDIDATE_QUALIFICATION.md`
- `../benchmarks/S_SERIES_SWARM_BLOCKWISE_ADMISSION.md`
- `../benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`
- `../../config/s-series-swarm-blockwise-architecture-lock.json`
- `../../config/s-series-public-contract-manifest.json`

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

## 5. Swarm-Blockwise qualification

Canonical Blockwise coverage is **B01-B22**:

- B01-B16: shared contracts/runtime/control-plane/topology/startup/heartbeat/backpressure/routing/restart/recovery/durability/security/telemetry/cleanup substrate;
- B17: provider access/quota;
- B18: provider WebSocket pressure/reconnect;
- B19: correctness/retrieval;
- B20: provenance/minimal-context;
- B21: zero internal block-ID leakage;
- B22: paired economics.

The current architecture requires all 22 blocks GREEN before a live campaign can be admitted. Frozen GREEN block evidence is reused across unrelated `main` movement. Admission reruns only affected zero-paid/targeted checks when an S-sensitive fingerprint changes.

A historical GREEN SHA by itself never authorizes merge or campaign execution.

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

## 8. Preflight before spend

Before paid inference or large provisioning, every real S run verifies:

- immutable frozen candidate/evidence identity;
- immutable public S contract manifest/pin;
- fresh Admission snapshot and targeted-block status;
- provider/model access for all seven required families;
- compute/provider quota sufficient for the declared run;
- R1/R2 interference, shared-resource/capacity and collision state;
- duplicate-history / exactly-one campaign authorization;
- unique run/resource/artifact namespace;
- cleanup path;
- private budget/stop conditions.

A failed prerequisite yields blocked/preparation failure. It must not partially launch a large benchmark and then reinterpret missing providers or incomplete evidence as success.

## 9. Historical immutability

Historical S attempts are append-only evidence and are never rerun, relabeled or deleted to manufacture GREEN.

S-50 has real attempt history through **Attempt 15**. In particular:

- Attempt 13 produced the earlier `fast_socket_closed` diagnostic class; its bounded WebSocket heartbeat/backpressure/reconnect repair has since been qualified and the old repair tracker is closed;
- Attempt 14, workflow run `35913581603`, is terminal FAILURE and immutable `NEVER_RERUN`;
- Attempt 15, workflow run `35948814208`, is terminal FAILURE and immutable `NEVER_RERUN`; subsequent capacity/429 repair qualification does not rewrite that result.

There is still **no accepted S-50 PASS**. S-100, S-200 and S-500 likewise have no accepted PASS.

## 10. Current factual state

Implemented and qualified architecture includes:

- Frozen Candidate -> Admission-to-Main model;
- automatic qualification fingerprints/manifest policy;
- Swarm fail-collect + mandatory B01-B22 Blockwise evidence;
- target-only requalification after material S-sensitive movement;
- immutable historical evidence and one-shot campaign guards;
- seven-provider live gate and ECON acceptance contract;
- immutable public S contract manifest for private consumption.

The latest known old Blockwise Admission failure `36114076355` did **not** contain a B01-B22 product regression: all B01-B22 were individually GREEN. Its aggregate failed in public-source materialization/control-plane handling. That runtime public-source dependency is superseded by the immutable public-contract consumption model and must not be used as justification for a full Swarm rerun.

Before the next live S-50 successor, private Admission must be freshly GREEN on the admitted private state, with immutable public contract pin, targeted S-sensitive checks (if any), and fresh R1/R2/collision/duplicate-history guards.

## 11. Scale-level acceptance order

Each level is independent acceptance evidence:

1. close S-50 with one fresh admitted successor and immutable accepted PASS evidence;
2. execute and accept S-100 separately;
3. execute and accept S-200 separately;
4. execute and accept S-500 separately;
5. perform independent final-goal reconciliation before declaring the S-Series task complete.

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
