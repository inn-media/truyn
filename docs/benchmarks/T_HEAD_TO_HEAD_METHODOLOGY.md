# T/HEAD-TO-HEAD — TRUYN vs Naive / MCP / A2A / NLWeb

Status: **PLANNED / NO RESULT CLAIM**

## Objective

Determine whether TRUYN's measured token/cost/context-transfer advantage is attributable to TRUYN's context, routing, reuse and evidence semantics rather than merely to using any orchestration or interoperability layer.

The benchmark changes the protocol/orchestration layer while freezing the task, corpus, models and output contract.

## Primary arms

### 1. NAIVE

Explicit worst-case control.

Each hop receives the full task context and prior material required to continue the multi-hop workflow. This arm is intentionally labeled **NAIVE** and MUST NOT be presented as a competent MCP/A2A/NLWeb implementation.

Purpose: quantify the cost of repeated full-context handoff.

### 2. BARE_MCP

Use the pinned MCP profile/reference implementation required by the run. Agents use MCP-native tool/resource interaction for the same task.

Rules:

- configure MCP in good faith;
- use native resource/tool references when they are part of the pinned MCP profile;
- do not add TRUYN CID reuse, TRUYN semantic retrieval or TRUYN receipts behind MCP;
- disclose every optimization enabled.

### 3. BARE_A2A

Use the pinned A2A profile/reference implementation required by the run. Agents exchange the same task through native A2A task/message/artifact semantics.

Rules:

- configure A2A in good faith;
- use native artifact/reference capabilities available in the pinned profile;
- do not add TRUYN context-addressed reuse, TRUYN semantic retrieval or TRUYN receipts behind A2A;
- disclose every optimization enabled.

### 4. NLWEB

Use the exact NLWeb profile pinned by the run, currently expected to remain aligned with TRUYN's accepted bounded NLWeb interoperability profile unless explicitly requalified.

The comparator exercises the native `who/discovery → ask/answer` path available to the pinned profile and its normal endpoint implementation.

It MUST NOT receive hidden TRUYN CID reuse, TRUYN retrieval or TRUYN evidence services.

### 5. TRUYN

Use native TRUYN discovery/routing plus content-addressed context, semantic retrieval/minimal context and the evidence/provenance path required by the frozen TRUYN profile.

## Secondary bridge arm: NLWEB_OVER_TRUYN

This is intentionally separate from the primary five-arm ranking.

The same NLWeb request shape is accepted at the NLWeb edge, while TRUYN supplies eligible discovery/routing, minimal-context reuse and evidence underneath the bridge.

Purpose:

> Show whether TRUYN adds economic/evidence value **under** an NLWeb interaction surface rather than presenting NLWeb only as a competitor.

A successful NLWeb-over-TRUYN result supports an interoperability story, not a claim that NLWeb itself implements TRUYN semantics.

## Benchmark workload

Use a multi-hop research/review workflow with at least two semantically distinct hops, for example:

```text
research → review/verification → final answer
```

The exact workload is immutable for a run and MUST contain:

- corpus digest;
- task/query digest;
- expected output/rubric;
- hop graph;
- model assignment per hop;
- completion budget per hop;
- retry/deadline policy.

The models are fixed across arms. If one arm requires a protocol-specific wrapper prompt, the wrapper may change only enough to express the same task through the arm's native interface.

## Comparator fairness contract

The benchmark is invalid if a comparator is deliberately underconfigured.

For MCP, A2A and NLWeb:

- use a pinned implementation/version;
- enable native optimizations that a competent operator would reasonably enable;
- publish/sanitize the configuration used;
- report unsupported capabilities as capability gaps, not fabricated zeroes;
- do not penalize a comparator for lacking a TRUYN-specific feature unless the report clearly identifies that difference as an architectural capability difference.

The NAIVE arm is the only intentionally inefficient arm and is labeled accordingly everywhere.

## Pairing and order control

For every task sample `i`, execute every applicable arm.

Use either:

- a frozen random permutation seed per sample; or
- a balanced Latin-square arm schedule.

Warmups are discarded. Cold-cache and warm-cache strata are reported separately.

A provider incident that affects only one time window must remain visible in telemetry and may trigger a rerun only under the frozen incident/retry policy.

## Context isolation

The benchmark records what each arm actually transmits.

Required fields per hop:

- prompt/system bytes;
- conversation/history bytes;
- task payload bytes;
- context/document bytes;
- protocol metadata bytes;
- artifact/reference bytes;
- provider request body bytes;
- provider response bytes.

Compute:

```text
context_duplication_ratio = total_context_bytes_across_hops / unique_task_context_bytes
```

and, where meaningful:

```text
provider_input_duplication_ratio = total_billed_input_tokens_across_hops / minimum_unique_semantic_input_tokens
```

The latter is diagnostic and MUST be accompanied by its exact definition in the report.

## Cost metrics

Per arm and task:

- billed input tokens;
- billed output tokens;
- total billed tokens;
- provider gross cost;
- protocol/orchestration variable cost;
- fully-loaded cost where measurable;
- bytes transferred;
- context bytes;
- setup cost if an arm requires setup unique to that arm.

Credits and negotiated discounts are not used to make the public winner cheaper.

## Latency metrics

Record:

- E2E latency;
- provider latency;
- protocol/orchestration latency;
- discovery latency;
- retrieval latency where applicable;
- verification/evidence latency where applicable;
- hop count;
- retry count.

Report p50/p90/p95/p99 where the sample count supports them; otherwise report the supported percentiles and mark p99 unavailable.

## Quality metrics

At minimum:

- task accuracy/correctness;
- completeness against the frozen rubric;
- failure rate;
- controlled-failure rate;
- hallucination/factual-error count when the workload supports deterministic verification.

TRUYN cost savings are not accepted if they come from a quality regression below the frozen floor.

## Provenance / evidence capability matrix

Do not reduce provenance to a misleading `Y/N` without definition.

Record separately:

- source references returned;
- source/reference integrity verification;
- signed actor/provider identity evidence;
- content digest/CID verification;
- request/response correlation evidence;
- replay/tamper verification where applicable;
- native protocol support vs application-specific/custom extension.

The report SHOULD present a capability matrix such as:

| Capability | NAIVE | MCP | A2A | NLWeb | TRUYN | NLWeb-over-TRUYN |
|---|---|---|---|---|---|---|
| Native source refs | measured | measured | measured | measured | measured | measured |
| Signed identity evidence | measured | measured | measured | measured | measured | measured |
| Content digest verification | measured | measured | measured | measured | measured | measured |
| TRUYN receipt | N/A | N/A | N/A | N/A | measured | measured |

`N/A` means the capability is outside that comparator's native profile, not that the comparator is defective.

## Procedure

1. Freeze public TRUYN SHA/release and exact comparator pins.
2. Freeze one corpus, workload, hop graph, model versions and output rubric.
3. Validate that every comparator can complete the workload before measured runs.
4. Publish/sanitize comparator config before results are interpreted.
5. Execute warmups and exclude them.
6. For each task sample, run all applicable arms in randomized/balanced order.
7. Capture normalized telemetry at every hop.
8. Capture provider-reported billed usage and pinned price evidence.
9. Score quality without exposing arm identity to a human/model judge when subjective scoring is required.
10. Compute paired deltas for TRUYN vs each primary arm.
11. Run `NLWEB_OVER_TRUYN` as an interoperability extension, not as a replacement for the NLWeb-alone comparator.
12. Preserve negative results and protocol-specific failures.

## Statistical reporting

Prefer paired deltas because every task appears in every arm.

For each TRUYN-vs-comparator pair report:

- median paired token delta;
- mean paired token delta;
- median paired cost delta;
- mean paired cost delta;
- bootstrap 95% confidence interval for the paired median/mean when sample size permits;
- paired quality delta;
- win/tie/loss counts by task for cost and latency while quality passes.

Do not publish a single aggregate winner if different dimensions disagree; publish the dimensions.

## Acceptance

A T/HEAD-TO-HEAD PASS requires:

1. same frozen models/task/corpus/output contract across all applicable arms;
2. MCP/A2A/NLWeb configured in good faith and their exact pins/config recorded;
3. TRUYN billed tokens and gross cost are **strictly lower** than BARE_MCP, BARE_A2A and NAIVE by the pre-frozen margin in the acceptance manifest;
4. TRUYN quality/accuracy is at least the frozen comparator floor and is not statistically/practically worse under the declared scoring method;
5. all TRUYN overhead is included;
6. native capability differences are reported explicitly rather than converted into invented numeric scores;
7. NLWeb-alone is measured independently;
8. NLWeb-over-TRUYN, when run, demonstrates the incremental effect of adding TRUYN under the same NLWeb edge without changing task semantics;
9. immutable evidence bundle + tested SHA + comparator pins + artifact digest exist.

Recommended default economic gate for the first final run:

```text
TRUYN gross cost reduction vs each of BARE_MCP / BARE_A2A / NAIVE >= 30%
```

This recommended margin MUST be frozen before the run. If the project chooses a different margin, the manifest must record it before paid inference and the public report must disclose it.

For NLWeb, the required claim is more careful:

- `TRUYN <= NLWEB` on the frozen comparable cost slice; and
- `NLWEB_OVER_TRUYN` must quantify the economic/evidence delta introduced by TRUYN under the same NLWeb-facing interaction.

## Primary output

A public table with one row per arm and the exact pinned profile/version, plus paired-delta charts for:

- tokens;
- gross cost;
- E2E latency;
- context bytes/duplication;
- quality;
- provenance/evidence capabilities.
