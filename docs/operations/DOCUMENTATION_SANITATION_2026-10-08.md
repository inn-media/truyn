# Documentation Sanitation — 2026-10-08

**Scope:** public `inn-media/truyn` after Class D-1000 Attempt 1 acceptance and D-Series scale closure.  
**Accepted D-1000 source:** `c1d3fa087716dbf24d0b3b65bceae303e907160a`  
**Accepted D-1000 tree:** `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`  
**Canonical D-1000 scale-floor forward-port:** `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`

## Accepted result

D-1000 is **CLOSED / ACCEPTED / PASS**.

The accepted execution is workflow run `37687469411`, GitHub `run_attempt=2`, strict terminal `TRUYN_D1000_TERMINAL result=PASS`.

Measured result:
- 20 hosts × 50 real processes = 1,000 real processes;
- 1,000 identities / 1,000 endpoints;
- readiness 1,000/1,000;
- baseline 2,000/2,000 = 1.0;
- post-restart 99/100 = 0.99, first-attempt only, zero application retries;
- healed 1,000/1,000 = 1.0;
- convergence 1.0, p95 285.988 ms, p99 347.477 ms;
- 100 restarted nodes, restart recovery p95 26,627 ms;
- real packet partition: blocked successes 0/20, recovery 32,696 ms;
- acknowledged durable writes 100, acknowledged-write loss 0;
- confirmed missing writes 0, read errors 0;
- invalid signed state accepted 0;
- stale/revoked receipt accepted 0;
- unauthorized provider execution 0;
- campaign cleanup remaining 0;
- staging cleanup remaining 0.

Immutable accepted artifact: `11543285161`, digest `sha256:faf3f8665f074e32cf120751e8fc04decfba4ff42420bb8d834d4f1942e6a789`. Runtime digest: `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`.

## Attempt 1 first execution

The same workflow run's `run_attempt=1` is preserved as **INFRASTRUCTURE_QUOTA_PRE_PROVISION**, not a runtime failure. The placement gate required 160 regional vCPUs for 20 × 8-vCPU hosts and observed at most 120 free. No VM was created and no D-1000 network campaign ran.

Negative artifact: `11513876833`, digest `sha256:8a84958b1458d533012e42df69d419f446707f073c15006cea06771ca7d67d2f`.

Protected operator quota repair run `37686421545` raised `westeurope` and `southcentralus` to 200 free regional vCPUs. The exact same Attempt 1 was then rerun as `run_attempt=2` and passed.

## Canonicalization

The accepted D-1000 source differs from accepted D-500 A22 by one scale-specific provisioner change: 50-process hosts require at least 8 vCPU while 25-process D-500 hosts retain the 4-vCPU floor. That successful source delta is canonical in public `main` through `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`.

No network protocol, DHT durability, RF3/minAcks2, routing, recovery, safety or cleanup threshold was weakened.

## Launcher sanitation

The exact accepted workflow is archived at `.github/d1000/accepted-attempt1-workflow.yml`; the exact launch token is archived at `.github/d1000/accepted-attempt1-launch.txt`. They are intentionally outside active workflow/trigger surfaces. The active launch token/template are removed by this sanitation closure.

Historical workflow runs, commits and immutable artifacts remain append-only under redact-not-delete.

## Current boundary

All defined Class-D scale gates through D-1000 are accepted. This closes the defined 1,000-real-process network-scale gate only. Long-duration operations, rolling production SLO evidence, stable protocol/mainnet and managed-production acceptance remain separate gates.
