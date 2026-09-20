# T/BREAK-EVEN — Cost / Request and Break-Even Methodology

Status: **PLANNED / NO RESULT CLAIM**

## Objective

Measure the request volume at which TRUYN's setup + fixed + per-request cost becomes lower than an otherwise identical direct full-context path, then publish the family of `$/request vs volume` curves.

The core commercial question is:

> At what monthly request volume does TRUYN become cheaper, and how much cheaper is it at a realistic steady-state volume?

## Arms

### DIRECT

For every request, the model receives the full frozen task context required by the benchmark. No TRUYN retrieval, CID reuse, semantic context selection or TRUYN receipt is used.

### TRUYN

The corpus is prepared once, content-addressed/published once for the run's setup phase, and each request uses the frozen TRUYN retrieval/routing/verification path to materialize only the required minimal context before the same model performs the same task.

The model, completion budget, task, corpus snapshot and quality scoring MUST be identical between arms.

## Cost model

The benchmark publishes both a variable-only engineering view and a fully-loaded commercial view.

### Variable-only

```text
DIRECT_variable(N) = N * c_direct
TRUYN_variable(N)  = C_setup + N * c_truyn

N*_variable = C_setup / (c_direct - c_truyn)
```

### Fully loaded

```text
DIRECT_full(N) = F_direct + N * c_direct
TRUYN_full(N)  = C_setup + F_truyn + N * c_truyn

N*_full = (C_setup + F_truyn - F_direct) / (c_direct - c_truyn)
```

Where:

- `C_setup` = one-time corpus preparation attributable to this corpus generation: embedding/index build, manifests/CIDs, publication/storage writes and other setup work;
- `F_truyn` = fixed infrastructure cost for the comparison period attributable to TRUYN;
- `F_direct` = equivalent fixed infrastructure cost, if any, required by the DIRECT arm;
- `c_direct` = measured variable cost per DIRECT request;
- `c_truyn` = measured variable cost per TRUYN request including retrieval, routing, verification and minimal-context inference.

If `c_direct <= c_truyn`, no positive break-even point exists; the run is reported as a negative result.

## Corpus size families

Run three immutable corpus classes:

- `SMALL`;
- `MEDIUM`;
- `LARGE`.

Each class is defined by the run manifest using exact digest-addressed values for:

- source bytes;
- normalized text bytes;
- full-context input token count under the frozen tokenizer/model;
- block count;
- embedding count;
- root/manifest identity.

The class labels themselves do not imply a universal token size. The actual dimensions are part of the evidence bundle.

## Volume sweep

The canonical sweep is logarithmic and MUST include enough measured points to expose amortization rather than plotting only a formula.

Default target sweep:

```text
N = 1, 10, 100, 1_000, 10_000
```

A run MAY stop before an expensive point only if that point is explicitly marked `not_run`; it MUST NOT be silently replaced by extrapolation.

For very high commercial volumes, an extrapolated curve MAY be shown after the measured region if:

1. measured per-request cost is stable enough for the chosen model;
2. the extrapolated region is visually and numerically labeled as extrapolated;
3. the break-even value used for an accepted claim is not supported solely by an unvalidated nonlinear assumption.

## Setup accounting

`C_setup` starts at the first operation that exists only because TRUYN needs reusable corpus state and ends when the corpus is queryable.

At minimum account for:

- source normalization;
- embeddings billed by the provider/runtime;
- index construction;
- object/block hashing;
- root/manifest construction;
- initial publication and storage writes;
- setup-time validation/verification;
- attributable setup compute and network cost.

The setup phase is measured once per immutable corpus generation. Incremental/delta economics are a separate stratum and MUST NOT be mixed with initial-build economics.

## Per-request accounting

### DIRECT includes

- billed full-context input tokens;
- billed output tokens;
- provider request/response transfer attributable to the request;
- direct orchestration compute/network if material;
- retries actually consumed.

### TRUYN includes

- query embedding, if billed per query;
- semantic retrieval;
- routing/discovery attributable to the request;
- provenance/receipt verification;
- context materialization/transfer;
- billed minimal-context input tokens;
- billed output tokens;
- retries actually consumed;
- attributable TRUYN compute/network/storage reads.

No TRUYN overhead may be removed merely because it is small.

## Pricing snapshots

Run against at least two economically distinct price profiles when available, ideally three:

- `LOW_COST` — cheap/self-hosted or low-cost provider class;
- `MAINSTREAM` — representative production provider pricing;
- `PREMIUM` — premium hosted model pricing.

A price snapshot contains effective timestamp, currency, model/SKU identity, input/output/embedding/storage/compute unit prices used, and public source references where applicable.

Cloud credits are excluded from the public gross-cost curve. Private operations MAY track `net_cash_cost` separately.

## Procedure

1. Freeze public TRUYN SHA/release, model version, corpus, workload, tokenizer, prompt/output contract and price snapshot.
2. Build all three corpus classes and record their immutable manifests.
3. For each corpus class, measure `C_setup` independently.
4. Warm each arm according to the declared warmup policy; exclude warmups.
5. For each `N` point, run paired DIRECT/TRUYN workloads from the same query set.
6. Randomize arm order for each pair to reduce provider/time-order bias.
7. Record provider-reported billed usage, all TRUYN overhead components, E2E latency and quality.
8. Compute measured total cost at each `N`.
9. Compute measured `$/request = total_cost(N)/N`.
10. Fit/display the analytical curve only after measured points are available.
11. Calculate `N*_variable` and `N*_full` from frozen cost components and verify that observed crossover is consistent with the measured sweep.
12. Repeat by corpus class and price snapshot.
13. Publish negative results as-is.

## Metrics

Required per corpus / price profile:

- `C_setup_usd`;
- `F_direct_usd`;
- `F_truyn_usd`;
- mean/median/p95 `c_direct_usd`;
- mean/median/p95 `c_truyn_usd`;
- measured total cost by `N`;
- measured `$/request` by `N`;
- `N*_variable`;
- `N*_full`;
- reduction percentage at each measured `N`;
- full-context input tokens/request;
- TRUYN input tokens/request;
- setup bytes/embeddings;
- quality/accuracy by arm;
- latency by arm;
- cost evidence class coverage.

## Acceptance

A final commercial PASS requires all of the following:

1. same task/model/corpus semantics across arms;
2. accepted public dollar claims are backed by `A_INVOICE_METER` or `B_PROVIDER_USAGE_X_PRICE` evidence;
3. all TRUYN setup/fixed/variable overhead is included;
4. quality/accuracy of TRUYN is not below the frozen DIRECT acceptance floor;
5. `N*_full` is finite and is below the privately frozen realistic target monthly request volume;
6. at the privately frozen steady-state target volume, fully-loaded TRUYN cost/request is at least **90% lower** than fully-loaded DIRECT cost/request;
7. the report exposes both the measured sweep and any extrapolated region distinctly;
8. evidence bundle, tested SHA and artifact digest are immutable.

The public report MUST publish the numerical break-even point. The private commercial target volume MAY remain private; if it does, the public report states only whether the pre-frozen commercial-volume gate passed and preserves a cryptographic/durable reference to the private run manifest.

## Primary output

A family of charts:

```text
$/request
  ^
  | DIRECT  ───────────────
  |       \
  |        \  TRUYN
  |         \___________
  +--------------------------> monthly request volume
              N*
```

At least one chart per corpus class, with price-profile overlays or separate panels, plus a table of `N*` and steady-state reduction.
