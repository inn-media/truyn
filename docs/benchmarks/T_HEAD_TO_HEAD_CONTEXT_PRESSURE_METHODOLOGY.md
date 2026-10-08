# T/HEAD-TO-HEAD-CONTEXT-PRESSURE — Distributed Context Scaling Benchmark

Status: **FOUNDATION / PROSPECTIVELY FROZEN / NO RESULT CLAIM**  
Benchmark ID: `T/HEAD-TO-HEAD-CONTEXT-PRESSURE`

## 1. Objective

Test the following hypothesis:

> If an agentic system works with a large distributed context across multiple hops, agents and nodes, repeatedly reuses knowledge and transfers evidence between systems, does TRUYN reduce the total amount of transferred and retransmitted context, provider-billed tokens, WAN traffic, latency and fully-loaded cost per completed workflow while preserving output quality and provenance?

This benchmark exists because the closed `T/HEAD-TO-HEAD` benchmark answered a narrower question. In that frozen two-hop workload, competent MCP/A2A/NLWeb comparators already received a small task-relevant context slice. That design was fair for protocol substitution, but it removed most of the context-reuse pressure that TRUYN is intended to address.

The new benchmark therefore separates:

1. **Protocol Surface Benchmark** — native protocol/reference/artifact/evidence overhead with no economic-winner claim.
2. **Economic Context Pressure Benchmark** — end-to-end system economics while context pressure increases across hops, agents, nodes, reuse cycles and WAN boundaries.

The second benchmark is primary.

## 2. Evidence inherited from earlier TRUYN tests

This methodology is informed by, but does not reuse results as if they were new measurements:

- `CONTEXT_EFFICIENCY_2026-08-15.md`: explicit sparse context delivery measured 97.355% fewer provider input tokens and 82.372% lower amortized context transfer while preserving quality.
- `SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`: seven heterogeneous actors retained 100% benchmark answer/provenance correctness and approximately 97.313% provider input-token reduction on the measured retrieval workload.
- `T_HEAD_TO_HEAD_2026-10-07.md`: on the frozen two-hop minimal-context workload, TRUYN did not demonstrate the required 30% cost advantage over competent MCP/A2A implementations; Attempt 3 and Attempt 4 are final negative evidence for that methodology.
- D-series WAN/scale evidence supplies the operational discipline for real distributed-node and cross-host measurements but is not itself an economic result for this benchmark.

These prior results motivate the new hypothesis; they do not predetermine its result.

## 3. Core design principle

The benchmark MUST scale **context pressure**, not artificially degrade comparators.

Context pressure means the amount of semantically relevant state that could be repeatedly transported, re-materialized or re-sent as a workflow grows.

The benchmark increases pressure along independently recorded dimensions:

- hop count;
- number of agents;
- number of nodes;
- corpus size and working-set size;
- repeated reuse of previously seen knowledge;
- cross-agent evidence transfer;
- cold versus warm reuse;
- local versus WAN-distributed execution;
- provenance/reference continuity across hops.

The primary frozen hop strata are:

`2 / 10 / 25 / 50 hops`

The 2-hop stratum is a continuity/control point with the closed HEAD_TO_HEAD workload family. It is not required to show a large TRUYN advantage.

## 4. Fair comparator contract

Primary economic arms:

- `BARE_MCP`
- `BARE_A2A`
- `NLWEB`
- `TRUYN`

Control:

- `NAIVE` — explicit repeated/full-context control, never presented as a competent protocol implementation.

Extension:

- `NLWEB_OVER_TRUYN`

### Competent MCP

MCP MUST be allowed to use all normal pinned-profile optimizations that a competent implementation would use, including where supported:

- resources instead of embedding entire documents in every tool call;
- stable resource identifiers;
- tool-result reuse;
- application cache/reuse that is native or ordinary for the implementation;
- compact references/artifacts;
- batching when semantically equivalent.

MCP MUST NOT be forced to resend full documents merely to make TRUYN look better.

### Competent A2A

A2A MUST be allowed to use:

- Agent Cards;
- task/message identity;
- artifacts and artifact references;
- task continuation/state;
- implementation-native caching/reuse;
- compact message forms when semantically equivalent.

A2A MUST NOT be crippled by prohibiting normal task/artifact reference semantics.

### Competent NLWeb

NLWeb MUST use the pinned native discovery/query surface and may use ordinary implementation caching and references.

### TRUYN

TRUYN may use its native mechanisms:

- content-addressed context;
- root/content CIDs;
- semantic retrieval;
- minimal-context materialization;
- signed deltas;
- knowledge reuse across hops/agents/nodes;
- provenance/evidence receipts;
- routing/discovery;
- context deduplication.

### Forbidden fairness violations

The benchmark is invalid if any arm:

- receives hidden TRUYN retrieval/CID services while labeled as a bare comparator;
- is denied an optimization available in its frozen native profile without an explicit reason;
- receives a different semantic task or smaller evidence requirement;
- saves cost by omitting required evidence;
- is given intentionally inflated prompts/token payloads;
- has provider retries, output limits or model versions that differ from peers except where prospectively frozen and semantically necessary.

## 5. Workload model

The benchmark uses a reusable distributed corpus with cross-document tasks.

Prospective foundation target:

- 512 records;
- 64 semantic groups;
- at least 32 records in the active working set;
- at least 256 KiB of unique task-relevant semantic material across the benchmark corpus;
- repeated knowledge reuse target >=60% across long workflows;
- multiple evidence items required for every final answer.

Each workflow uses a deterministic graph equivalent to:

```text
discover/research
  -> retrieve/read evidence
  -> verify
  -> hand off state/evidence
  -> synthesize/update
  -> re-use prior evidence
  -> additional agents/nodes
  -> final verified answer
```

The graph expands to the frozen hop strata without changing the final semantic objective.

## 6. Pressure strata

Every measured task MUST be executed at each frozen pressure stratum.

| Stratum | Hops | Agents | Nodes | Intended purpose |
|---|---:|---:|---:|---|
| P2 | 2 | 2 | 1 | continuity / protocol baseline |
| P10 | 10 | 5 | 3 | moderate reuse pressure |
| P25 | 25 | 10 | 5 | sustained multi-agent context reuse |
| P50 | 50 | 20 | 10 | high distributed-context pressure |

Agent/node counts are maximum active identities for the stratum; exact scheduling is frozen in the run manifest.

The same semantic task must remain solvable in every stratum. Extra hops are not meaningless padding: each hop must consume, verify, transform, reuse or forward information required by the frozen workflow graph.

## 7. Cold and warm reuse

Every pressure stratum contains distinct cache/reuse strata:

### Cold

- no pre-existing arm-specific working-set cache;
- setup/materialization cost is attributed;
- first retrieval/reference resolution is measured.

### Warm

- the frozen reusable knowledge state may be reused;
- no arm may inherit state from another arm;
- cache namespace is isolated per arm/run;
- warm reuse must be a normal capability of that arm.

Cold and warm results are reported separately. They may not be averaged into one headline number unless the mix is prospectively frozen.

## 8. Local and WAN strata

Two network profiles are required:

### LOCAL_CONTROL

All logical nodes may execute on a controlled local/near-local substrate. This isolates protocol and provider economics.

### WAN_DISTRIBUTED

The workflow crosses multiple real hosts/nodes and at least two failure-independent network locations/providers where practical.

Required WAN measurements:

- application payload bytes sent/received;
- protocol bytes sent/received;
- context/evidence bytes crossing a node boundary;
- retransmission/retry bytes;
- end-to-end latency;
- provider latency separated from network/orchestration latency.

D-series operational isolation and cleanup rules apply. The WAN profile must not reuse D-series results as if measured here.

## 9. Required metrics

The benchmark must report side-by-side, per arm and per pressure stratum:

### Provider usage

- billed input tokens;
- billed output tokens;
- cached input tokens where the provider reports them;
- total billed tokens;
- provider gross cost.

### Semantic/context transport

- unique semantic bytes;
- total semantic/context bytes materialized;
- duplicated context bytes;
- context duplication ratio;
- evidence bytes;
- artifact/reference bytes;
- protocol metadata bytes;
- provider request/response bytes.

Definitions:

```text
duplicated_context_bytes =
  max(0, total_context_bytes_materialized - unique_semantic_bytes)

context_duplication_ratio =
  total_context_bytes_materialized / unique_semantic_bytes

semantic_reuse_efficiency =
  1 - duplicated_context_bytes / max(total_context_bytes_materialized, 1)
```

Reports MUST state exactly how unique semantic identity is computed. Content-addressed identity may be used only if the same semantic-unit normalization is applied to all arms.

### Network

- WAN tx bytes;
- WAN rx bytes;
- cross-node context bytes;
- retransmitted bytes;
- network cost where measurable.

### Orchestration and storage

- orchestration compute time/cost;
- retrieval/embedding cost;
- storage/index/read/write cost;
- setup cost;
- allocated fixed cost where the frozen accounting rule supports it.

### Latency

- end-to-end latency;
- provider latency;
- discovery/routing latency;
- retrieval/materialization latency;
- serialization/deserialization latency;
- evidence/provenance verification latency.

### Quality

- final answer correctness;
- required evidence coverage;
- provenance integrity;
- cross-hop state consistency;
- controlled failure rate.

### Primary economic measure

```text
fully_loaded_cost_per_completed_workflow
```

A failed or quality-invalid workflow is not allowed to appear artificially cheap.

## 10. Fully-loaded accounting

The benchmark distinguishes:

1. provider gross cost;
2. protocol/orchestration compute;
3. embedding/retrieval cost;
4. storage cost;
5. network cost;
6. arm-specific setup cost;
7. allocated fixed cost where prospectively defined;
8. fully-loaded cost per completed workflow.

Provider usage × pinned public price is evidence class B unless an invoice/meter provides class A.

Locally measured orchestration compute is class C unless a directly billable meter exists. Public reports MUST preserve evidence classes by component instead of presenting a C-only estimate as provider billing fact.

No protocol byte count may be converted into fake provider tokens.

## 11. Protocol Surface Benchmark

Purpose: quantify what the native protocols actually do.

Outputs by arm:

- native operation counts;
- protocol request/response bytes;
- artifact/reference bytes;
- serialization cost;
- orchestration latency;
- provenance/evidence capability matrix.

This surface has **no economic winner gate**. It exists so a system-cost advantage cannot be falsely attributed to protocol overhead alone.

## 12. Economic Context Pressure Benchmark

Purpose: measure scaling behavior.

For every arm, derive curves over hop count for:

- billed input tokens;
- duplicated context bytes;
- WAN bytes;
- end-to-end latency;
- provider gross cost;
- fully-loaded cost per completed workflow.

Report both absolute values and paired TRUYN deltas.

The desired, but non-blocking, visual pattern is:

```text
2 hops  -> near parity is acceptable
10 hops -> positive TRUYN advantage may emerge
25 hops -> larger advantage
50 hops -> largest advantage
```

This shape is **not assumed**. If the measured curve is flat, reverses or favors a comparator, the negative result is preserved.

## 13. Prospective acceptance contract

The first pilot is successful as a benchmark execution only if:

- telemetry completeness >=99.9%;
- pair-ID loss = 0;
- unattributed paid provider calls = 0;
- frozen models/task semantics/output contract are equal;
- comparator good-faith review PASS;
- provider retries = 0 unless a separate frozen incident policy says otherwise;
- quality/provenance floor is preserved.

The **context-pressure hypothesis** passes only if, with quality preserved:

1. delivered context pressure measurably rises from P2 -> P10 -> P25 -> P50;
2. TRUYN duplicated-context bytes are lower than each primary competent comparator at P10, P25 and P50;
3. TRUYN billed provider input tokens are lower than each primary competent comparator at P25 and P50;
4. TRUYN WAN bytes are lower than each primary competent comparator at P25 and P50 in WAN_DISTRIBUTED;
5. TRUYN fully-loaded cost per completed workflow is lower than each primary competent comparator at P25 and P50;
6. the TRUYN-vs-comparator fully-loaded advantage does not shrink from P25 to P50;
7. quality/provenance is not worse than the frozen comparator floor.

No fixed percentage saving is required at P2 or P10.

The first pilot treats the exact percentage slope as a measurement target rather than assuming 30%. A stronger percentage threshold may be frozen only for a later final campaign after the pilot, never retroactively applied to the pilot.

## 14. Statistical reporting

Use paired tasks across all arms and strata.

Report:

- paired mean and median deltas;
- bootstrap 95% CI when sample count supports it;
- per-stratum win/tie/loss counts;
- slope of tokens vs hops;
- slope of duplicated-context bytes vs hops;
- slope of WAN bytes vs hops;
- slope of fully-loaded cost vs hops;
- cold-to-warm amortization delta.

Do not fit or publish a smooth scaling law unless the residual/error analysis supports it.

## 15. Evidence bundle

A complete run produces:

```text
manifest.json
context-pressure-profile.json
comparator-config.json
topology.json
corpus-manifest.json
workload.json
quality-rubric.json
price-snapshot.json
accounting-policy.json
telemetry.jsonl
protocol-surface-summary.json
economic-pressure-summary.json
quality-summary.json
interference.jsonl
checksums.sha256
REPORT.md
```

## 16. Non-claims

A PASS does not prove that TRUYN is always cheaper/faster than MCP, A2A or NLWeb.

A FAIL does not invalidate TRUYN's already measured sparse-context or retrieval results.

The result is bounded to:

- the frozen corpus;
- frozen workflow graph;
- hop/agent/node strata;
- comparator implementations;
- models/providers;
- cache policy;
- network profile;
- accounting policy.

## 17. Relationship to closed T/HEAD-TO-HEAD

`T/HEAD-TO-HEAD` remains closed with its negative result.

This benchmark is a new hypothesis, new benchmark ID and new prospective freeze. It must never overwrite, reinterpret or rerun the old benchmark's evidence.
