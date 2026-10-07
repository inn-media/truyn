# Documentation Sanitation — 2026-10-07

**Scope:** public `inn-media/truyn` current-state documentation after native GUI client qualification, post-merge hardening and Class D-500 acceptance.

**Native-client sanitation baseline:** `23a6b902310c9096b65af49f48307d7173cd03e9`  
**D-500 canonical runtime merge before this documentation closure:** `5d0f8c3480ef8ff01887591fb96f552cf2192969`

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

The successful runtime lineage is canonical in public `main` through merge `5d0f8c3480ef8ff01887591fb96f552cf2192969`. Current-state documentation must not regress D-500 to OPEN, ACTIVE QUALIFICATION or retired/superseded-without-PASS wording unless later immutable evidence explicitly invalidates the accepted result.

Historical lineage remains immutable:
- Attempt 19 run `37592499491`: failed under CPU-saturated 2-vCPU placement;
- Attempt 20 run `37611659803`: blocked before VM creation by regional total-vCPU quota;
- Attempt 20 execution 2 run `37626451622`: 19/20 provisioned; latent `az vm create` reconciliation defect exposed;
- Attempt 21 run `37634703128`: 99/100 retained acknowledged writes;
- Attempt 22 run `37666768998`: PASS.

D-1000 remains open and independent. D-500 PASS does not imply D-1000, stable mainnet or managed-production acceptance.
