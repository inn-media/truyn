# TRUYN Class D-200 repeatability matrix

This ledger compares independent D-200 executions without rewriting earlier evidence.

The accepted reference run remains immutable. Each repeat receives its own run/artifact/evidence namespace. A later repeat does not retroactively change the status of an earlier run.

| Metric | Reference run | Repeat 01 |
|---|---:|---:|
| Status | **PASS / ACCEPTED** | **PENDING — NOT LAUNCHED** |
| Workflow run | `35503894414` | — |
| Attempt | `1` | — |
| Tested source | `e91c165c67c655deb80df4511ca346acb9f1f45b` | same frozen source |
| Tested tree | `3a402ba72502de12ed2277db3c9f472872f44b46` | same frozen tree |
| Azure placement | `eastus2 / Standard_E2as_v7` | required same placement |
| Hosts | `20/20` | — |
| Real processes | `200/200` | — |
| Identities | `200` | — |
| Endpoints | `200` | — |
| Synthetic nodes | `0` | — |
| Readiness | `200/200` | — |
| Valid peers | min `71`, max `198` | — |
| Remote failure domains | `20/20` | — |
| Convergence | `200/200` | — |
| Convergence p95 | `256.43 ms` | — |
| Baseline routing | `400/400` | — |
| Baseline p95 | `638.054 ms` | — |
| Restarted nodes | `100` | — |
| Restart recovery p95 | `28,717 ms` | — |
| Post-restart routing | `100/100` | — |
| Application retries | `0` | — |
| Packet partition blocked successes | `0/10` | — |
| Packet partition recovery | `32,159 ms` | — |
| Healed routing | `200/200` | — |
| Healed p95 | `322.473 ms` | — |
| Acknowledged durable writes | `100` | — |
| Retained writes | `100/100` | — |
| Acknowledged write loss | `0` | — |
| Confirmed missing writes | `0` | — |
| Read errors | `0` | — |
| Invalid signed state accepted | `0` | — |
| Stale revoked receipt accepted | `0` | — |
| Unauthorized provider execution | `0` | — |
| Aggregate RSS | `38,728,732 KB` | — |
| Measured QUIC/UDP bytes | `11,104,800,196` | — |
| Campaign cleanup | `true`, remaining `0` | — |
| Staging cleanup | `true`, remaining `0` | — |
| Terminal marker | `TRUYN_D200_TERMINAL result=PASS` | `TRUYN_D200_REPEAT_TERMINAL` expected |
| Artifact | `10603748497` | — |
| Artifact digest | `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4` | — |

## Interpretation rule

Repeatability is demonstrated only by the repeat run's own immutable terminal/evidence result. The matrix is a presentation layer, not a substitute for either run's evidence.

If Repeat 01 fails, its row will record FAIL and the associated evidence separately while the reference run remains **PASS / ACCEPTED**.

## Security rule

Only public verification telemetry is added here. Secrets, credentials, private/internal addresses, private cloud resource identifiers, connection strings, secret-bearing URLs and unnecessary operational logs are never published.
