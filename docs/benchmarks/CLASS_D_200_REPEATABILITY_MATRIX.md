# TRUYN Class D-200 repeatability matrix

Status: **D-200 CLOSED / COMPLETE / REPEATABILITY CONFIRMED**

This ledger compares independent D-200 executions without rewriting earlier evidence. The accepted reference run remains immutable. Each repeat has its own run/artifact/evidence namespace.

| Metric | Reference run | Repeat 01 | Repeat 02 |
|---|---:|---:|---:|
| Status | **PASS / ACCEPTED** | **FAIL — PRELAUNCH AUTH CONFIGURATION** | **PASS / REPEATABILITY CONFIRMED** |
| Workflow run | `35503894414` | `35515705123` | `35517248924` |
| Attempt | `1` | `1` | `1` |
| Campaign started | yes | **no** | yes |
| Tested source | `e91c165c67c655deb80df4511ca346acb9f1f45b` | same frozen source | same frozen source |
| Tested tree | `3a402ba72502de12ed2277db3c9f472872f44b46` | same frozen tree | same frozen tree |
| Runtime digest | `sha256:296e7684229eaea00be02ce573b255461e340eae1b07b88da395c0f1102598c3` | same runtime built | same runtime |
| Azure placement | `eastus2 / Standard_E2as_v7` | not reached | `eastus2 / Standard_E2as_v7` |
| Hosts | `20/20` | not provisioned | `20/20` |
| Real processes | `200/200` | not provisioned | `200/200` |
| Identities | `200` | not provisioned | `200` |
| Endpoints | `200` | not provisioned | `200` |
| Synthetic nodes | `0` | not provisioned | `0` |
| Readiness | `200/200` | not run | `200/200` |
| Valid peers | min `71`, max `198` | not run | min `71`, max `196` |
| Remote failure domains | `20/20` | not run | `20/20` |
| Convergence | `200/200` | not run | `200/200` |
| Convergence p95 | `256.43 ms` | not run | `302.045 ms` |
| Baseline routing | `400/400` | not run | `400/400` |
| Baseline p95 | `638.054 ms` | not run | `642.338 ms` |
| Restarted nodes | `100` | not run | `100` |
| Restart recovery p95 | `28,717 ms` | not run | `28,798 ms` |
| Post-restart routing | `100/100` | not run | `100/100` |
| Application retries | `0` | not run | `0` |
| Packet partition blocked successes | `0/10` | not run | `0/10` |
| Packet partition recovery | `32,159 ms` | not run | `32,130 ms` |
| Healed routing | `200/200` | not run | `200/200` |
| Healed p95 | `322.473 ms` | not run | `220.542 ms` |
| Acknowledged durable writes | `100` | not run | `100` |
| Retained writes | `100/100` | not run | `100/100` |
| Acknowledged write loss | `0` | not run | `0` |
| Confirmed missing writes | `0` | not run | `0` |
| Read errors | `0` | not run | `0` |
| Invalid signed state accepted | `0` | not run | `0` |
| Stale revoked receipt accepted | `0` | not run | `0` |
| Unauthorized provider execution | `0` | not run | `0` |
| Aggregate RSS | `38,728,732 KiB` | not run | `38,519,932 KiB` |
| Measured QUIC/UDP bytes | `11,104,800,196` | not run | `10,765,953,864` |
| Campaign cleanup | `true`, remaining `0` | no campaign resources | `true`, remaining `0` |
| Staging cleanup | `true`, remaining `0` | `true`, remaining `0` | `true`, remaining `0` |
| Terminal marker | `TRUYN_D200_TERMINAL result=PASS` | `TRUYN_D200_REPEAT_TERMINAL result=FAIL` | `TRUYN_D200_REPEAT_TERMINAL result=PASS` |
| Artifact | `10603748497` | `10606213881` | `10607664333` |
| Artifact digest | `sha256:386387165b729ed2167140747a310d85822d9d1987dce812812408f2468bccd4` | `sha256:abdc99c9b8c227ea7ee83e260862563c99c6778c31ea4655999d0ee5191d84a5` | `sha256:62808cb3e8c49c7a6218bd259365bfcb1a73ac267ea55ce33e11fe6c4f674010` |

## Interpretation

Repeat 01 is preserved as a negative **pre-provisioning** result. It does not represent a benchmark regression because the cloud campaign never started.

Repeat 02 is a fully independent 20-host / 200-process campaign and passed the same strict acceptance contract on the same frozen source/tree/runtime and the same placement class.

Therefore the D-200 repeatability objective is complete. The reference PASS remains the canonical accepted gate; Repeat 02 independently confirms reproducibility.

## Closure rule

D-200 is **CLOSED / COMPLETE / REPEATABILITY CONFIRMED**. Runs `35503894414` and `35517248924` are immutable and **NEVER_RERUN**. Future work must use separate D-500/D-1000 gates.

## Security rule

Only public verification telemetry is committed. Secrets, credentials, private/internal addresses, private cloud resource identifiers, connection strings, secret-bearing URLs and unnecessary operational logs are not published.
