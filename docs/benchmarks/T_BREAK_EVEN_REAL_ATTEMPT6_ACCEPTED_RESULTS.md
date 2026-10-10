# T/BREAK-EVEN-REAL-BENCHMARK — Attempt 6 accepted closure (2026-10-10)

**Decision: CLOSED / REAL MEASURED RUN PASS.** This closes *only* the independent `T/BREAK-EVEN-REAL-BENCHMARK` Attempt 6 diagnostic. It does **not** close TS8 or any S/D/E/N/H series or establish a commercial economic break-even.

## Immutable source
- Independent private CI attestation: real run #38031899826, completed/success, attempt 1; full evidence retained in private repository.
- Private immutable evidence bundle includes samples, request events, summary, independent audit and checksums; raw bundle not published.
- Exact private source identity recorded in the restricted evidence ledger.
- Frozen public methodology SHA: `4d7c3b6a823a3e8079800386384af100b2e1978d`.
- Independently verified `independent-audit.json.status=PASS`, `defects=[]`; summary result remains **DIAGNOSTIC_ONLY** (not a claim of universal commercial superiority).

## Accepted gates
| Gate | Evidence |
| --- | --- |
| Real paid execution | 57 logical calls; 57 physical HTTP attempts; 57 HTTP 200 |
| Correctness | 57/57 exact-answer samples correct; zero quality failures |
| Failure accounting | 0 failed requests; stoppedReason null; 0 retries |
| Audit | Independent audit PASS; no defects |
| Coverage | A=9, B=6, C=6, D=30, E=6 |
| Network telemetry | Network phases present for all 57 attempts |
| Control | 15-second D control accepted by the independent audit |
| Identity | Durable exactly-once claim succeeded for Attempt 6; **never rerun this paid identity** |

## Measured comparison (mean end-to-end logical latency, milliseconds)
| Stratum | DIRECT | TRUYN | TRUYN relative change |
| --- | ---: | ---: | ---: |
| A, TRUYN-only | — | 673.65 | not comparable |
| B, 3 DIRECT + 3 TRUYN | 1093.32 | 621.95 | -43.1% |
| C, DIRECT-only | 653.65 | — | not comparable |
| D, 15 DIRECT + 15 TRUYN | 701.30 | 630.31 | -10.1% |
| E, 3 DIRECT + 3 TRUYN | 741.16 | 672.69 | -9.2% |
| Overall, non-paired mix | 738.70 | 646.72 | **descriptive only** |

Input token mean: DIRECT=3032 / request; TRUYN=157.33 / request (~94.8% fewer). Cached DIRECT input tokens: B=0, C=17,664, D=44,160, E=8,832; TRUYN cached=0. **Therefore token savings are not bill savings**: Azure cached-input pricing and TRUYN retrieval/infrastructure overhead must be considered. No settled invoice or full marginal cost model is in the accepted evidence.

## Scope and limitations
The Attempt 6 DIRECT input used a compact deterministic projection of all 128 source record objective codes, while TRUYN used topK=8 retrieval and deterministic title selection. These changes from Attempt 5 were explicitly recorded; do not portray latency results as an apples-to-apples copy of Attempt 5. Small paired samples and a single Azure deployment prevent general production-performance claims. Acceptance is of protocol execution, evidence completeness, exact-answer correctness and independent audit; it is **not** a proved break-even USD threshold.

## Sanitation decisions
- Keep Attempt 1–5 runs and original evidence immutable as failure history; never rewrite or reclassify their status.
- Do not rerun Attempt 6 or delete its single-use claim.
- Keep old workflow and lock contracts for evidence traceability; do not delete branches, cloud containers, shared secrets, or tasks belonging to concurrent work.
- Only finalize this independent benchmark documentation; unrelated PRs are not in scope.
