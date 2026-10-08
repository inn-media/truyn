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


## 2026-10-09 Mainline P0/P1/P2 repair summary

- Canonical integration **draft PR [#921](/inn-media/truyn/pull/921)**, current signed source SHA `06a44526eeb2786f1005120cd3e3efb0bfd02a32`, tree `8320ea3d558bf15004811c8d546f6fc5651ffe67`. PR [#920](/inn-media/truyn/pull/920) was closed unmerged due to older-ancestor D-series compatibility failures.
- Fully offline qualifier [37851474607](/inn-media/truyn/actions/runs/37851474607) **PASS** for exact signed source, strict D-5000 evaluator, per-host telemetry mock tests, no Azure VMs, DHT replication deadline test, SHA-checked runtime bundle.
- DHT P2 bug independently confirmed: `placementTimedOut` was locally scoped inside `new Promise` and then referenced outside, throwing `ReferenceError` on a real write timeout. Repaired in `network/replication/dht-replication.js` by hoisting the flag to the encompassing write scope. Quorum, fail-closed deadline, durability checks are unchanged.
- Shared Class-D five-patch checker previously expected only a historical batch-style DHT store and RED on both main and the earlier PR. Now it independently validates both historical and modern bounded in-flight pump variants with explicit ack/deadline/quorum invariants. [Five-Patch run 37851444792](/inn-media/truyn/actions/runs/37851444792) **PASS** on this fix.
- Shared D-series blockwise aggregate continues RED at 10/16 because of **pre-existing legacy D-200/D-500 assumptions**, missing old archived workflows and unrelated public documentation leakage patterns. Its failure must not be hidden by D-5000 acceptance changes; isolate/repair through task-specific separate controls.
- New `d5000-attempt2-approved-only.yml` remains **INACTIVE**, pinned to above source and qualifier, gated on merged PR #921 and a new explicit user-approved launch marker. The actual physical D-5000 readiness, convergence, baseline, safety and cleanup thresholds still require their own measured run before any PASS claim.

## 2026-10-09 P0 completeness and frozen source attestation
The following *additional* independently diagnosed acceptance defects were fixed only on draft PR [#921](https://github.com/inn-media/truyn/pull/921):
1. D-5000's own evaluator/terminal verifier previously did not require `readiness.readyNodeCount == 5000`, complete `stageResults.overall == PASS`, or absence of RED/SKIPPED mandatory stages. All are now required, together with a D-5000 class/scope source contract. Regression tests explicitly reject missing/partial readiness, skipped/RED/missing stages, D-1000 class/scope.
2. D-5000 campaign formerly emitted `testedCommit=${GITHUB_SHA}`, which identifies the GitHub launcher, not the frozen source. Both evidence writers now record `TESTED_COMMIT`; terminal verification cross-checks source `TESTED_COMMIT` and exact `GITHUB_RUN_ID` against evidence. Negative tests reject SHA/run mismatch.
3. Source `f8352f34a770bd1be771e2410dd65c59d00f40d8`, tree `606ed82878afa2802fa938a1f895b43f4ff93bb4`, qualified by [run 37852561784](https://github.com/inn-media/truyn/actions/runs/37852561784) **PASS** with immutable bundle, zero Azure VM deployment. The future approval-only launcher pins this frozen source. No Attempt 2 token exists.
4. Full PR gates remain RED because inherited D-Series B03/B05/B06/B14/B16 fail. Evidence shows missing sanitized legacy D-500/bootstrap workflows and security guard violations from active D-5000 workflows/docs; do **not** whitelist secrets/operations or silently reinstate historical triggers to make the dashboard green. The separate shared-contract/security cleanup requires preserving public/private boundaries.
5. Actual 20×250 measured readiness and baseline ≥99% remain unproven; the 80.04% routing failure from Attempt 1 cannot be fixed by evaluator enhancements alone. Do not dispatch D-5000 Attempt 2 until every mandatory gate is qualified and an explicit launch is authorized.


## 2026-10-09 Post-merge functional repair reconciliation (no paid D-5000 run)

- The previous PR #921 historical **draft/unmerged** status above is superseded: PR #921 was **MERGED** at `51517beedee092a22766e2bed106f130a4ffd3d2`. Corrective QUIC control-plane change is in public main as `675576f0e33c511f2f79a4718e9cf9fed4ec2296`.
- Fixes merged: nonce-isolated Azure guest scripts on a shared VM; foreground DHT/RPC timers remain referenced until settlement; local-hit replica repair independently accounts for former failed holder; bounded single pre-dispatch QUIC connect retry on the same canonical discovered binding (or newer signed binding), without resending any application envelope. Core D-5000 readiness/routing/latency, quorum, safety and cleanup predicates were **not weakened**.
- Exact frozen D-5000 corrected candidate: `4889e3b6bcf7d876ac9a3543f2ea0de5ec718eeb`, tree `7146f06d2279e0fe6bad9403a3687f65cafd95ea`, based on the merged PR source and one corrective commit. Offline no-Azure qualification **PASS** on GitHub Actions [run 37857444064](/inn-media/truyn/actions/runs/37857444064), including strict 16-file provenance, shell/mock guest-exit contracts, node admission, targeted DHT/durable network/QUIC tests and immutable runtime bundle. Earlier qualification failures 37857214452 and 37857337418 were diagnosed and superseded; the last failed due to missing installed QUIC dependencies before network tests, subsequently corrected.
- The user explicitly de-scoped disabled legacy Blockwise and historical aggregate D-Series gates; they are **not D-5000 repair acceptance prerequisites**. Existing protection boundaries, exact-source and safety assertions remain intact.
- The **approval-only** Attempt 2 launcher is re-pinned to exact candidate SHA/tree and offline run 37857444064, with merged PR provenance and no duplicate attempts. There is **no** new approved marker or physical Attempt 2 dispatch in this checkpoint.
- **Not yet demonstrated:** actual corrected 20 Azure hosts × 250 real processes achieving 5,000/5,000 readiness, >=99% first-attempt routing, p95 <=120 s, healing, durability and zero safety violations under the same workload. Attempt 1 measured 3136/5000 readiness and 8004/10000 routing; code repairs and offline PASS do not erase this negative evidence. A separate approved new measured run is necessary for a full D-5000 PASS.
