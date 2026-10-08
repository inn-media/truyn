# D-5000 Attempt 1 — fail-closed failure analysis and abort

**Task:** `truyn-d5000-attempt1-exact-d1000-source-20261008`.
**Campaign:** [GitHub Actions run 37824934693](/inn-media/truyn/actions/runs/37824934693), source SHA `983429dd6f83f361ec665f452e4974bb0cae91bc`, source tree `f304e4d5726f5f804ce392832f7dd14d8f7b81a6`, launcher SHA `816b228544f643356332adb68dd16f6be5ffb314`.
**Outcome:** **CANCELLED / D-5000 TERMINAL FAIL**, not accepted. User requested stop. The cancellation was confirmed by GitHub and a targeted independent Azure cleanup workflow was started: [37845931904](/inn-media/truyn/actions/runs/37845931904). **Do not claim Azure cleanup PASS unless that workflow proves zero remaining resources plus zero staging storage.**

## Ground truth
- The provisioner allocated **20** Azure VMs, `southcentralus`, `Standard_E32ds_v6`; installation/bootstrap/network topology and identity proof passed: **5000 real processes / identities / QUIC endpoints over 20 hosts**. Azure quotas and initial placement were sufficient and are not the observed failure.
- First significant red gate: `readiness-barrier`. Recovery diagnostic shows **3136/5000** nodes ready overall (1864 not ready), and each of 20 host recovery jobs returned `rc=1`; individual hosts range from 0/250 (host 7) to 250/250. No reduction of readiness requirement is authorized.
- Convergence: **4960/5000** success from remote samples (99.2%); host 11 has **211/250**, `p95=146921.302 ms`, above strict 120000ms cap. Current implementation applies **max(host-local p95)** as convergence p95 and rejected correctly; do not alter the acceptance calculation without an independently reviewed equivalence proof.
- Freshness barrier: at least **seven distinct host-node errors** contained `present=true`, `validNow=true`, but `expiresInMs<900000`, including host 4 node 78 (670845 ms) and host 13 node 186 (784477 ms). Stage `pre-baseline-peer-freshness` returned RED even though remote wrapper reported all host invokes succeeded. `az vm run-command invoke` exit=0 is not sufficient proof that the guest script exited zero; the current remote() wrapper does not parse a guest terminal exit marker.
- Baseline: **8004/10000 first-attempt probes successful = 0.8004**. Worst origin hosts: host 6 18/500, host 11 26/500, host 7 282/500. This alone disproves the >=0.99 baseline gate. Baseline diagnostic computation jobs completed on all 20 hosts, but collection via bounded remote batches had **19/20 hosts rc=1 by cancellation**; precise collector failures cannot be inferred without per-host logs.
- No accepted healing, recovery or safety conclusion can be drawn from this cancelled campaign. Its final terminal marker: `TRUYN_D5000_TERMINAL result=FAIL`, evidence/latency metrics absent, `cleanup=false remaining=-1`; staging cleanup reported `true / 0` in the original workflow, but full Azure cleanup requires separate audit.

## Root cause classification and next repair
1. **Confirmed functional regression:** at 250 nodes/VM the network fails exact readiness and baseline routing thresholds. Inspect per-node DHT pending propagation, refresh RPC scheduler capacity, peer-record renew/distribution, CPU, memory, events, and per-host communication. The evidence does not prove a single underlying root cause (CPU, network packet loss, scheduler starvation, or lease algorithm).
2. **Peer lease freshness:** initial signed peer lease 1800000ms, renew-before 900000ms, strict required remaining >=900000ms; this leaves no timing margin. Start renewal earlier, verify fresh signed records at observer before PASS, constrain queue and contention without lowering 900000ms.
3. **Remote-command status defect:** `remote()` must distinguish Azure Run Command transport completion from guest script exit; use a verified end-of-guest execution marker and fail closed on absence/nonzero, preserving per-host stderr. This defect caused host status to be misleading while aggregate gate still correctly failed.
4. **Diagnostic survivability:** bounded failure-row fetching per host did not complete under the heavy failure load; checkpoint immutable and deduplicated per-host diagnostics before moving to the next dependent stage. Remote collection must be bounded by bytes, time and retries, preserving failed-host exceptions.
5. **Scale tuning:** qualify 250 local nodes under full 20-host load (not a 50-node extrapolation), then strict 5000-node topology/readiness/convergence/baseline/peer-freshness/safety on **new exact SHA** before any new paid run. Do not lower thresholds, suppress errors, or re-run this Attempt 1.

## Evidence
- [Run log](/inn-media/truyn/actions/runs/37824934693)
- [Immutable GitHub artifact 11579008955](/inn-media/truyn/actions/runs/37824934693/artifacts/11579008955): `class-d-200-diagnostic.log`, runtime manifest and digest, staging cleanup.
- User-provided heartbeat/traceback excerpt from the same run confirmed the freshness barrier (host 13 node 186) and degraded baseline diagnostic collection.
- Cleanup run [37845931904](/inn-media/truyn/actions/runs/37845931904); force-cancel [37846096504](/inn-media/truyn/actions/runs/37846096504). Do not launch a new D-5000 benchmark before independent cleanup and fresh qualification.


## Confirmed final Azure cleanup

The independent cleanup controller [37845931904](/inn-media/truyn/actions/runs/37845931904) completed **SUCCESS**. Its final Azure readback marker was:
```text
TRUYN_D5000_ABORT_TERMINAL run=37824934693 conclusion=cancelled
TRUYN_D5000_ABORT_CLEANUP remaining=0 staging=absent
TRUYN_D5000_ABORT_CLEANUP=PASS zero_campaign_resources=true zero_staging_resources=true
```
Scope was strictly `truyn-d5000-37824934693*` and `td2d20037824934693` in resource group `truyn`. Original workflow final terminal status remains **FAIL**; the independently confirmed cleanup is a separate positive result, not a reason to change benchmark acceptance. Emergency force-cancel workflow [37846096504](/inn-media/truyn/actions/runs/37846096504) also completed successfully. No new benchmark attempt was dispatched.


## 2026-10-09 Repair checkpoint (do not conflate offline PASS with a measured D-5000 PASS)

- Isolated repair PR: [#920](https://github.com/inn-media/truyn/pull/920), branch `repair/d5000-attempt1-p0-p1-20261009`, exact source `72d7bf6daed2454d34239260ac82c314f5a92e8a`, tree `d822af4f811f09479b68d79ed597d303c29247c2`. Parent immutable D-5000 code is `983429dd6f83f361ec665f452e4974bb0cae91bc`.
- Offline qualification: [run 37849586716](/inn-media/truyn/actions/runs/37849586716) **PASS**. Provenance and unchanged canonical D-1000, bash syntax, mock Azure guest nonzero/missing-marker failures, chunked readiness SHA256 serialization static contracts, DHT unit tests, strict D-5000 admission tests, and SHA-checked immutable runtime.
- D-5000-specific fixes: fail-closed remote guest exit attestation; separate fail-fast stage controller marking dependent stages SKIPPED_DEPENDENCY; verified 250-node readiness observation chunks rather than Azure Run Command truncation; one jq field parse per readiness probe; pre-expiry owner lease renewal at `1350000ms` (was `900000ms`); bounded CPU-pressure/memory/socket host snapshot at first RED with checksums. Peer-record TTL remains `1800000ms` and observer acceptance **retains `900000ms` minimum**, baseline and healed each **>=0.99**, recovery and convergence **p95<=120000ms**, zero safety violations and mandatory cleanup.
- Future launcher `.github/workflows/d5000-attempt2-approved-only.yml` is staged on `main` but **has not been triggered**. It checks out the exact qualified repair SHA, requires an explicit new user-approved marker, runs the new D-5000 stage wrapper and includes failure snapshots in artifacts. There is currently **no** `.github/d5000/launch-attempt2-approved.txt`; do not create it automatically.
- **Unresolved / not claimed:** real 20-host × 250-process readiness, DHT convergence and baseline under load. Offline checks cannot prove 5000-node performance. Lower-cost 250-process host and multi-host load diagnostics remain necessary; do not hide residual 80.04% baseline problem with timeout/threshold changes. Also validate live operation under the revised transport marker against Azure Run Command output limits before any D-5000 paid campaign.
- Azure cleanup of cancelled Attempt 1 remains confirmed zero resources per independent run 37845931904. No new paid benchmark has been started as part of this repair.
