# TRUYN/1 Wire Freeze: Exact-HEAD Qualification Ledger

**Status: bounded public source + SDK interoperability ACCEPTED on PR-head; stable-v1, immutable successor release, private managed admission and Mainnet NOT accepted.**  
**Source:** approved `TRUYN_WIRE_FREEZE_CORE_FINAL(1).md`, `TRUYN_WIRE_FREEZE_EXTENSIONS_FINAL(1).md`.  
**PR:** #975 (successor to cancelled-unmerged #962 and #974).

## Preserved core and baseline

The full 80-row A–I machine-readable registry is `spec/registry/truyn-core-v1.json`; this is the semantic registry, not a new physical envelope codec. Existing five top-level signed JSON kinds, TCJ1 byte domain, QUIC/DHT method names, six compact letters, session `kind:"ACCEPT"`, optional `to`, identity derivation and existing released packages stay unchanged by default. Public and private versions must be digest-pinned only **after** public release.

## Current verified changes, not yet global qualification

- DCO-compliant public successor branch; new contributions carry the author's signed-off-by trailer. Never bypass DCO.
- JS reference freeze: `tests/wire-freeze-registry.test.js`, `tests/wire-freeze-tcj1-negative.test.js`, `tests/wire-freeze-crosslanguage-fixtures.test.js`.
- Shared candidate conformance corpus: `sdk/conformance/v1/tcj1-wire-freeze-vectors.json`.
- Java integer-token parser fix to preserve integers instead of unwanted floating-point representation.
- Python reference canonicalization candidate with UTF-16 key ordering and ECMAScript notation boundaries.
- Go candidate applies TCJ1 Unicode/UTF-16 and ECMAScript numeric serialization. Shared fixtures and five-language conformance PASSED on qualified PR head; exhaustive all-value numerical conformance is not claimed.
- .NET uses an explicit TCJ1 writer with literal non-BMP UTF-8, UTF-16 key order and ECMAScript numeric formatting; shared golden corpus and five-language conformance PASSED on qualified PR head.

## Strict open gates

| Gate | Qualification required | Status |
| --- | --- | --- |
| Registry | Machine-verified complete A–I; unchanged MVP/compact | SOURCE MERGED (public PR #975) |
| JS/TS | Exact signed-byte fixtures and bounded old/new matrix | PR-HEAD PASS |
| Python | Golden byte fixtures and published-alpha old/new relay interop | PR-HEAD PASS |
| Go | Shared byte fixtures and published-alpha old/new relay interop | PR-HEAD PASS |
| Java | Shared byte fixtures and published-alpha old/new relay interop | PR-HEAD PASS |
| .NET | Shared byte fixtures and published-alpha old/new relay interop | PR-HEAD PASS |
| Legacy packages | 5 ecosystems × 4 actual published-alpha/working-source provider/requester combinations | 20/20 PASS on qualified PR head |
| Runtime | Node/Relay/QUIC/HTTP/compact, revocation/authority, replay and idempotency | PARTIAL; dedicated postmerge assurance PR #976 OPEN |
| Sanitation | Cross-repo docs, onboarding, normative index, artifacts, historical preservation | IN PROGRESS in documentation-only successor PR |
| Release | DCO/security/full CI on PR head; immutable successor package publication and exact-main proof separate | PR-HEAD PASS; PUBLIC RELEASE OPEN |
| Private | Immutable released digest pin; staged and independent E2E | NOT QUALIFIED |
| Mainnet | WAN/ops/SLO/external interop/managed independent gates | NOT QUALIFIED |

**Safety gate:** zero forged signatures, unauthorized calls, duplicate exactly-once side effects or history loss. Any FAIL prevents merge/release; do not fix by weakening CI. Never change ongoing D/S/T/E/N/H/A accepted evidence, workloads or production config just to complete this task.

## Verified 2026-10-11 checkpoints (append-only)

- Public [PR #975](https://github.com/inn-media/truyn/pull/975) merged with exact main commit `10fac0de290a303b7e39205fb895adfaa01dc30e`. Qualified PR head: `cb7618170422270628ac96b5fbb53ae307cdc7f3`. Do not substitute head SHA for merge SHA.
- [CI 38144117793](https://github.com/inn-media/truyn/actions/runs/38144117793): DCO, mandatory security, five-language SDK conformance, full qualification and scoped regressions successful on PR head.
- [Released-SDK compatibility 38144117794](https://github.com/inn-media/truyn/actions/runs/38144117794): 20/20 successful real local-relay exchanges, across legacy/candidate provider/requester directions for npm alpha.2, PyPI 0.1.0a1, Go alpha.1, Maven alpha.1 and NuGet alpha.1. This proves bounded NEED/RESULT interoperability, not every negative safety path on every historical release.
- New postmerge verification [PR #976](https://github.com/inn-media/truyn/pull/976) is a separate Node/HTTP Relay/compact security suite rooted in merged main; it does not itself establish independent live QUIC/DHT/replay/side-effect or postmerge exact-main CI evidence.
- No new stable SDK package coordinate, digest-pinned public runtime release, private release pin, A-Series operational acceptance or Mainnet activation follows automatically from these records.

## Controlled next actions

1. Preserve the completed shared TCJ1 and published-alpha 20/20 compatibility matrix; extend negative per-language and historical scenarios only with new exact-SHA evidence.
2. Repair canonical byte mismatches with language-local minimal changes, especially float formatting in Go/Java/.NET, without JS fallback or alternative signature checks.
3. Re-run scoped SDK tests, whole repository CI and security on **one** final SHA. After every change previous SHA qualifications expire.
4. Reconcile all normative docs and private consumer release matrix, then immutable public release and independent private staging; only after accepted authorization and network safety, independently consider Mainnet admission.
