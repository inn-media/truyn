# Documentation Sanitation — 2026-10-07

> **Historical snapshot after D-1000 closure.** This file accurately records the 2026-10-07 state when D-1000 was still open. D-1000 was accepted on 2026-10-08 by Attempt 1 workflow run `37687469411`, successful `run_attempt=2`. Current authority: `DOCUMENTATION_SANITATION_2026-10-08.md` and `../benchmarks/CLASS_D_1000_2026-10-08.md`.

**Scope:** public `inn-media/truyn` current-state documentation after native GUI client qualification, post-merge hardening and Class D-500 acceptance.

**Native-client sanitation baseline:** `23a6b902310c9096b65af49f48307d7173cd03e9`  
**D-500 A22 lineage merge:** `5d0f8c3480ef8ff01887591fb96f552cf2192969`  
**D-500 full accepted runtime forward-port:** `61469b6934066ce0719aecd68356419240d95988`

## Canonical reconciliation

This sanitation makes the accepted native-client state durable across the public repository.

- The first-party Tauri requester GUI is implemented.
- Exact-head four-platform build qualification is closed on source `90e0b2c8bd4c51549756980479121a392b73325f`.
- Native Clients run `37632795987` passed the native contract and produced Windows NSIS `.exe`, macOS `.dmg`, Linux Debian `.deb`, and Android installable debug `.apk` artifacts.
- PR #904 merged the final concurrency, session-refresh, DNS re-resolution, IPv4-mapped-address, cancellation-race, recovery/UI, prompt-preservation and frozen-Cargo-graph hardening.
- The accepted hardening merge commit is `7dc3945273bf5120f1f9db25b71a05d611582a21`, which is in the ancestry of this sanitation baseline.
- Production signing/notarization, store publication and immutable public installer distribution are **not** claimed by build qualification and remain separate gates.

## SDK reconciliation

The stale statement that Maven Central and NuGet were still evidence-gated is removed. Current accepted prerelease coordinates remain:

- npm: `@truyn/sdk@0.1.0-alpha.2`
- PyPI: `truyn-sdk==0.1.0a1`
- Go: `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`
- Maven Central: `org.truyn:truyn-sdk:0.1.0-alpha.1`
- NuGet.org: `Truyn.Sdk 0.1.0-alpha.1`

Stable SDK v1 and stable `TRUYN/1` are not declared by this sanitation.

## Files reconciled

- `README.md`
- `ROADMAP.md`
- `docs/architecture/IMPLEMENTATION_STATUS.md`
- `docs/architecture/NATIVE_CLIENTS.md`
- `docs/getting-started/NATIVE_CLIENTS.md`
- `docs/compatibility/SDK_COMPATIBILITY.md`
- `clients/native/README.md`

Historical benchmark/evidence records are not rewritten. They remain immutable audit history under the repository's redact-not-delete policy.

## Permanent wording rule

Current-state documents must not regress the native client status to “source only” or “installer qualification pending” unless a later accepted regression explicitly invalidates the qualification evidence. Build-qualified must likewise never be silently upgraded to production-signed or publicly released without separate immutable evidence.


## Class D-500 acceptance reconciliation

D-500 is no longer OPEN. Immutable Attempt 22 run `37666768998`, attempt 1, emitted strict `TRUYN_D500_TERMINAL result=PASS` on frozen source `1d6746b57104175e295f8fdc3d9643db8e9d42a6` / tree `9f2771286cc683a9ee49e0e0c5f8092347d54470`.

The accepted evidence records 20 hosts / 500 real processes, baseline 100%, post-restart 100%, healed 99.8%, convergence 100% with p95 288.664 ms, recovery p95 12.105 s, packet-partition recovery 32.561 s, 100/100 retained acknowledged writes, zero safety violations and complete campaign/staging cleanup.

The successful lineage is preserved by merge `5d0f8c3480ef8ff01887591fb96f552cf2192969`. A subsequent full forward-port at `61469b6934066ce0719aecd68356419240d95988` made all 17 files changed from A19→A22 byte-identical to the accepted A22 source while preserving unrelated newer `main` work. Current-state documentation must not regress D-500 to OPEN, ACTIVE QUALIFICATION or retired/superseded-without-PASS wording unless later immutable evidence explicitly invalidates the accepted result.

Historical lineage remains immutable:
- Attempt 19 run `37592499491`: failed under CPU-saturated 2-vCPU placement;
- Attempt 20 run `37611659803`: blocked before VM creation by regional total-vCPU quota;
- Attempt 20 execution 2 run `37626451622`: 19/20 provisioned; latent `az vm create` reconciliation defect exposed;
- Attempt 21 run `37634703128`: 99/100 retained acknowledged writes;
- Attempt 22 run `37666768998`: PASS.

D-1000 remains open and independent. D-500 PASS does not imply D-1000, stable mainnet or managed-production acceptance.


## D-500 post-PASS branch sanitation

One-shot sanitation run `37675116608` completed successfully after the accepted runtime was canonicalized. It removed only the exact superseded A20–A22 preparation/arming refs:

- `prep/d500-a20-from-a19`
- `prep/d500-a21-from-a20`
- `prep/d500-a22-from-a21`
- `arm/d500-a20-ready`
- `arm/d500-a21-ready`
- `arm/d500-a22-ready`
- `arm/d500-a22-ready-r2`

The run emitted `TRUYN_D500_SANITATION=PASS removed_or_absent=7`.

Historical launch generations, commits, workflow runs and immutable artifacts were not deleted. The temporary sanitation workflow/trigger are removed by the commit recording this section.


## Accepted launcher archival

After D-500 closure, the active GitHub Actions launcher was removed from `.github/workflows` to enforce the no-rerun rule. Its exact accepted workflow definition is retained at `.github/d500/accepted-attempt22-workflow.yml` for regression/audit inspection. The historical `launch-22.txt` token remains in Git history/current tree as audit evidence but no active workflow listens to it.


## D-500 repeatability closure

The accepted D-500 result was intentionally repeated without runtime repair. Branch `repeat/d500-a22-double-check` was created directly at accepted source `1d6746b57104175e295f8fdc3d9643db8e9d42a6`; before launch its comparison to the accepted source was `identical` with 0 commits / 0 files diff.

Double-Check run `37676472133`, attempt 1, completed successfully and emitted strict `TRUYN_D500_TERMINAL result=PASS`. It used the same tested source/tree, the same 20×25 topology and the same acceptance thresholds. Only launch identity fields were unique (workflow/trigger/concurrency/artifact naming).

Measured repeat result:
- baseline 1.0;
- post-restart 1.0;
- healed 1.0;
- convergence 1.0, p95 250.921 ms;
- recovery p95 19.633 s;
- packet-partition recovery 32.196 s;
- 100 acknowledged writes, loss 0;
- campaign cleanup remaining 0;
- staging cleanup remaining 0;
- artifact 11510022526;
- artifact digest sha256:def31ad674ca39f44d07df91e397bb1f3ac63b8ea5c65b05d4fc4bc78c98d8c5.

The first accepted run `37666768998` remains the primary acceptance run. The Double-Check is stored as independent repeatability evidence. Both runs tested source `1d6746b57104175e295f8fdc3d9643db8e9d42a6` / tree `9f2771286cc683a9ee49e0e0c5f8092347d54470`.

The repeat launcher and trigger are archived outside the active workflow surface by the commit containing this section, preventing accidental third execution while preserving exact audit material.


## D-500 repeatability branch sanitation

After the successful exact-frozen Double-Check, one-shot sanitation run `37685402879` deleted only `repeat/d500-a22-double-check` and completed successfully. The run emitted `TRUYN_D500_REPEAT_SANITATION=PASS removed_or_absent=1`.

The repeat workflow and launch token had already been archived outside the active workflow/trigger surfaces. This commit removes the temporary sanitation workflow/trigger themselves. Both successful D-500 workflow runs, commits and immutable artifacts remain preserved.
