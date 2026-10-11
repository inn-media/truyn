# TRUYN/1 Wire Freeze: Exact-HEAD Qualification Ledger

**Status: IN PROGRESS. No stable-v1 or Mainnet admission.**  
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
- Go candidate removes HTML/U+2028/U+2029 escape differences. **Go float notation and negative zero, integer narrowing and test vectors still need independent results.**
- .NET: `sdk/dotnet/Crypto.cs` uses System.Text.Json and ordinal key sorting, but ECMAScript numeric edges and released-client interop are **UNVERIFIED**.

## Strict open gates

| Gate | Qualification required | Status |
| --- | --- | --- |
| Registry | Machine-verified complete A–I; unchanged MVP/compact | CANDIDATE |
| JS/TS | Exact positive/negative signed bytes, nested Unicode, old/new | PARTIAL |
| Python | Golden vector suite + SDK signed-envelope interop | NOT QUALIFIED |
| Go | Exact ECMAScript floats/negative zero, UTF-16 sorting, signatures | NOT QUALIFIED |
| Java | Integer, nontrivial float serialization, Unicode, Ed25519 | NOT QUALIFIED |
| .NET | Actual SDK execution against byte fixture including U+2028 and floats | NOT QUALIFIED |
| Legacy packages | Four matrix combinations at frozen package versions | NOT QUALIFIED |
| Runtime | Node/Relay/QUIC/HTTP/compact, revocation/authority, replay and idempotency | NOT QUALIFIED |
| Sanitation | Cross-repo docs, onboarding, normative index, artifacts, historical preservation | PARTIAL |
| Release | DCO, security, full CI, exact merge SHA, signed public release | NOT QUALIFIED |
| Private | Immutable released digest pin; staged and independent E2E | NOT QUALIFIED |
| Mainnet | WAN/ops/SLO/external interop/managed independent gates | NOT QUALIFIED |

**Safety gate:** zero forged signatures, unauthorized calls, duplicate exactly-once side effects or history loss. Any FAIL prevents merge/release; do not fix by weakening CI. Never change ongoing D/S/T/E/N/H/A accepted evidence, workloads or production config just to complete this task.

## Controlled next actions

1. Wire the golden-vector file into each language's native SDK test runner. Separate conformance of signing vs wrapper clients; test old released packages and the four sender/receiver combinations.
2. Repair canonical byte mismatches with language-local minimal changes, especially float formatting in Go/Java/.NET, without JS fallback or alternative signature checks.
3. Re-run scoped SDK tests, whole repository CI and security on **one** final SHA. After every change previous SHA qualifications expire.
4. Reconcile all normative docs and private consumer release matrix, then immutable public release and independent private staging; only after accepted authorization and network safety, independently consider Mainnet admission.
