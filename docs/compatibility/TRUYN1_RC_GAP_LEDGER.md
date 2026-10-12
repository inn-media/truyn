# TRUYN/1 Release-Candidate Gap Ledger

**Task:** `truyn-open-1-0-productization-7e4c91`  
**Task anchor:** issue #615  
**Classification:** OPEN  
**Baseline:** `main@daca5db7ab1901f02b43495aad69cfd83512ad24`  
**Purpose:** bounded inventory of protocol-v1 stabilization gaps before a truthful TRUYN/1 stable-v1 claim.

This ledger is a checkpoint, not evidence that TRUYN/1 is stable. Items close only when the normative contract, wire/schema behavior, implementation and executable conformance agree on one exact qualified revision.

## Normative protocol-v1 inventory

The current `spec/protocol/v1/` surface referenced by the protocol index comprises:

- `README.md` — protocol index/status and normative vocabulary;
- `core.md` — envelope invariants, payload vocabulary and compatibility rule;
- `identity.md` — cryptographic identity semantics;
- `capability.md` — reusable capability descriptor semantics;
- `offer.md` — provider advertisement semantics;
- `need.md` — requester requirement semantics;
- `object.md` — immutable content-addressed object semantics;
- `claim.md` — signed claim semantics;
- `attest.md` — attestation verdict semantics;
- `state.md` — mutable state identity/version semantics;
- `delta.md` — state/object delta semantics;
- `subscribe.md` — subscription semantics;
- `compute.md` — computation request semantics;
- `result.md` — execution/result semantics;
- `trust-receipt.md` — trust receipt semantics;
- `revoke.md` — revocation semantics;
- `verification.md` — composed challenge/verify/dispute behavior;
- `trustability.md` — contextual trust semantics;
- `provider-policy.md` — provider ownership/visibility/authorization boundary;
- `discovery.md` — discovery semantics;
- `security.md` — protocol security requirements;
- `economics.md` — settlement-neutral cost/payment boundary;
- `agent-descriptor.md` — signed expiry-bound discovery/bootstrap metadata.

The corresponding machine-readable wire surface is rooted at `proto/v1/envelope.proto`; `spec/` remains the normative semantic source.

## Current bounded stabilization gaps

| ID | Gap | Current evidence | Required closure |
|---|---|---|---|
| P1 | **BOUNDED RC PASS; Stable v1 OPEN** | `core.md` bounded `IDENTITY/OFFER/NEED/RESULT/REVOKE` matches runtime `MVP_TYPES`; combined P1-P5 exact-SHA and five-SDK evidence in `TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md` | Do not generalize bounded Open 1.0 vocabulary to the full future stable-v1 protocol |
| P2 | **BOUNDED RC PASS; Stable v1 OPEN** | `envelope.md`, shared positive/negative fixtures and runtime reject invalid/missing fields, malformed RFC3339 time, invalid JSON/Unicode and unsafe optional fields | Retain fail-closed validation in all supported transports and future versioned profiles |
| P3 | **BOUNDED RC PASS; Stable v1 OPEN** | `envelope.md` specifies Ed25519/TCJ1 exact signed bytes, 64-byte Base64 signature, signed optional fields; five SDKs and shared cross-language fixtures qualify the bounded contract | Preserve existing signed-byte domain and require explicit negotiation for future changes |
| P4 | **BOUNDED RC PASS; Stable v1 OPEN** | `identity.md` defines `truyn:node:` + SHA256(Ed25519 SPKI DER); runtime and negatives reject wrong algorithms, invalid keys and sender/key mismatch; five SDKs qualified | Identity never implies entitlement, and future recovery/rotation remain separate gates |
| P5 | **BOUNDED REGISTRATION RC PASS; broader durable lifecycle OPEN** | `security.md` and `tests/protocol-v1-registration-freshness.test.js` enforce 5-minute-old / 30-second-future registration bounds, replayed signed registration ID rejection and no session creation; combined five-SDK and full CI passed | This is **not** G5 durable multi-replica exactly-once, production recovery or full P6-P9 lifecycle certification |
| P6 | OFFER owner/visibility/withdrawal freeze | Bounded RC `offer.md` and shared `lifecycle.md` define withdrawal and authority; targeted runtime negatives exist | OPEN: exact-head full conformance, policy/legacy negatives and post-merge proof |
| P7 | NEED correlation and admission replay freeze | RC `need.md` and `lifecycle.md` define cross-transport logical ID; relay in-memory idempotency guard added as bounded candidate | OPEN: exact-head five-SDK and restart/replica/durable ledger negatives |
| P8 | RESULT/PARTIAL terminal/ordering freeze | RC `result.md`, `partial.md` and shared `lifecycle.md` specify single-terminal and late-output rejection | OPEN: exact-head negatives, five-SDK and durable terminal qualification |
| P9 | REVOKE issuer/target and late-output freeze | RC `revoke.md` and `lifecycle.md` define direct cancellation and OFFER withdrawal, with targeted regressions | OPEN: exact-head authority and terminal regression qualification |
| P10 | **CLOSED — bounded TRUYN/1 RC error parity** | [Accepted 2026-10-12](P10_ERROR_PARITY_ACCEPTANCE_2026-10-12.md): all 13 normalized codes, REST/MCP/A2A/NLWeb/WebSocket projections and shared 20-case five-SDK matrix; negative security/interop tests GREEN. | Exact PR [#1046](https://github.com/inn-media/truyn/pull/1046) and merged [main CI #38218804593](https://github.com/inn-media/truyn/actions/runs/38218804593) SUCCESS at `ffb86ec080455797dbdc1ce1c3ff962a1834fa78`. Native surface semantics are preserved. Does **not** certify Stable v1 or close other release gates. |
| P11 | Required-semantic/version negotiation needs stable-v1 executable contract | Core requires a new generation or explicitly negotiated extension for breaking semantics | Freeze overlap/required-semantic negotiation and mismatch negatives |
| P12 | **CLOSED for bounded strict verified object/artifact reference profile; overall Stable v1 NOT declared** | Normative `spec/protocol/v1/object.md`, Protobuf `ContentObject`/`Reference` encoding fields, five SDK reference projections, strict runtime verifier, machine vectors and positive/negative signed-RESULT conformance bind digest/size/reference/no-implicit-fetch. First full exact-head qualification: `035e4b815e4815bece1cf2cc5bb9ed387af466b3`, [CI #38153247377](https://github.com/inn-media/truyn/actions/runs/38153247377) PASS; acceptance record: `TRUYN1_P12_OBJECT_ARTIFACT_CERTIFICATION.md`. | Final closure requires this documentation-successor exact-head DCO/security/CI/five-SDK/full-qualification PASS and successful post-merge `main` CI. Do not generalize to distributed OBJECT transport or count CodeQL neutral as PASS. |
| P13 | Migration/deprecation policy is published; **split: P13-FORMAT (public compatibility) / P13-OPS (production migration)** | **FORMAT:** 180-day stable deprecation policy and bounded BYOK local rollback/negotiation plus published-alpha SDK evidence exist; stable five-SDK/wire exact-head certification is not yet complete. **OPS:** ten-domain inventory and read-only fail-closed cutover preflight exist; live source/PITR/canary/rollback remain unverified. | **Documentation subgate: DEFINED.** Stable format qualification remains outstanding. Track two independent gates: [P13-FORMAT](P13_FORMAT_COMPATIBILITY.md) **PRE-STABLE**, [P13-OPS](../operations/P13_PRODUCTION_CUTOVER_READINESS.md) **BLOCKED**. Format closure does not require production execution, but the Stable TRUYN/1 **protocol-only** P13 release gate only after P13-FORMAT and all applicable protocol/SDK/security checks pass. Production operations are independently required for Stable Service/Mainnet. Operations requires its own live evidence and never inherits format PASS. |
| P14 | Draft status is still propagated across protocol/SDK/docs | Protocol index, proto README and SDK documentation explicitly state TRUYN/1 is draft/pre-stable | Remove draft/stable claims only after P1–P13 and exact-head conformance are accepted |

## Joint P1–P5 bounded RC acceptance (12 October 2026)

This is final **joint certification of the existing bounded RC profile**, not a new wire freeze and not Stable TRUYN/1. All five original normative contracts and executable suites were exercised together on the same PR head and independently on merged `main`. The canonical immutable evidence summary is [`TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md`](TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md). The historical wording in earlier checkpoints is superseded for the **bounded** P1–P5 RC scope only. Overall ledger classification stays `OPEN`; P6–P14, full G5 durable exactly-once, Stable v1 and Mainnet are not admitted.

## P13 production cutover readiness gate

A ten-domain inventory, exact order of production migration/isolated restore/rollback, and executable non-admitting preflight are now defined in `operations/p13-production-cutover-plan.json`, `scripts/p13-production-readiness.mjs` and `docs/operations/P13_PRODUCTION_CUTOVER_READINESS.md`. This exposes unmet release/source/restore/canary/rollback evidence, never grants traffic cutover, and does not claim stable TRUYN/1. The *P13-OPS production gate remains BLOCKED* until independent live proof, not a local green simulation. P13-FORMAT protocol release qualification remains OPEN on its own separate evidence.

## P13 executable evidence checkpoint

`migrations/p13-byok-file.js` operates only on an explicitly quiesced local BYOK profile. It uses the production `migrateByokProfile()` and `DurableNetworkState`/`negotiateProtocol()` runtime contracts, but is **not** wired into network startup, managed authority, or any live deployment. Tests verify a real disk checkpoint, atomic replacement, byte-exact rollback, unknown-schema refusal, tamper refusal and cryptographic identity continuity; they do **not** prove a future stable wire-generation migration or live operator cutover. The previously accepted five-SDK published-alpha interoperability is bounded evidence, not stable production compatibility. P13-OPS stays BLOCKED pending a production migration manifest/canary and all applicable state-domain rollbacks; P13-FORMAT independently remains OPEN pending protocol release qualification.

## P13 reconciliation checkpoint

The previously stated P13 *missing policy document* gap is resolved: the normative release-candidate policy is published in `spec/protocol/v1/migration.md`, with a uniform **180 calendar days** minimum for stable deprecations and matching SDK guidance. **P13 overall remains release-qualification pending**, not `PASS`: documentation consistency tests prove only the policy text, not real persisted-state migration, rollback, version interoperation or stable-v1 admission. `TRUYN/1` remains draft, and the other P1–P12/P14 gates are unchanged. Historical baseline in this ledger is retained for traceability.

## Explicit non-gaps for this gate

The following work is not pulled into protocol-RC merely because it is related:

- D-200, D-500 and D-1000 execution/repair;
- private managed control-plane/reputation/billing/telemetry implementation;
- REST/API product surface work beyond the protocol primitives it consumes;
- A2A/MCP stable declaration before protocol-v1 qualification;
- NLWeb implementation;
- desktop/mobile packaging.

## Closure discipline

- Every mutation is based on current public `main`; concurrent accepted work is preserved.
- Public protocol work never depends on `inn-media/truyn-platform`.
- A repair commit invalidates prior exact-head qualification.
- Stable-v1 status may change only after protocol vectors, five-SDK conformance, DCO, CI and CodeQL/security qualify the same exact head and post-merge checks qualify the merged `main`.
- No draft marker is removed merely to make documentation look complete.

## 2026-10-11 bounded G5 implementation checkpoint (not acceptance)

The unified RC direct-work state machine is in `spec/protocol/v1/lifecycle.md`. The reference relay rejects duplicate direct NEED IDs across legacy/compact transport, including after terminal detail pruning and requester reconnect; rejects at bounded guard capacity without dispatch; blocks revoked OFFER replay; and preserves implicit REVOKE ambiguity. Six executable negatives are in `tests/lifecycle-freeze-g5-replay.test.js`. **P6–P9 and G5 remain OPEN** for durable cross-restart/multi-replica/side-effect qualification and exact-head/post-merge evidence. The separately accepted P12 and P13 records above remain unchanged.

## P13 separated gate reconciliation (2026-10-12)

- **P13-FORMAT (PRE-STABLE):** Canonical public compatibility and 180-calendar-day deprecation policy in `spec/protocol/v1/migration.md`; bounded on-disk schema/rollback and published-alpha peer evidence; separate machine inventory `spec/compatibility/p13-format-compatibility-plan.json`; safe report `node scripts/p13-format-readiness.mjs`. Required stable release-generation/five-SDK/exact-SHA post-merge evidence remains open. This gate is independent of production authority and live cloud resources.
- **P13-OPS (BLOCKED):** Private real source inventory, ten durable domains, backup/PITR restore, independent versioned migration, canary and verified rollback. Inventory `operations/p13-production-cutover-plan.json`; safe report `node scripts/p13-production-readiness.mjs`. Production cutover cannot be inferred from a local proof or from a FORMAT PASS.
- **Cross-lane invariant:** Neither report can authorize the other gate. Overall stable-release declaration remains **OPEN** until all applicable protocol/SDK/security gates are independently qualified. Earlier P13 sections remain historical bounded checkpoints, not contradictory PASS declarations.

## Protocol vs production release admission (2026-10-12)

The previous combined “Stable/mainnet” shorthand has been split into explicit targets in `spec/compatibility/stable-release-scopes.json` and `ROADMAP.md`. **Stable TRUYN/1 Protocol requires qualified P13-FORMAT, not P13-OPS production migration.** Stable TRUYN Service and Mainnet continue to require independent P13-OPS/live recovery and reliability evidence. Nothing in this boundary change sets P13-FORMAT to PASS or changes the remaining P1–P14 prerequisites. Historic combined P13 wording above is superseded only on release **scope**, not on required negative testing or operational acceptance.
