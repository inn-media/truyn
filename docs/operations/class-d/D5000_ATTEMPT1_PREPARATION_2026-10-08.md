# D-5000 Attempt 1 — Quota-first preparation (2026-10-08)

**STATUS: PREPARING, NOT LAUNCHED.** Target: 20 actual VMs × 250 nodes = 5,000 real nodes. Neither application run nor acceptance evidence exists.

## Accepted precedent
D-1000 primary run [37687469411](https://github.com/inn-media/truyn/actions/runs/37687469411) and exact-source Double-Check [37785777704](https://github.com/inn-media/truyn/actions/runs/37785777704) both had strict PASS, same tested source `c1d3fa087716dbf24d0b3b65bceae303e907160a`, same tested tree `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`, runtime digest `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`. Results are **D-1000 evidence only**, not D-5000 evidence.

## Preparation ownership
- Public preparation branch: [d5000/attempt1-preparation-20261008](https://github.com/inn-media/truyn/tree/d5000/attempt1-preparation-20261008).
- Exact archived workflow/trigger copies are in public `.github/d5000/reference/`; no D-5000 benchmark workflow is active or dispatched.
- Public detailed preparation runbook: `docs/benchmarks/CLASS_D_5000_PREPARATION_2026-10-08.md` on the preparation branch.
- Authorized public main hosts **quota-only** workflow `.github/workflows/d5000-quota-only-20261008.yml`, triggered by `.github/d5000/quota-request-20261008.txt`.
- Quota-only Actions [run 37795027151](https://github.com/inn-media/truyn/actions/runs/37795027151), target `southcentralus`, provisional `800` regional/family vCPUs (20 × 32 vCPU = 640 minimum planned). **Submitting a quota request is not quota approval, VM allocation, or benchmark qualification.**
- Exact region, SKU/family, allowed quotas, real 20-host placement and true 250-process host capacity remain to be established using live Azure checks.

## Critical blocking gates
The frozen D-1000 provisioner only allows 10/25/50 processes per host. A new D-5000 implementation must explicitly and safely support 250/host while preserving 20 real hosts, unique IDs/endpoints, RF3/minAcks2, 99% routing floors, 120-second recovery/convergence ceilings, durability, zero safety violations and zero leaked resources. Do not relabel D-1000 results as D-5000 or weaken acceptance. Complete 5,000-node evaluator, runtime bundle, network/port/FD/memory tests, exact-SHA CI, quota and capacity approval, resource/budget/duplicate guards. D-5000 Attempt 1 requires **separate explicit launch permission after all gates GREEN**.

## Public/private boundary
Only safe public state, SHA and evidence identifiers are recorded. No private quota authority, credentials, subscription IDs, sensitive cloud inventory or public tested runtime code are copied to the private repository. D-1000 remains ACCEPTED/REPEATABILITY CONFIRMED; D-5000 remains NOT RUN.
