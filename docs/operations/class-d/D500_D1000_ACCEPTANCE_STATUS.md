# D-500 / D-1000 acceptance status

**Snapshot:** 2026-10-08

## D-500

Status: **ACCEPTED / PASS / REPEATABILITY CONFIRMED / CLOSED**

Canonical immutable evidence:
- Attempt 22
- workflow run `37666768998`, attempt 1
- terminal `TRUYN_D500_TERMINAL result=PASS`
- frozen source `1d6746b57104175e295f8fdc3d9643db8e9d42a6`
- frozen tree `9f2771286cc683a9ee49e0e0c5f8092347d54470`
- launch SHA `23775f700929cf66ece66496428eece37cc240ed`
- artifact `11504509954`
- artifact digest `sha256:6a255b77f2988913f41593a275c8bd7cb813ee0f49e52f3f073e51879e12cc66`
- A22 lineage merge `5d0f8c3480ef8ff01887591fb96f552cf2192969`
- full accepted runtime forward-port / canonical main `61469b6934066ce0719aecd68356419240d95988`

Repeatability evidence:
- exact-frozen Double-Check run `37676472133`, attempt 1
- terminal `TRUYN_D500_TERMINAL result=PASS`
- same tested source/tree as primary Attempt 22
- baseline/post-restart/healed/convergence = `1.0 / 1.0 / 1.0 / 1.0`
- convergence p95 `250.921 ms`
- recovery p95 `19,633 ms`
- packet-partition recovery `32,196 ms`
- acknowledged writes `100`, loss `0`
- cleanup and staging cleanup both `remaining=0`
- artifact `11510022526`, digest `sha256:def31ad674ca39f44d07df91e397bb1f3ac63b8ea5c65b05d4fc4bc78c98d8c5`

The earlier wording that D-500 validation was retired/superseded was historical product-state text, not a PASS. It is superseded for current status by immutable Attempt 22 acceptance. Historical failures remain unchanged audit evidence.

## D-1000

Status: **ACCEPTED / PASS / CLOSED**

Canonical immutable evidence:
- Attempt 1
- workflow run `37687469411`
- successful GitHub run attempt `2`
- terminal `TRUYN_D1000_TERMINAL result=PASS`
- frozen source `c1d3fa087716dbf24d0b3b65bceae303e907160a`
- frozen tree `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`
- launch SHA `e0da36ffb633b456f22bb29faccfba213fe28888`
- artifact `11543285161`
- artifact digest `sha256:faf3f8665f074e32cf120751e8fc04decfba4ff42420bb8d834d4f1942e6a789`
- runtime digest `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`
- canonical scale-floor forward-port `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`

Measured PASS: 20 hosts / 1,000 real processes, readiness 1,000/1,000, baseline 1.0, post-restart 0.99, healed 1.0, convergence 1.0 / p95 285.988 ms, restart recovery p95 26,627 ms, partition recovery 32,696 ms, 100 acknowledged writes with zero loss, zero safety violations and zero-resource cleanup.

The same Attempt 1 `run_attempt=1` failed before VM creation because free regional quota was 120 vCPU below the required 160. It is retained as infrastructure-only negative evidence; no D-1000 runtime stage executed. Quota repair run `37686421545` raised two target regions to 200 free vCPUs, enabling the successful `run_attempt=2`.

Canonical public D-1000 report: [`../../benchmarks/CLASS_D_1000_2026-10-08.md`](../../benchmarks/CLASS_D_1000_2026-10-08.md).

D-1000 acceptance closes the defined 1,000-real-process Class-D gate. It does not imply stable mainnet or managed-production acceptance.

## D-1000 exact-frozen Double-Check — 2026-10-08 (authoritative update)

**Class D-1000 status: ACCEPTED / PASS / REPEATABILITY CONFIRMED / CLOSED (defined scale gate only).** The primary accepted Attempt 1 remains workflow run [37687469411](https://github.com/inn-media/truyn/actions/runs/37687469411), successful GitHub run_attempt=2. The independent exact-frozen Double-Check is [37785777704](https://github.com/inn-media/truyn/actions/runs/37785777704), GitHub run_attempt=1, `completed/success`, strict `TRUYN_D1000_TERMINAL result=PASS`. It is **not** a second attempt of the original GitHub run and does not overwrite the primary immutable evidence.

Both successful executions checked out the **identical source** `c1d3fa087716dbf24d0b3b65bceae303e907160a`, **identical tree** `266c83c8520d486cc6f1d44f63c8bd9b6e185c38` and identical runtime digest `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`. Double-Check launcher SHA: `e5c957123efa449e14fb225fd8be5df2d0e6e995`; Azure placement: `southcentralus / Standard_E8as_v7`; **20 real hosts × 50 processes = 1,000 processes**.

| Verified metric | Primary PASS | Double-Check PASS |
|---|---:|---:|
| Baseline routing | 1.000 | 1.000 |
| Post-restart routing | 0.990 | 1.000 |
| Healed routing | 1.000 | 1.000 |
| Convergence routing | 1.000 | 1.000 |
| Convergence p95 (ms) | 285.988 | 251.139 |
| Restart recovery p95 (ms) | 26,627 | 10,950 |
| Packet-partition recovery (ms) | 32,696 | 32,901 |
| Acknowledged durable writes | 100 | 100 |
| Acknowledged-write losses | 0 | 0 |
| Campaign / staging remaining resources | 0 / 0 | 0 / 0 |
| Strict terminal | PASS | PASS |

Double-Check `CAMPAIGN_RC=0`, `EVALUATOR_RC=0`, `TERMINAL_RC=0`, `cleanup=true`, `staging_cleanup=true`; evidence artifact **11557320070** and digest **sha256:3b84a2acf39ad34735a069e5a3e62f84be675f11636f68812eb0b78a64959a32**. Launcher-only changes were isolated from frozen benchmark source. Historical branch-OIDC failure [37784820939](https://github.com/inn-media/truyn/actions/runs/37784820939) happened before provisioning (`AADSTS700213`) and is **not** a D-1000 network regression. The prior primary run_attempt=1 quota failure also remains immutable pre-provision evidence. No tests, thresholds, network source, old reports, or negative evidence are weakened or deleted.

**Scope boundary:** this demonstrates repeatability of the specified 1,000-process Class-D scale acceptance. It does not establish long-duration production SLO compliance, private managed-production acceptance, or mainnet readiness. Public repository remains the authoritative source of benchmark/evaluator/evidence; private repository consumes only immutable identifiers and sanitized public metrics.
