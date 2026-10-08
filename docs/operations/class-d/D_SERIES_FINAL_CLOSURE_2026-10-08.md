# D-Series Final Scale Closure — 2026-10-08

**Status:** D-200 PASS / D-500 PASS + REPEATABILITY / D-1000 PASS  
**Scope:** accepted real-process Class-D scale gates only.

## Accepted scale matrix

| Gate | Accepted execution | Scale | Routing / convergence | Recovery | Durability | Cleanup |
|---|---|---:|---|---|---|---|
| D-200 | run `35503894414`, attempt 1 | 20 hosts / 200 processes | baseline 400/400; post-restart 100/100; healed 200/200; convergence p95 256.43 ms | restart p95 28,717 ms; partition 32,159 ms | 100 writes, loss 0 | campaign + staging 0 remaining |
| D-500 | run `37666768998`, attempt 1 | 20 hosts / 500 processes | baseline 1.0; post-restart 1.0; healed 0.998; convergence p95 288.664 ms | restart p95 12,105 ms; partition 32,561 ms | 100 writes, loss 0 | campaign + staging 0 remaining |
| D-500 repeat | run `37676472133`, attempt 1 | same frozen 500-process source/tree | baseline/post-restart/healed/convergence 1.0; convergence p95 250.921 ms | restart p95 19,633 ms; partition 32,196 ms | 100 writes, loss 0 | campaign + staging 0 remaining |
| D-1000 | run `37687469411`, successful run_attempt 2 | 20 hosts / 1,000 processes | baseline 1.0; post-restart 0.99; healed 1.0; convergence p95 285.988 ms | restart p95 26,627 ms; partition 32,696 ms | 100 writes, loss 0 | campaign + staging 0 remaining |

## D-1000 immutable tuple

- source: `c1d3fa087716dbf24d0b3b65bceae303e907160a`
- tree: `266c83c8520d486cc6f1d44f63c8bd9b6e185c38`
- launch SHA: `e0da36ffb633b456f22bb29faccfba213fe28888`
- terminal: `TRUYN_D1000_TERMINAL result=PASS`
- runtime digest: `sha256:df45fa29e982bab8dfe83e02824690d5af6b8b5b0f4aa5ff385dc9d2bb193c88`
- artifact: `11543285161`
- artifact digest: `sha256:faf3f8665f074e32cf120751e8fc04decfba4ff42420bb8d834d4f1942e6a789`
- accepted placement: `southcentralus / Standard_E8as_v7`
- density: 50 processes/host, minimum 8 vCPU/host
- canonical scale-floor forward-port: `1974926e392c6e208a8fa5c7b54cfb224a13b7fc`

The first execution of the same D-1000 workflow identity (`run_attempt=1`) is preserved as infrastructure-only pre-provision evidence. It failed before VM creation because 160 regional vCPUs were required and only 120 were free. Artifact `11513876833`, digest `sha256:8a84958b1458d533012e42df69d419f446707f073c15006cea06771ca7d67d2f`. Protected quota repair run `37686421545` raised two candidate regions to 200 free vCPUs, after which the unchanged Attempt 1 passed as `run_attempt=2`.

## Conclusions

1. The accepted D-500 A22 runtime architecture scaled to 1,000 real processes with only the scale-density floor changed from 25/4-vCPU to 50/8-vCPU per host.
2. RF3/minAcks2, durability barriers, 99% routing floor, 120-second recovery/convergence ceiling, safety gates and zero-resource cleanup were not weakened.
3. D-1000 post-restart routing landed exactly at the accepted 99% floor with zero application retries; healed routing returned to 100%.
4. Acknowledged durable writes remained 100/100 retained after restart/partition/heal churn.
5. The D-Series scale ladder through 1,000 real processes is closed by immutable evidence; production longevity/SLO/mainnet/managed-production remain separate gates.

## Durable evidence

- D-200: `docs/benchmarks/CLASS_D_200_2026-09-20.md`
- D-500: `docs/benchmarks/CLASS_D_500_2026-10-07.md`
- D-1000: `docs/benchmarks/CLASS_D_1000_2026-10-08.md` and JSON companion
- current operational authority: `docs/operations/NETWORK_SCALE_STATUS.md`

Historical failures remain immutable audit evidence and are not rewritten by this closure.
