# TRUYN/1 P1–P5 Joint Release-Candidate Certification

**Date:** 2026-10-12  
**Decision:** **PASS — bounded Open 1.0 P1–P5 RC only**  
**Change classification:** existing-contract conformance hardening and evidence; **NO NEW WIRE FREEZE**  
**Public repository:** `inn-media/truyn`  
**Source PR:** [#1045](https://github.com/inn-media/truyn/pull/1045) (merged)  
**Accepted exact PR source head:** `22ce4db61ad855513f96f48044378ce5330b5eef`  
**Independently checked post-merge main:** `021db2329b108a941cb5a60f44d0bcb06e1b0152`

## Immutable machine-verifiable evidence

- Exact PR-head [CI #38217496151](https://github.com/inn-media/truyn/actions/runs/38217496151): **success**, DCO, mandatory-security-safety, regression, component, integration, network, sdk-release, full-qualification and aggregate `test` each PASS.
- Exact PR-head [CodeQL #38217490793](https://github.com/inn-media/truyn/actions/runs/38217490793): **7/7 success** for Actions, C#, Go, Java/Kotlin, JavaScript/TypeScript, Python and Rust; neutral/skipped is not PASS.
- Independent merged-`main` [CI #38217991549](https://github.com/inn-media/truyn/actions/runs/38217991549): **success**. Mandatory-security-safety, regression, component, integration, network, sdk-release, full-qualification and aggregate `test` PASS on exact merged SHA.
- Executable combined P1–P5 suite is invoked from `sdk/conformance/run-five-language-e2e.mjs` and precedes the same five-language TypeScript, Python, Go, Java and .NET conformance. This avoids treating five isolated successful tests as a joint RC verdict.
- Reusable vectors: `sdk/conformance/v1/protocol-envelope-{golden,negative}-fixtures.json`; `sdk/conformance/v1/tcj1-wire-freeze-vectors.json`; tests `tests/protocol-v1-rc.test.js`, `tests/protocol-v1-registration-freshness.test.js`, `tests/wire-freeze-tcj1-negative.test.js` and `tests/wire-freeze-crosslanguage-fixtures.test.js`.

## Joint gate matrix

| Gate | Normative source | Executable evidence / decision |
|---|---|---|
| **P1 — CORE** | `spec/protocol/v1/core.md` | **PASS**: bounded five message kinds exactly match `MVP_TYPES`: `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE`. A–I semantic registry and compact `PARTIAL` do not add signed top-level JSON kinds. |
| **P2 — Envelope** | `spec/protocol/v1/envelope.md` | **PASS**: required/optional fields, object payload, RFC3339 date, invalid/empty values, malformed signed input, and zero upstream dispatch on failed verification remain fail-closed. |
| **P3 — signing domain** | `spec/protocol/v1/envelope.md` | **PASS**: Ed25519 over exactly TCJ1 UTF-8 bytes of unsigned envelope, no added prefix, optional fields remain signed, Base64 signature decodes canonically to 64 bytes; negative crypto/Unicode/non-JSON vectors and five-SDK conformance PASS. |
| **P4 — Node ID** | `spec/protocol/v1/identity.md` | **PASS**: `truyn:node:` + lowercase SHA-256 of Ed25519 SPKI DER; sender/key mismatch and non-Ed25519/invalid key fail closed, signed identity independent of transport/owner fields. |
| **P5 — registration freshness/replay** | `spec/protocol/v1/security.md` | **PASS for bounded registration profile**: 5-minute past and 30-second future limits, signed registration ID replay rejection, failure before new session/provider activity; no nonce or authenticated message grants provider ownership/billing authority. |

## Minimal repairs uncovered during joint qualification

The prior normative documents and executable suites already existed. Joint audit discovered that shared runtime still accepted non-RFC3339 nonempty timestamps, silently re-encoded non-finite numbers/undefined as different JSON, derived fingerprint from non-Ed25519 SPKI, and decoded noncanonical signatures. Tests were added to the **existing** P1–P5 suite and the shared verifier was corrected; the signature byte domain for valid messages, top-level kinds, wire generation and existing golden fixtures remain unchanged.

Initial PR-head CI [#38217227725](https://github.com/inn-media/truyn/actions/runs/38217227725) correctly went RED: a legacy QUIC session digest passed `signature: undefined` to shared canonicalization. The repair removes that property before digesting instead, preserving the original serialized bytes. Its subsequent qualified exact head is **not** the failed earlier SHA. Unrelated network/scale validation was not downgraded to hide failure.

## Non-claims / independent gates

- This is the **bounded P1–P5 Open 1.0 RC contract**, not `TRUYN/1 Stable v1`, SDK stable production packaging, a new protocol generation, A2A/MCP stable v1, private platform acceptance, or Mainnet.
- In particular **P5 registration replay proof is not G5 multi-host durable exactly-once**. Distributed restarts, multi-replica provider side effects, durable outbox recovery, finality and P6–P9 lifecycle scopes remain independently gated.
- P6–P14, production cutover, external-operator WAN SLO, billing/entitlement and governance maturity are not inferred from these green tests.
- Historical baseline/negative evidence remains append-only. Do not delete failed CI or report it as PASS.
- Any future source change in signed-envelope/identity/replay or shared conformance reopens exact-SHA qualification on the changed source. Existing normative contract must not be silently rewritten.

**Result:** existing P1–P5 protocols jointly certified for the bounded RC scope; overall `TRUYN/1 Stable v1` remains **NOT DECLARED**.
