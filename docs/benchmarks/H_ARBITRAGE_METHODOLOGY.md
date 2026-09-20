# H/ARBITRAGE — Cost-Aware Routing Methodology

Status: **METHODOLOGY / NOT YET A RESULT**

## Hypothesis

Given changing provider prices and a frozen minimum quality/trust eligibility floor, TRUYN can shift eligible traffic toward the cheapest effective provider quickly enough to capture a meaningful fraction of the available arbitrage without degrading quality or creating unstable herd oscillation.

Primary causal statement:

> Against the same workload and price timeline, cost-aware TRUYN routing spends less than a frozen static policy and approaches an ex-post oracle floor while preserving the frozen quality/trust gate.

## 1. Two evidence modes

H/ARBITRAGE has two distinct modes and MUST NOT conflate them.

### A. Scripted-shock causal benchmark

Start from a pinned public price snapshot and apply a deterministic, precommitted timeline of relative price/effective-cost changes. This proves routing adaptation causally because the cheapest eligible provider is known at every step.

### B. Live-price observational benchmark

Ingest actual public provider price snapshots/effective public list-price changes over time. This shows whether the same policy behaves usefully under real market movement, but only when enough price movement occurs to identify an effect.

A scripted PASS does not by itself prove that live provider prices change frequently enough to create the same real-world savings.

## 2. Eligibility before price

Cost optimization occurs only after authorization and quality/trust eligibility.

For request `r`, define the eligible set:

```text
E(r) = authorized providers satisfying frozen capability + quality/trust/health constraints
```

The router may optimize cost only inside `E(r)`.

A cheaper provider that fails the frozen eligibility rule is not an arbitrage opportunity.

## 3. Arms

Run the same task stream and price timeline through:

### STATIC

A frozen provider assignment or frozen static distribution selected before price changes begin.

### TRUYN_COST_AWARE

The tested policy uses only information available at decision time: pinned/live price state, eligibility/trust/health signals and predeclared effective-cost penalties.

### ORACLE

Ex-post theoretical cheapest eligible choice for each request using the complete realized timeline and frozen quality eligibility. Oracle is not deployable; it defines the available arbitrage floor.

## 4. Effective cost

The run manifest freezes whether routing minimizes list-price cost or an explicitly defined effective expected cost.

If effective expected cost is used, the formula must be public and may include predeclared factors such as:

```text
expected provider billed cost
expected retry cost from observed throttling/failure state
TRUYN routing/verification overhead
```

It MUST NOT use future information or hidden oracle state.

Credits/negotiated rates remain private decision data and do not replace the public list-price proof.

## 5. Procedure

1. Freeze workload, provider/model pins, quality/trust floor, routing policy, static arm and oracle definition.
2. Freeze base public price snapshot and scripted timeline digest, or live snapshot ingestion contract.
3. Freeze arm order/randomization and independent H namespaces.
4. Ensure provider capacity/config is not being mutated by another series in the same resource scope.
5. Execute identical task sequence through STATIC and TRUYN_COST_AWARE.
6. At every routing decision log eligible set, observed prices/effective costs, chosen provider and reason code.
7. Record provider success, billed usage/cost, quality result, throttling and latency.
8. Reconstruct ORACLE ex post from the same realized request stream and eligible-set evidence.
9. At every price/effective-cost change, measure traffic-shift reaction and any overshoot/oscillation.
10. Repeat with at least one scenario where the initially cheapest provider becomes non-cheapest.
11. Include a capacity/throttling scenario that can expose herd behavior and rebalance response.

## 6. Primary metrics

### Total cost

```text
C_static
C_truyn
C_oracle
```

Report gross provider and fully-loaded variants.

### Captured arbitrage

When `C_static > C_oracle`:

```text
captured_arbitrage = (C_static - C_truyn) / (C_static - C_oracle)
```

Interpretation:

- `0` = captured none of the available static→oracle savings;
- `1` = matched the oracle floor;
- `<0` = cost-aware routing was worse than static;
- `>1` requires investigation because it usually means the oracle/evidence contract is inconsistent.

### Regret to oracle

```text
absolute_regret = C_truyn - C_oracle
normalized_regret = (C_truyn - C_oracle) / max(C_static - C_oracle, epsilon)
```

### Reaction lag

At a predeclared price/eligibility change point:

```text
reaction_lag_requests = requests until target traffic share enters the frozen stable band
reaction_lag_ms = wall-clock equivalent
```

### Misroute rate

```text
misroute_rate = decisions choosing non-minimum effective-cost provider within the observed eligible set / eligible decisions
```

A decision intentionally held back by a predeclared anti-oscillation/hysteresis rule is tagged separately from an unexplained misroute.

## 7. Quality guardrail

For every task, compare correctness/quality across arms.

Required for an “arbitrage without quality loss” claim:

```text
quality_delta(TRUYN, STATIC)
```

must satisfy the predeclared non-inferiority margin, frozen before measurement. Safety/authorization violations remain zero regardless of cost.

## 8. Herd/oscillation metrics

Measure whether many routers stampede into one temporarily cheap provider and destabilize the system.

Required outputs:

- provider traffic share by time/request bucket;
- throttle/rate-limit incidence;
- reroute count/request;
- provider switches/request;
- overshoot after a price change;
- oscillation count and amplitude;
- time/requests to rebalance after throttling;
- effective-cost increase caused by retries/throttling.

The benchmark must preserve a negative finding if the cost router saves money initially but creates oscillatory or throttle-induced cost later.

## 9. Price evidence

Every decision references a price snapshot/timeline event with:

```text
price_snapshot_id
provider/model
input/output or request price terms
effective_from
evidence source class
```

Public evidence should use provider-published/list prices where possible. Private systems may additionally reconcile actual cash/credits, but those values are a separate decision view.

## 10. Statistical plan

Use request-paired bootstrap or another frozen paired method for:

- total/mean cost delta;
- captured arbitrage;
- quality delta;
- reaction lag across repeated change events/scenarios.

A “captured arbitrage” claim requires positive savings against STATIC with the predeclared CI excluding zero, plus preserved quality/trust acceptance.

## 11. Confounders / invalidation conditions

The run is invalid or must be explicitly qualified if:

- STATIC and TRUYN see different task semantics or provider price timeline;
- the TRUYN arm uses future price information;
- oracle eligibility differs from the eligibility available to TRUYN for reasons not frozen in the contract;
- a provider is silently removed after bad outcomes;
- deployment capacity is changed mid-arm without being a frozen scenario;
- foreign D/S/T/H execution materially throttles only one arm;
- cost savings are caused by quality degradation.

## 12. What a PASS can prove

A final PASS supports a bounded statement of the form:

> On the frozen provider pool, workload and price timeline, TRUYN captured Y% of the available static-to-oracle price arbitrage, reacted within Z requests after price/eligibility changes, preserved the frozen quality floor and did not exhibit unacceptable herd oscillation.

It does not prove future provider prices, quotas or market conditions will create the same opportunity.
