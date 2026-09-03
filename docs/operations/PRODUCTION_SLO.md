# TRUYN Production SLI / SLO Contract

**Status:** defined production target contract; not yet an accepted production SLO claim.  
**Scope:** first-party TRUYN relay/network/runtime surfaces operated as production infrastructure.  
**Protocol:** `TRUYN/1` draft.  

This document defines the numerical service-level indicators (SLIs), service-level objectives (SLOs), measurement windows, exclusions and error-budget policy required before TRUYN may claim the relevant deployment class is **Productionized**.

It is intentionally separate from benchmark and scale-acceptance gates. Class C, D-100, D-200 diagnostics and D-1000 thresholds prove bounded network behavior under specified campaigns; they do **not** by themselves establish a continuously measured production SLO.

Until production telemetry, alerting, on-call ownership and durable evidence satisfy this contract, every objective below is a **target**, not a statement that current production has already met it.

## 1. Principles

1. **User-visible first.** SLIs measure whether an eligible requester can use the service, not whether a process is merely running.
2. **No averaging away failures.** Each SLO is evaluated independently. A strong HTTP SLO cannot compensate for a failed RESULT-delivery SLO.
3. **Security invariants are not spendable error budget.** Unauthorized provider execution, cross-request result delivery and accepted forged authority have a target of zero and fail closed.
4. **Published capacity matters.** Load within the published production envelope counts. Traffic beyond a documented capacity/rate contract may be excluded only with an attributable reason code.
5. **No maintenance loophole.** Planned maintenance counts against availability if users lose the contracted service; maintenance is not an automatic exclusion.
6. **No silent denominator editing.** Every exclusion must be machine-attributable and reviewable. Manual removal of inconvenient failures is forbidden.
7. **Dependency semantics are explicit.** Failures of first-party/owner-operated cloud dependencies count against the relevant first-party service SLO. User-owned BYOK upstream failures do not count against the core relay SLO, but remain visible in separate provider telemetry.

## 2. Service classes

The contract separates four service classes so unrelated behavior is not mixed into one percentage.

### A. Relay edge / control plane

Public HTTP, WebSocket, authenticated session and signed request handling owned by the TRUYN-operated relay path.

### B. First-party provider runtime lane

TRUYN-operated provider runtimes and their owner-operated upstream model dependencies. This does not grant public access to owner-funded providers; authorization remains a separate fail-closed boundary.

### C. Network / DHT lane

Authenticated peer-session, Kademlia lookup/routing and recovery behavior for a productionized decentralized network profile. This SLO remains **NOT EVALUATED** until that production network profile is actually activated and instrumented.

### D. BYOK / external provider lane

User-owned external provider credentials and upstream APIs. TRUYN measures this lane, but third-party upstream failures are not charged to the core relay SLO. TRUYN-owned failures before or after the upstream call still count against the appropriate TRUYN SLO.

## 3. Primary measurement window

The canonical SLO window is a **rolling 28 days**.

Supporting operational windows are:

- `5 minutes` — fast incident detection;
- `30 minutes` — fast/medium confirmation;
- `1 hour` — fast burn-rate paging;
- `6 hours` — sustained burn-rate paging;
- `24 hours` — slow-burn detection;
- `28 days` — canonical compliance and error-budget accounting.

Availability probes SHOULD run at least once per minute from more than one independent external vantage point for public relay surfaces. Request-based SLIs use all qualifying production events, not samples, unless the metric is explicitly synthetic.

For percentile SLIs, a 28-day result with fewer than `100` qualifying observations is reported as **INSUFFICIENT_DATA**, not PASS. A production acceptance gate may supplement low organic traffic with documented synthetic transactions that exercise the same public path.

All timestamps are evaluated in UTC and all latency measurements use monotonic elapsed time at the measuring process where possible.

## 4. Canonical SLIs and numerical SLOs

| ID | SLI | Numerical production SLO | Qualifying population / definition |
|---|---|---:|---|
| `SLO-HTTP-1` | Relay HTTP availability | **>= 99.95%** | Public relay HTTP probes/eligible requests that reach the intended edge and receive a syntactically valid TRUYN success or documented client/protocol response instead of transport failure or unexpected 5xx. |
| `SLO-WS-1` | Relay WebSocket availability | **>= 99.90%** | Eligible WebSocket connection attempts that complete upgrade, authenticated registration and session-ready transition within the connection latency ceiling. |
| `SLO-AUTH-1` | Authenticated request success | **>= 99.90%** | Valid, fresh, correctly signed, authorized requests within published limits that complete the intended relay control-plane operation without unexpected 5xx, transport abort or internal protocol failure. |
| `SLO-DISPATCH-1` | `NEED -> provider` dispatch success | **>= 99.90%** | Authorized NEEDs for which at least one currently eligible provider is advertised; success means exactly one valid dispatch is accepted by an eligible provider or the protocol returns a documented deterministic pre-dispatch outcome. Unauthorized execution never counts as success. |
| `SLO-RESULT-1` | RESULT delivery success | **>= 99.90%** | Valid correlated terminal RESULTs accepted from an authorized provider that are delivered to the eligible requester/result channel without cross-request substitution, duplication or unexplained loss. |
| `SLO-PROVIDER-1` | First-party provider-runtime availability | **>= 99.90%** | Time/requests during which an owner-operated runtime is healthy, registered where required, policy-valid and able to accept an authorized execution for its advertised capability. |
| `SLO-DHT-1` | Healthy-state DHT/routing lookup success | **>= 99.90%** | Production DHT lookups issued while the network is outside an active recovery interval that resolve a valid reachable result or valid signed absence within `5 s`. |
| `SLO-STALE-1` | Stale route/provider selection rate | **<= 0.50%** | Route/provider selection attempts that choose a stale/unreachable record and require rejection/failover before successful dispatch. A stale selection causing terminal user failure also counts against the applicable dispatch/request SLO. |
| `SLO-E2E-LAT-1` | End-to-end synchronous request latency | **p50 <= 5 s; p95 <= 15 s; p99 <= 30 s** | Accepted synchronous first-party text/control NEED from relay acceptance to correlated terminal RESULT delivery. Async image/video jobs and explicitly long-running capabilities use separate capability contracts and are excluded from this percentile. |
| `SLO-CONNECT-LAT-1` | Connection establishment latency | **p50 <= 750 ms; p95 <= 2 s; p99 <= 5 s** | Public edge connection start to authenticated session-ready state, including HTTP/TLS/WebSocket/registration work applicable to the connection type. |
| `SLO-RECOVERY-1` | Single-instance service recovery | **p95 <= 120 s; p99 <= 300 s** | Qualifying unplanned loss of one relay/provider instance from confirmed failure to restoration of SLO-eligible serving capacity without weakening authorization/security boundaries. |
| `SLO-DHT-RECOVERY-1` | Routing recovery after a qualifying peer/partition heal event | **>= 99% successful routing within 120 s** | Productionized network recovery event using the same externally observable route-success semantics as the steady-state SLI; this is an operating objective, not a substitute for D-1000 acceptance. |

### 4.1 HTTP availability numerator / denominator

For `SLO-HTTP-1`:

```text
numerator   = qualifying HTTP events with expected service/protocol response
denominator = all qualifying HTTP events
SLI         = numerator / denominator
```

Expected documented client outcomes such as `400`, `401`, `403`, `404`, `409`, `413` or `429` are not service failures when they are the correct response to an invalid/ineligible request. An unexpected `5xx`, edge/origin timeout, connection reset, DNS/TLS failure on the intended public path or malformed server response is a service failure.

A valid request rejected with `429`/backpressure **within** the published supported load envelope counts as a service failure. Above the published envelope it may be excluded with an explicit `capacity_exceeded_out_of_contract` reason.

### 4.2 WebSocket availability

A TCP/TLS/WebSocket upgrade alone is insufficient. `SLO-WS-1` succeeds only after the session reaches the authenticated ready state required for normal TRUYN traffic.

A session that upgrades but cannot register because of a TRUYN-owned internal error is a failure. Correct rejection of invalid identity, stale registration, replay or unauthorized access is not a failure.

### 4.3 Authenticated request success

The denominator includes requests that are:

- structurally valid;
- fresh/replay-safe;
- cryptographically valid;
- authorized for the requested operation;
- within documented payload/rate/concurrency limits.

Correct fail-closed denial of unauthorized or malformed input is security success and is excluded from this availability denominator while still being counted in security telemetry.

### 4.4 Dispatch success

A dispatch attempt begins only after relay authentication/authorization and capability/provider eligibility resolution succeed.

Success requires one of:

1. exactly one eligible provider accepts the dispatch; or
2. a documented deterministic pre-dispatch outcome such as requester cancellation before provider acceptance.

`no_provider_available` is not a dispatch failure when no provider satisfying the requested policy was advertised at acceptance time. Selecting an advertised provider and then losing the request due to stale state, internal routing failure or relay/provider-host fault counts as failure.

Duplicate remote execution is never counted as success.

### 4.5 RESULT delivery success

A provider-side model failure that produces a valid correlated TRUYN terminal error/result is considered **delivered** for this SLI; the provider-lane execution outcome is measured separately. RESULT loss, wrong-request correlation, duplicate terminal delivery or failure to reach an otherwise eligible requester/result store is a TRUYN delivery failure.

Requester cancellation before terminal result generation is excluded. Late output after accepted cancellation must be rejected and is not a successful delivery.

### 4.6 First-party provider-runtime availability

This objective measures the owner-operated serving lane, including TRUYN runtime and owner-operated upstream cloud/model dependency needed for the advertised capability. A runtime that reports health but cannot accept authorized work is unavailable.

BYOK upstream failures are reported under the BYOK lane and do not reduce `SLO-PROVIDER-1` unless the failure is caused by TRUYN-owned credential handling, routing, authorization or runtime behavior.

### 4.7 DHT/routing health

`SLO-DHT-1` applies only after a productionized DHT/mainnet profile exists. Until then it is `NOT_EVALUATED` and MUST NOT be reported as PASS based on testnet or D-100/D-1000 benchmark results.

Active recovery intervals are measured by `SLO-DHT-RECOVERY-1` rather than removed from all reporting. The incident still affects any user-visible request/availability SLO that failed during that interval.

### 4.8 Stale/failure rate

A record is stale for this SLI when it passes stored-record parsing but points to a peer/provider that is no longer usable under the current signed identity/session/policy state and therefore causes a failed first selection.

The target is not permission to execute stale authority. Stale or revoked authorization must still fail closed.

## 5. Latency semantics

### 5.1 End-to-end latency

For `SLO-E2E-LAT-1`:

```text
start = relay accepts an authorized synchronous NEED
end   = correlated terminal RESULT is available to the requester delivery path
```

The percentile therefore includes relay, network, provider queue/runtime and owner-operated upstream inference for the first-party synchronous lane.

The following are excluded from this percentile but must have separate telemetry:

- explicitly asynchronous image/video generation;
- capabilities whose published contract declares a longer execution class;
- BYOK provider inference time when the user owns the upstream dependency;
- requester-induced pause/cancellation.

TRUYN processing overhead SHOULD additionally be recorded separately so service-owned latency can be distinguished from model execution time.

### 5.2 Connection latency

Connection latency measures the complete usable session path rather than raw TCP connect time. Synthetic probes should use the same public edge hostname and auth/session flow as production clients.

## 6. Recovery semantics

`SLO-RECOVERY-1` covers a single-instance failure only. Multi-region disaster recovery, durable-state corruption and catastrophic key-loss scenarios require separate DR/RTO/RPO contracts and exercises.

A recovery clock starts when the failure is externally detectable by the production health/telemetry path and stops when replacement capacity can successfully complete a qualifying synthetic/user transaction.

Recovery that broadens provider visibility, disables authorization, bypasses origin protection, loses intended node identity or silently discards required durable state is **not** successful recovery.

The existing network campaign limit `recovery/convergence p95 <= 120 s` remains a scale-test acceptance threshold. The numerical coincidence with this SLO does not make benchmark evidence a continuous production measurement.

## 7. Security and correctness invariants: zero error budget

The following are non-budgetable. A confirmed event is an incident even if all percentage SLOs remain green:

- unauthorized owner-funded provider execution: **0**;
- accepted forged requester/provider/billing authority: **0**;
- cross-request RESULT injection/substitution: **0**;
- duplicate provider execution where exactly-once execution is required: **0**;
- execution after accepted requester cancellation where policy requires abort/rejection: **0**;
- leakage of provider credentials/private keys/origin proof through public diagnostics: **0**;
- recovery or failover that intentionally weakens an authorization/security gate: **0**.

These invariants trigger the security/incident process and cannot be "paid for" with availability error budget.

## 8. Exclusions

Only the following classes may be excluded from a specific request SLI denominator, and every exclusion must carry a stable machine-readable reason:

- malformed request;
- invalid signature/identity;
- replay/stale registration;
- unauthorized/forbidden provider or operation;
- unsupported capability with no eligible advertised provider;
- requester cancellation before the measured service obligation begins/finishes;
- traffic above an explicitly published capacity/rate/concurrency envelope;
- BYOK upstream provider failure for an SLO that explicitly measures only TRUYN-owned service.

The following are **not automatic exclusions**:

- planned maintenance;
- TRUYN deployment/release mistakes;
- cloud/region failure affecting a first-party production service;
- first-party provider quota exhaustion;
- expired first-party credentials/proofs;
- telemetry gaps caused by TRUYN-operated infrastructure;
- incidents with no known root cause.

If the measurement system cannot determine whether an event qualifies, the conservative default for a production acceptance report is to count it as a failure or mark the interval `UNKNOWN`; it must not be silently removed.

## 9. Error budgets

For an availability/success SLO:

```text
allowed error rate = 1 - SLO target
burn rate          = observed error rate / allowed error rate
```

Examples for the 28-day canonical window:

| SLO | Allowed error rate | Time-equivalent error budget over 28 days | Request-equivalent budget |
|---|---:|---:|---:|
| `99.95%` | `0.05%` | **20 min 9.6 s** | **5 failures / 10,000 qualifying events** |
| `99.90%` | `0.10%` | **40 min 19.2 s** | **10 failures / 10,000 qualifying events** |

Time-equivalent budgets are used for time/synthetic availability SLIs. Request-equivalent budgets are used for request success ratios. Do not convert between them to hide a violation.

Latency objectives are evaluated by their percentile ceilings and do not receive a separate pool of availability minutes.

### 9.1 Budget policy

- Each SLO owns its own budget; budgets are not pooled across SLOs.
- `>= 100%` budget consumed in the rolling 28-day window means the SLO is **BREACHED**.
- `>= 50%` budget consumed before day 14 of an equivalent 28-day trajectory triggers a reliability review and blocks risk-increasing production changes for the affected service until burn stabilizes.
- A breached SLO blocks a Productionized/stable promotion for the affected deployment class.
- Reliability/security fixes may proceed during a freeze; unrelated feature/release risk should not.

## 10. Burn-rate alert policy

Burn alerts use the allowed error rate of the affected SLO.

| Severity/action | Long window | Short confirmation window | Burn threshold | Required response |
|---|---:|---:|---:|---|
| **Fast page / SEV-1 candidate** | `1 h` | `5 min` | **>= 14.4x** in both | immediate page; incident assessment |
| **Sustained page / SEV-2 candidate** | `6 h` | `30 min` | **>= 6x** in both | page/on-call response |
| **Slow burn** | `24 h` | `2 h` | **>= 3x** in both | create reliability incident/work item before budget exhaustion |
| **Budget breach** | `28 d` | n/a | **> 1x average / 100% budget used** | mark SLO breached; production-risk freeze until reviewed |

A burn alert is based on service effect, not CPU/memory alone. Resource saturation may be a diagnostic alert but does not replace SLO burn alerts.

Zero-budget security invariants page immediately under the security incident policy rather than waiting for burn-rate windows.

## 11. Required telemetry fields

Production SLO measurement must be derivable from durable structured telemetry without exposing private topology. At minimum, qualifying events need safe forms of:

```text
timestamp
serviceClass
operation
requestId / correlationId
traceId
result status
failureClass / exclusionReason
latencyMs
connectionLatencyMs where applicable
dispatch outcome
result-delivery outcome
provider/runtime class
network profile
recoveryEventId where applicable
synthetic/user-traffic marker
```

Sensitive node/provider identities may be hashed/pseudonymized for operational aggregation. Credentials, private origins, proof values and live private allowlists must never be emitted merely to support SLOs.

## 12. Reporting

A production SLO report must show for every objective:

- target;
- current 28-day value;
- 5m/30m/1h/6h/24h burn state where applicable;
- denominator/event count;
- exclusions by reason and count;
- remaining error budget;
- data completeness;
- active incidents;
- measurement source/version;
- deployment/source commit or release identity where attributable.

A missing metric is not green. Use `UNKNOWN` or `INSUFFICIENT_DATA`.

## 13. Production acceptance gate

This contract is **Defined** when merged. It becomes **operationally accepted** only after one bounded production-operations gate proves all of the following on one identified deployment/source:

- all applicable SLIs are emitted from the real serving path;
- external HTTP and WebSocket probes exist;
- dashboards/reporting compute the formulas in this document;
- burn-rate alerts are configured and test-fired without weakening service/security;
- an on-call owner/escalation path exists;
- at least one controlled relay/provider failure demonstrates recovery measurement;
- stale/routing metrics are measured for the activated network profile;
- exclusion reason codes are visible and auditable;
- zero-budget security invariants remain fail closed;
- durable sanitized acceptance evidence records the exact deployment/source and measured results.

Until that evidence exists, current status must read approximately:

```text
Production SLI/SLO contract: DEFINED
Production SLO observability/alerting/on-call acceptance: OPEN
Production SLO compliance claim: NOT YET ESTABLISHED
```

## 14. Relationship to D-1000 and mainnet

D-1000 remains an independent network-scale gate. Its `>=99%` routing and `<=120 s` recovery thresholds are campaign acceptance predicates, not rolling production SLIs.

Neither direction substitutes for the other:

```text
accepted D-1000 != production SLO closure
production SLO dashboard != accepted D-1000
```

A future stable/mainnet claim requires both the applicable network-scale acceptance and the production lifecycle/SLO/security/compatibility gates defined by the roadmap.
