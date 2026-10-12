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
| P1 | Stable message vocabulary is not frozen as v1 | `core.md` still says `draft normative skeleton`; the index says the protocol remains draft | Freeze the bounded top-level vocabulary and prove spec/schema/runtime agreement |
| P2 | Envelope required-field validation is not yet a stable-v1 contract | Core lists required concepts; wire schema exists, but stable required/invalid behavior is not declared | Define required/optional field validity and executable malformed-envelope negatives |
| P3 | Canonical signed representation/domain is not fully normative at protocol level | Core requires a signature over a canonical representation; executable canonical signing exists elsewhere, but the stable protocol contract does not yet bind exact bytes/domain | Specify exact canonical bytes/domain and cross-runtime vectors |
| P4 | Node-ID derivation needs stable normative binding | Identity is cryptographic, but stable cross-runtime derivation must be explicitly frozen | Bind accepted public-key form to one deterministic Node ID derivation and vectors |
| P5 | Replay/expiry/nonce acceptance needs one stable deterministic contract | Security requires replay/expiry checks; current protocol remains draft | Freeze acceptance/rejection rules and add positive/negative vectors |
| P6 | OFFER owner/visibility/withdrawal freeze | Bounded RC `offer.md` and shared `lifecycle.md` define withdrawal and authority; targeted runtime negatives exist | OPEN: exact-head full conformance, policy/legacy negatives and post-merge proof |
| P7 | NEED correlation and admission replay freeze | RC `need.md` and `lifecycle.md` define cross-transport logical ID; relay in-memory idempotency guard added as bounded candidate | OPEN: exact-head five-SDK and restart/replica/durable ledger negatives |
| P8 | RESULT/PARTIAL terminal/ordering freeze | RC `result.md`, `partial.md` and shared `lifecycle.md` specify single-terminal and late-output rejection | OPEN: exact-head negatives, five-SDK and durable terminal qualification |
| P9 | REVOKE issuer/target and late-output freeze | RC `revoke.md` and `lifecycle.md` define direct cancellation and OFFER withdrawal, with targeted regressions | OPEN: exact-head authority and terminal regression qualification |
| P10 | Stable normalized protocol error registry is not declared | Existing adapters/runtime have failure behavior, but no single stable-v1 public error registry is accepted | Define deterministic public error codes and mappings for required failures |
| P11 | **RC compatibility matrix defined; stable-v1 release gate OPEN** | Normative `core.md`, executable `core/protocol/negotiation.js`, negative fixtures, registration/signed-session/client rejection tests, and frozen [P11 decision matrix](../../spec/compatibility/P11_VERSION_NEGOTIATION_MATRIX.md) with machine-tested exact outcomes | Qualify matrix on exact PR head and post-merge main; independently prove real version-scoped semantics and mixed-generation/five-SDK interoperability before a stable-v1 claim |
| P12 | **CLOSED for bounded strict verified object/artifact reference profile; overall Stable v1 NOT declared** | Normative `spec/protocol/v1/object.md`, Protobuf `ContentObject`/`Reference` encoding fields, five SDK reference projections, strict runtime verifier, machine vectors and positive/negative signed-RESULT conformance bind digest/size/reference/no-implicit-fetch. First full exact-head qualification: `035e4b815e4815bece1cf2cc5bb9ed387af466b3`, [CI #38153247377](https://github.com/inn-media/truyn/actions/runs/38153247377) PASS; acceptance record: `TRUYN1_P12_OBJECT_ARTIFACT_CERTIFICATION.md`. | Final closure requires this documentation-successor exact-head DCO/security/CI/five-SDK/full-qualification PASS and successful post-merge `main` CI. Do not generalize to distributed OBJECT transport or count CodeQL neutral as PASS. |
| P13 | Migration/deprecation policy is published; bounded local migration evidence implemented; full stable-v1 qualification remains outstanding | Canonical 180-day stable policy plus executable persisted BYOK schema1→schema2, byte-exact rollback, actual version/required-semantic negotiation and fail-closed corruption/identity tests (`migrations/p13-byok-file.js`, `tests/p13-migration-rollback-interoperability.test.js`). Existing published-alpha five-SDK peer matrix is separately accepted in PR #975. | **Documentation subgate: DEFINED.** Bounded offline migration proof requires exact-SHA DCO/CI/CodeQL + post-merge acceptance; close the full P13 release gate only after cross-domain production migration, real stable wire-generation interop/cutover and rollback are independently qualified; stable-v1 is NOT declared |
| P14 | Draft status is still propagated across protocol/SDK/docs | Protocol index, proto README and SDK documentation explicitly state TRUYN/1 is draft/pre-stable | Remove draft/stable claims only after P1–P13 and exact-head conformance are accepted |

## P13 production cutover readiness gate

A ten-domain inventory, exact order of production migration/isolated restore/rollback, and executable non-admitting preflight are now defined in `operations/p13-production-cutover-plan.json`, `scripts/p13-production-readiness.mjs` and `docs/operations/P13_PRODUCTION_CUTOVER_READINESS.md`. This exposes unmet release/source/restore/canary/rollback evidence, never grants traffic cutover, and does not claim stable TRUYN/1. The *full P13 gate remains OPEN* until independent live proof, not a local green simulation.

## P13 executable evidence checkpoint

`migrations/p13-byok-file.js` operates only on an explicitly quiesced local BYOK profile. It uses the production `migrateByokProfile()` and `DurableNetworkState`/`negotiateProtocol()` runtime contracts, but is **not** wired into network startup, managed authority, or any live deployment. Tests verify a real disk checkpoint, atomic replacement, byte-exact rollback, unknown-schema refusal, tamper refusal and cryptographic identity continuity; they do **not** prove a future stable wire-generation migration or live operator cutover. The previously accepted five-SDK published-alpha interoperability is bounded evidence, not stable production compatibility. Full P13 stays OPEN pending a production migration manifest/canary, all state-domain rollbacks, and stable release qualification.

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
