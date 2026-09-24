# TRUYN Benchmark Evidence

`docs/benchmarks/` is the public, reviewable evidence ledger for TRUYN benchmark claims.

## Evidence preservation rule

Published benchmark reports are **append-only evidence**. Security cleanup must not delete a report merely because it contains a field that should not be public.

If a report contains sensitive operational information:

1. redact only the sensitive field or value;
2. preserve the report filename and benchmark date;
3. preserve measured results, methodology, limitations and acceptance gates;
4. preserve tested commit SHA, workflow/run identity, artifact identity and artifact digest when those identifiers are not themselves sensitive;
5. add a clear redaction note when a material evidence field was removed or generalized;
6. keep the correction/redaction in Git history.

Credentials, private keys, privileged cloud identities, private origins, secret-bearing URLs, customer data, private deployment/resource names, live allowlists, exact live quota/cost ceilings and other operational secrets remain forbidden. Raw logs/artifacts containing such data belong outside the public repository. Their safe identifiers and cryptographic digests may be retained here so the public report remains auditable.

Deleting or replacing a measured report with a summary/stub is not an acceptable security response. If a published report is proven invalid or duplicated, retain an explicit tombstone/correction that points to the superseding evidence rather than silently removing the record.

The repository regression suite treats the evidence files below as protected and fails if they disappear or are replaced by trivial stubs.

## Current evidence ledger

### Measured results

- [`CLASS_D_200_2026-09-20.md`](CLASS_D_200_2026-09-20.md) — **accepted Class D-200** single-shot proof on frozen source `e91c165c67c655deb80df4511ca346acb9f1f45b`: 20 Azure hosts / 200 real processes / 200 identities / 200 endpoints, readiness 200/200, baseline 400/400, convergence 200/200 with p95 `256.43 ms`, restart of 100 nodes with recovery p95 `28,717 ms`, post-restart routing 100/100 first-attempt with zero application retries, real packet partition recovery `32,159 ms`, healed routing 200/200, 100 acknowledged durable writes with zero loss, zero safety violations, complete campaign + staging cleanup, strict `TRUYN_D200_TERMINAL result=PASS`; immutable run `35503894414`, artifact `10603748497`, digest `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4`. Sanitized structured telemetry is in [`CLASS_D_200_2026-09-20.json`](CLASS_D_200_2026-09-20.json), all 200 sanitized per-node readiness rows are in [`CLASS_D_200_2026-09-20_READINESS_PUBLIC.json`](CLASS_D_200_2026-09-20_READINESS_PUBLIC.json), all 100 sanitized retention rows are in [`CLASS_D_200_2026-09-20_RETENTION_PUBLIC.json`](CLASS_D_200_2026-09-20_RETENTION_PUBLIC.json), the explicit publication boundary is in [`CLASS_D_200_2026-09-20_PUBLIC_EVIDENCE_INDEX.json`](CLASS_D_200_2026-09-20_PUBLIC_EVIDENCE_INDEX.json), and all 20 raw artifact files are cryptographically anchored in [`CLASS_D_200_2026-09-20_ARTIFACT_FILES.sha256`](CLASS_D_200_2026-09-20_ARTIFACT_FILES.sha256).
- [`AZURE_ORIGIN_LOCK_2026-08-23.md`](AZURE_ORIGIN_LOCK_2026-08-23.md) — accepted production relay origin-lock proof on tested source `9b419e7d11baf6ec0d17e7075238e3d758ef16e4`: Cloudflare public path preserved, Azure Front Door requester proof sanitized, trusted proof injected only for `SocketAddr` within Cloudflare CIDRs, Container Apps ingress restricted to `AzureFrontDoor.Backend`, direct Front Door HTTP/WebSocket and forged-proof probes = 403, direct Container App HTTP/WebSocket = 403, terminal context `truyn/origin-lock-live-v22 = success`.
- [`CLASS_D_100_2026-08-22.md`](CLASS_D_100_2026-08-22.md) — accepted Class D-100 V17 resilience proof on immutable tested source `ea1753ab6eb12f2c7361740d98f3d08a067bd7c5`: 100 real processes / identities / QUIC endpoints across four Azure hosts, 100% baseline and healed routing, recovery/convergence p95 32,090 ms, required churn/packet-partition/Byzantine/Sybil/eclipse/collusion coverage, zero safety violations, canonical evaluator PASS, strict terminal PASS, and complete cleanup with zero remaining run resources; explicitly does not claim the later 200/500/1,000-real-process gates.
- [`CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md`](CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md) — accepted Class C heterogeneous Azure/GCP WAN/reachability proof: direct cross-cloud QUIC with zero relay calls, real packet-path partition/heal, real Azure NAT source observation, two-layer CGNAT-like outbound path, authenticated relay fallback, outage fail-closed, recovery, and complete ephemeral cleanup; explicitly does not claim carrier-field CGNAT or D-scale acceptance.
- [`NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md`](NETWORK_PRODUCTIONIZATION_AZURE_4HOST_2026-08-17.md) — Class B four-host Azure productionization proof: real public UDP/QUIC direct NEED with zero relay calls, injected partition/heal, 3-of-3 DHT replication and remote read, real holder-process failure, 5,097 ms replacement repair, restart identity/sequence continuity, stale DHT-client invalidation, and complete ephemeral cleanup; explicitly does not claim packet-path WAN partition, NAT/CGNAT, D-scale or mainnet readiness.
- [`V01_CONNECT_GATE_2026-08-17.md`](V01_CONNECT_GATE_2026-08-17.md) — first real lower-network gate: real QUIC/UDP signed NEED transport, authenticated peer sessions, relay-free three-node Kademlia discovery, networked `PING/FIND_NODE/STORE/FIND_VALUE`, composed `TruynNetworkNode`, real UDP STUN exchange, same-QUIC-port hole punching, explicit relay fallback and backpressure.
- [`KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md`](KADEMLIA_QUIC_TRUST_TESTNET_2026-08-17.md) — real libp2p QUIC/Kademlia trust-lifecycle testnet proof: 4-node QUIC topology, relay-free signed verifier discovery, durable transparency replication/recovery through bootstrap loss, verifier transport-ID rotation with stale-provider tolerance, 2-ack revocation convergence, Trust Receipt v2 staleness after revocation, and zero relay calls. The report explicitly does not claim BFT consensus, Sybil/collusion resistance or D-scale acceptance.
- [`CROSS_CLOUD_AB_2026-08-15.md`](CROSS_CLOUD_AB_2026-08-15.md) — first paired Azure OpenAI → Vertex Gemini direct-vs-TRUYN baseline; includes the negative baseline result and per-sample evidence.
- [`CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md`](CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md) — fixed 8× hot-path optimization gate; measured protocol and orchestration overhead.
- [`CONTEXT_EFFICIENCY_2026-08-15.md`](CONTEXT_EFFICIENCY_2026-08-15.md) — content-addressed context and signed-delta economic A/B gate.
- [`SEMANTIC_RETRIEVAL_GATE_2026-08-15.md`](SEMANTIC_RETRIEVAL_GATE_2026-08-15.md) — question + root CID semantic retrieval, provenance, token and cost gate.
- [`SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md`](SEMANTIC_RETRIEVAL_MULTI_ACTOR_2026-08-15.md) — seven heterogeneous actor extension: 192/192 retrieval, 56/56 provider stages and 97.313% mean input-token reduction.
- [`SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md`](SEMANTIC_RETRIEVAL_V2_CONFIDENCE_GATE_2026-08-16.md) — final production Semantic Retrieval Gate v2 proof: stochastic cheap-judge disagreement hardening, 359/360 immutable retrieval cases, 100% six-chain / 42-stage live actor success, 98.102% input-token reduction and 90.188% comparable cost reduction with routing overhead included.
- [`SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md`](SEMANTIC_INDEX_LIFECYCLE_2026-08-16.md) — deterministic production lifecycle proof: no request-time document indexing, restart persistence with zero document re-embedding, incremental root reuse, single-flight preparation, and vector-preserving invalidation.
- [`SEMANTIC_SCALE_GATE_V3_2026-08-16.md`](SEMANTIC_SCALE_GATE_V3_2026-08-16.md) — infrastructure-scale Semantic Retrieval proof at 600 / 10,000 / 100,000 immutable blocks; explicitly separate from real WAN-node scale.
- [`SEMANTIC_CONCURRENT_LOAD_2026-08-16.md`](SEMANTIC_CONCURRENT_LOAD_2026-08-16.md) — signed concurrent NEED proof including the preserved 256-event legacy relay queue boundary failure.
- [`DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md`](DISTRIBUTED_SEMANTIC_RETRIEVAL_2026-08-16.md) — distributed immutable-root retrieval across signed holders with provenance and minimal context.
- [`CLAIM_TRUSTABILITY_V1_2026-08-16.md`](CLAIM_TRUSTABILITY_V1_2026-08-16.md) — claim-centric verification/resistance proof.
- [`TRUST_NETWORK_V2_2026-08-16.md`](TRUST_NETWORK_V2_2026-08-16.md) — decentralized placement + Byzantine read-quorum + active Trustability proof.
- [`ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md`](ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md) — preserved earlier production origin-bypass evaluation and negative experiments. It remains historical evidence and is superseded **only for the current production origin-lock status** by `AZURE_ORIGIN_LOCK_2026-08-23.md`.

### Unaccepted / negative scale evidence

- [`CLASS_D_100_ATTEMPT_2026-08-17.md`](CLASS_D_100_ATTEMPT_2026-08-17.md) — preserved first Class D 100-node launch attempt. No durable accepted run result was available for that attempt, so the record remains explicitly **not a PASS claim**. It is retained as negative history and is superseded for the accepted D-100 status only by `CLASS_D_100_2026-08-22.md`.
- Earlier D-200 failed runs remain historical immutable evidence in workflow artifacts/issues and are not overwritten by the accepted `35503894414` record. The accepted D-200 report lists the relevant run identities and their relationship to the final repair.

### Methodology / planned parity

- [`MULTIMODAL_PROVIDER_PARITY.md`](MULTIMODAL_PROVIDER_PARITY.md) — apples-to-apples methodology for text, image and video provider comparisons; it does not claim a completed multimodal benchmark result.
- [`E_SERIES_EFFICIENCY.md`](E_SERIES_EFFICIENCY.md) — canonical E-series boundary and full efficiency profile: stage bottlenecks, useful-result economics, scale knee and overload/recovery; **foundation only, not a benchmark result**.
- [`E_DECOMPOSE_METHODOLOGY.md`](E_DECOMPOSE_METHODOLOGY.md) — ingress/retrieval/rerank/routing/dispatch/provider/verification/transport decomposition with monotonic-clock attribution and `TRUYN tax`.
- [`E_PER_RESULT_METHODOLOGY.md`](E_PER_RESULT_METHODOLOGY.md) — paired DIRECT vs TRUYN `$ / useful`, wall-seconds/useful and compute/proxy/useful with wrong/unverified results charged full cost but zero useful credit.
- [`E_KNEE_METHODOLOGY.md`](E_KNEE_METHODOLOGY.md) — dense `50/75/100/150/200/350/500` scale grid, precommitted segmented breakpoint detector and bootstrap support; permits `NO_KNEE_OBSERVED_IN_RANGE`.
- [`E_DEGRADE_METHODOLOGY.md`](E_DEGRADE_METHODOLOGY.md) — offered-load ramps at 50/100/200/500, max sustainable load, provider-vs-internal failure attribution and return-to-baseline recovery/hysteresis.
- [`E_SERIES_TELEMETRY.md`](E_SERIES_TELEMETRY.md) — request/stage/usage/load/interference telemetry and recomputable formulas for all E metrics.
- [`T_SERIES_COMMERCIAL_PROOF.md`](T_SERIES_COMMERCIAL_PROOF.md) — canonical T-series boundary, common invariants, cost-accounting contract and immutable evidence bundle; **foundation only, not a benchmark result**.
- [`T_BREAK_EVEN_METHODOLOGY.md`](T_BREAK_EVEN_METHODOLOGY.md) — fully-loaded and variable-only `$/request vs volume` methodology with measured volume sweep and break-even `N*`.
- [`T_HEAD_TO_HEAD_METHODOLOGY.md`](T_HEAD_TO_HEAD_METHODOLOGY.md) — paired good-faith comparison of TRUYN vs NAIVE / MCP / A2A / NLWeb plus the separate NLWeb-over-TRUYN bridge arm.
- [`T_PREDICT_METHODOLOGY.md`](T_PREDICT_METHODOLOGY.md) — p50/p90/p95/p99 cost/latency predictability, hard guardrails and controlled-stress methodology.
- [`T_SERIES_TELEMETRY.md`](T_SERIES_TELEMETRY.md) — normalized raw telemetry/evidence schema and reproducible metric formulas shared by all T-series tests.
- [`H_SERIES_HIDDEN_BENCHMARKS.md`](H_SERIES_HIDDEN_BENCHMARKS.md) — canonical H-series open/private boundary, paired controls, hidden-benchmark precommitment, evidence bundle and safety precedence; **foundation only, not a benchmark result**.
- [`H_CACHE_COMPOUND_METHODOLOGY.md`](H_CACHE_COMPOUND_METHODOLOGY.md) — cross-node CID/context/result reuse compounding with 50/100/200-node cells, controlled Zipf overlap, reuse-disabled control and explicit same-node vs cross-node attribution.
- [`H_SECOND_OPINION_METHODOLOGY.md`](H_SECOND_OPINION_METHODOLOGY.md) — hidden gold holdout, seven single-vendor baselines, majority/trust-weighted/verify-dispute policies, disagreement accuracy, error diversity, accuracy lift and accuracy-per-dollar.
- [`H_ARBITRAGE_METHODOLOGY.md`](H_ARBITRAGE_METHODOLOGY.md) — STATIC/TRUYN/ORACLE cost-aware routing proof with scripted causal shocks separated from live-price observation, captured-arbitrage/regret/reaction/oscillation metrics and quality guardrails.
- [`H_CHAOS_FUZZ_METHODOLOGY.md`](H_CHAOS_FUZZ_METHODOLOGY.md) — seeded property-based adversarial campaign, fault-class coverage matrix, severity, deterministic reproduction/minimization and zero-critical-safety-violation closure contract.
- [`H_SERIES_TELEMETRY.md`](H_SERIES_TELEMETRY.md) — normalized H request/reuse/provider-answer/adjudication/routing/price/fault/invariant/recovery/interference events and recomputable metric formulas.
- [`N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md`](N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md) — canonical N-Series methodology for sovereignty, capability marketplace, adaptive trust decay and sustained churn; **foundation only, not a benchmark result**.
- [`N_SERIES_TELEMETRY.md`](N_SERIES_TELEMETRY.md) — normalized N event vocabulary, safe public/private evidence mapping and recomputable specialist/policy/churn/trust formulas.
- [`BENCHMARK_SERIES_ISOLATION.md`](BENCHMARK_SERIES_ISOLATION.md) — normative D/S/T/H/E/N/future concurrency and R0/R1/R2 shared-resource isolation contract.

## Reproducibility note

GitHub Actions artifacts can expire. Therefore a report should retain, whenever safe and available:

- workflow/run ID;
- tested commit SHA;
- artifact name and ID;
- artifact SHA-256/digest;
- model/version identifiers relevant to the measurement;
- corpus/workload description;
- fixed gates and measured values;
- known limitations and corrections.

The report, not the temporary Actions artifact, is the durable public evidence record. For accepted D-200, the repository additionally retains sanitized per-node/per-host verification data and a SHA-256 identity manifest for every raw artifact file while explicitly withholding unsafe/private operational bytes.
