# Documentation Sanitation — 2026-10-07

**Scope:** public `inn-media/truyn` current-state documentation after native GUI client qualification and post-merge hardening.

**Baseline main:** `23a6b902310c9096b65af49f48307d7173cd03e9`

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
