# TRUYN Roadmap

This roadmap records **next bounded gates from current factual maturity**. It is not evidence. Normative semantics live in `spec/`; canonical current status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured evidence lives in `docs/benchmarks/`.

**Documentation audit:** 2026-09-23  
**Audited public main:** `3a1f7e67b80cecf678d373e33db9ceb09098e8a4`  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**  
**Stable mainnet:** **not declared**

## Current top-level state

| Track | Current factual state | Next bounded gate |
|---|---|---|
| Network / D-Series | Class C + D-100 + D-200 accepted; D-500 attempted but not accepted; D-1000 open | D-500 repair/requalification → fresh immutable PASS; then D-1000 |
| Semantic Scale / S-Series | implementation + blockwise/exact-head qualification active; no S PASS | close exact-head/B01–B16/collision gates → one immutable S-50 acceptance campaign |
| Efficiency / E-Series | methodology plus public validator/recompute implementation qualified; no E benchmark PASS | exact-head/isolation/provider qualification → measured E lanes |
| SDK/DX | five clients/conformance implemented; npm/PyPI/Go accepted | usable-interface parity + Maven/NuGet + developer-site evidence |
| Agent Descriptor | serving/fetch/signature + bounded refresh/re-sign implemented | complete endpoint/interface negative and mapping parity |
| A2A/MCP | bounded pre-v1 profile accepted | stable-v1 only after TRUYN protocol/ecosystem stability |
| NLWeb | pinned 0.5 bounded profile accepted | later upstream profile only via explicit requalification |
| Production operations | contracts implemented | live SLO/alert/on-call/DR evidence |
| Managed authority | private-platform implementation boundary | live managed deployment/reconciliation evidence |
| T-Series | implementation/qualification work active; no final commercial benchmark PASS | exact-head + zero-paid/provider qualification → immutable measured campaigns |
| H-Series | foundation/managed execution track; no final H PASS | isolated pilots → immutable evidence |
| Governance | G1 bootstrap Founding Stewardship | external maintainers → multi-org TSC → neutral stewardship |

## 1. Network scale

Accepted:

- [x] Class C heterogeneous WAN.
- [x] Class D-100.
- [x] Class D-200 canonical acceptance + independent repeatability.

Open:

- [ ] **D-500** — historical immutable attempts exist; latest run `35787480348` ended `cancelled`, therefore no PASS. Next work is evidence-driven repair and fresh exact-head acceptance, never rerun/relabel of an old attempt.
- [ ] **D-1000** — only after a qualified candidate; D-200/D-500 evidence never substitutes for this gate.
- [ ] long-duration operational stability and mainnet closure.

Canonical live status: `docs/operations/NETWORK_SCALE_STATUS.md`.

## 2. S-Series semantic scale

S-Series is no longer design-only. Public runtime diagnostics and private managed S-50 execution/qualification machinery are active, but **no S-Series PASS is currently accepted**.

Required order:

1. [ ] reconcile public/private exact SHAs and frozen benchmark source;
2. [ ] complete B01–B16/blockwise preflight on the exact candidate;
3. [ ] confirm shared-resource/capacity collision state is clean;
4. [ ] execute exactly one new immutable S-50 acceptance attempt when all gates are GREEN;
5. [ ] publish/reconcile durable sanitized S-50 evidence;
6. [ ] only then advance S-100 → S-200 → S-500 as separate gates.

Scenario definitions remain `ECON`, `MIX`, `XBORDER`, `CHAIN`, `CHURN`, `COST-ROUTING`, `CONTENTION`, `LANG`; the benchmark contract remains authoritative for thresholds and evidence semantics.

Architecture: `docs/architecture/SEMANTIC_SCALE_S_SERIES.md`.  
Contract: `docs/benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md`.  
Execution: `docs/operations/S_SERIES_EXECUTION_AND_TELEMETRY.md`.

## 3. E-Series efficiency limits

The public E-Series is beyond documentation-only foundation: the validator/recompute implementation under `benchmarks/e-series/` has been exact-head qualified. That **does not** constitute an E benchmark result.

Next gates:

- [ ] finish exact public/private qualification and R0/R1/R2 isolation/collision checks;
- [ ] finish the exactly-once provider-smoke boundary without duplicate paid calls;
- [ ] qualify request/stage/cost attribution and sanitized recomputation;
- [ ] run `E/DECOMPOSE` measured campaign;
- [ ] run `E/PER-RESULT` paired useful-result campaign;
- [ ] run `E/KNEE` only on frozen comparable scale points;
- [ ] run `E/DEGRADE` overload/recovery campaign;
- [ ] independently recompute and publish safe immutable evidence.

Canonical contract: `docs/benchmarks/E_SERIES_EFFICIENCY.md`.  
Telemetry: `docs/benchmarks/E_SERIES_TELEMETRY.md`.  
Execution: `docs/operations/E_SERIES_EXECUTION.md`.

## 4. SDK / Developer Release

Completed factual steps:

- [x] JavaScript/TypeScript, Python, Go, Java and C#/.NET first-party clients.
- [x] shared five-language executable conformance.
- [x] npm `@truyn/sdk@0.1.0-alpha.2` accepted immutable release.
- [x] PyPI `truyn-sdk==0.1.0a1` accepted immutable release.
- [x] Go `sdk/go@v0.1.0-alpha.1` accepted immutable release.
- [x] Agent Descriptor signed serving/fetch verification.
- [x] bounded automatic Descriptor refresh/re-sign before expiry.

Open release/DX gates:

- [ ] complete usable-interface endpoint validation/mapping parity across all five clients;
- [ ] Maven Central immutable public publication evidence;
- [ ] NuGet.org immutable public publication evidence;
- [ ] generated-package byte-content leakage scanning closure;
- [ ] live public developer-site activation/liveness evidence;
- [ ] stable release only after protocol/ecosystem criteria are explicitly met.

## 5. A2A / MCP and NLWeb

A2A/MCP C1–C8 + **P2-E1/P2-E2/P2-E3** are accepted as a bounded pre-v1 profile. P2-E2 fixes compatibility generation `a2a-mcp-pre-v1/g1`. **Stable A2A/MCP v1 is not declared** while `TRUYN/1` remains draft. NLWeb protocol 0.5 has bounded pinned executable evidence. Neither track is allowed to silently broaden itself through documentation wording.

Open:

- [ ] stable A2A/MCP v1 after TRUYN/1 stability and ecosystem evidence;
- [ ] later NLWeb upstream profiles only through explicit compatibility diff + black-box requalification.

## 6. Production operations / managed authority

Repository contracts exist for SLI/SLO, observability/alerting, rotation/on-call and recovery/DR. Managed authority/commercial control-plane implementation lives in `inn-media/truyn-platform`.

Still required before production/mainnet claims:

- [ ] live deployed SLO telemetry and burn-rate evidence;
- [ ] alert/pager test-fire and acknowledged on-call rotation evidence;
- [ ] real backup/restore/failover drill evidence;
- [ ] live managed authority deployment and reconciliation evidence;
- [ ] bounded security/credential rotation evidence;
- [ ] long-duration operational stability.

## 7. T-Series and H-Series

T/H are independent measured-value tracks. Their implementation/qualification activity must not be presented as final benchmark results.

- [ ] T/BREAK-EVEN, T/HEAD-TO-HEAD and T/PREDICT require frozen manifests and immutable evidence.
- [ ] H/CACHE-COMPOUND, H/SECOND-OPINION, H/ARBITRAGE and H/CHAOS-FUZZ require isolated qualified pilots before final claims.

All D/S/E/T/H work follows `docs/benchmarks/BENCHMARK_SERIES_ISOLATION.md`: R0 may be shared immutably; R1 requires attribution/interference detection; R2 mutation is exclusive.

## 8. Governance and stable release

Stable `TRUYN/1`, stable mainnet and neutral governance are separate gates. None is implied by code volume, one benchmark family, SDK API version `1`, or a pre-release package.

Near-term governance path:

- [ ] external maintainers;
- [ ] multi-organization TSC;
- [ ] documented neutral stewardship transition criteria.

## Roadmap rule

A checked roadmap item means the bounded implementation/evidence named by that item is actually accepted. Historical sprint checkpoints remain useful audit history but do not override `docs/architecture/IMPLEMENTATION_STATUS.md`.
