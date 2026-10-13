# S-Series S-200 Double-Check documentation sanitation — 2026-10-13

**Canonical current status:** S-10/20/50/100 accepted; **S-200 six-provider bounded scope CLOSED / DOUBLE-CHECK VERIFIED** by primary A14+A15 evidence plus independent fresh A17 8/8 evidence. Original seven-provider DeepSeek parity, physical WAN/SLO/Mainnet and S-500 remain OPEN.

This sanitation supersedes current-status wording in the 2026-10-12 S-Series sanitation record without deleting or rewriting historical evidence.

## Canonical evidence
- primary: `docs/benchmarks/S_SERIES_S200_2026-10-12.md`;
- independent Double-Check: `docs/benchmarks/S_SERIES_S200_DOUBLE_CHECK_2026-10-13.md`;
- machine summary: `docs/benchmarks/evidence/S_SERIES_S200_DOUBLE_CHECK_2026-10-13.json`.

## Reconciled conclusions
1. A17 independently passed all eight scenarios with all scenario measurements fresh and no A14/A15 result adoption.
2. Six-provider S-200 repeatability is now confirmed; this still does not satisfy the declared seven-provider/DeepSeek contract.
3. The S-100/S-200 request-path contention investigation is closed as a relay/requester bottleneck: A17 non-provider p95 is 2,412 ms and e2e p95 8,901 ms at 200-way contention.
4. ECON/MIX retains a distinct GPT rate-limit tail: 106 HTTP 429 responses in that stage; capacity-aware routing/pacing remains OPEN.
5. Cost evidence is benchmark-priced actual token usage, not invoice savings.
6. Historical A14/A15 failures, attempts, reports and dated sanitation records remain append-only audit history.

## Documentation rule
Any current-status table or README must point to the 2026-10-13 Double-Check report. Older dated documents may retain historical observations only when clearly marked/superseded and must not override this status.
