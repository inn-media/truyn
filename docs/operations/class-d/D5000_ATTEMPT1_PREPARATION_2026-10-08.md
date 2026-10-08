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

## Azure quota-only RBAC repair — 2026-10-08

Confirmed public run `37799470103` was **FAIL / AUTHORIZATION**, not a D-5000 benchmark failure. OIDC login and provider registration `Microsoft.Quota=Registered` succeeded. Live Compute usage in `southcentralus`: regional `cores` quota **200**, used **0**; `StandardEasv7Family` quota **350**, used **0**. Planned target is **800 for both** (capacity request, not approved quota). The Quota API refused `Microsoft.Quota/quotas/read` (`AuthorizationFailed`) for the existing OIDC service principal.

Microsoft documents the subscription-scope **Quota Request Operator** role (built-in ID `0e5f05e5-9ab9-446b-b98d-1e2157c94125`) for quota API requests. The repaired quota-only workflow performs the read RBAC preflight, attempts **only least-privilege same-principal assignment if the existing credential already has roleAssignments/write**, and stops clearly with `RBAC_GRANT_REQUIRED` if it cannot legally grant the role. It then awaits RBAC propagation and verifies quota resources before submitting any request.

Repair workflow commit `70cd89d1d9265a5165d3e3326831e971e5051b91`. Follow-up quota-only workflow run [`37800470741`](https://github.com/inn-media/truyn/actions/runs/37800470741) (launcher `7b5fa93507a3c882162359ebf25cf582cea26262`): **submitted, result to be verified; do not infer quota approval**. Any privileged RBAC changes or requests must be independently verified against effective regional/family quotas, and 20-VM placement still needs a separate real-capacity gate.

**D-5000 benchmark remains NOT LAUNCHED.** Never start the network campaign from a quota-only run. The previously accepted D-1000 evidence remains unchanged.

## Quota-only authorization incident and supported fallback — 2026-10-08

- Confirmed failed run [37800470741](https://github.com/inn-media/truyn/actions/runs/37800470741) terminal `RBAC_GRANT_REQUIRED`. The current GitHub OIDC principal can authenticate and read Azure Compute usage, but cannot read `Microsoft.Quota/quotas` or assign itself subscription-scope roles. This is an Azure authorization boundary, not a D-5000 benchmark regression. The first attempted self-elevation was rejected. No quota requests succeeded in that run.
- Last confirmed quota values in `southcentralus`: regional `cores=200` (used 0), `StandardEasv7Family=350` (used 0); target `800/800` for provisional 20 × 32-vCPU placement. Effective target quota **is not yet proven**.
- Public repair implements a quota-only controller at `.github/d5000/quota-only-request.sh`: a direct single-resource Quota API permission probe, ID and unit validation, preservation of `isQuotaApplicable=false`, no role escalation, optional independent Microsoft.Support quota ticket fallback only if authorized, fixed ticket identity to prevent duplicates, and Compute readback distinguishing `EFFECTIVE` from `REQUEST_SUBMITTED_PENDING` and `BLOCKED`. The Azure Support REST path may itself require a suitable subscription role and eligible support plan; the fallback is not a promise of approval.
- New quota-only run [37803082829](https://github.com/inn-media/truyn/actions/runs/37803082829), launcher SHA `4825d5822f091de3d249a2fae66cfd4b86c77834`, is the single attempted follow-up. Check its terminal result and Azure effective quota before declaring success. If still blocked, subscription admin must grant **Quota Request Operator** (role ID `0e5f05e5-9ab9-446b-b98d-1e2157c94125`) to the already configured GitHub OIDC service principal at subscription scope, or supply an authorized support path. Never bypass Azure RBAC.
- Public frozen D-1000 evidence remains accepted and unchanged. **D-5000 benchmark remains NOT LAUNCHED**; no VM provisioning is part of this quota-only operation.
