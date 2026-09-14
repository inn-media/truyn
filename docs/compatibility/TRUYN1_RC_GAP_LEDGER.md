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
| P6 | `OFFER` is explicitly still a draft target | `offer.md` states the current MVP does not yet enforce the full provider-policy model | Freeze bounded OFFER fields/semantics and prove provider-policy consistency |
| P7 | `NEED` remains a draft normative skeleton | `need.md` is explicitly draft | Freeze request/correlation/constraint/ownership semantics and vectors |
| P8 | `RESULT` / partial-result lifecycle needs stable terminal semantics | Result/lifecycle behavior exists in implementation/evidence, but stable-v1 contract is not declared | Freeze RESULT correlation/terminal rules and bounded PARTIAL ordering/idempotency behavior |
| P9 | `REVOKE` remains a draft normative skeleton | `revoke.md` is explicitly draft | Freeze requester-owned cancellation/revocation targets and late-output suppression |
| P10 | Stable normalized protocol error registry is not declared | Existing adapters/runtime have failure behavior, but no single stable-v1 public error registry is accepted | Define deterministic public error codes and mappings for required failures |
| P11 | Required-semantic/version negotiation needs stable-v1 executable contract | Core requires a new generation or explicitly negotiated extension for breaking semantics | Freeze overlap/required-semantic negotiation and mismatch negatives |
| P12 | Artifact/object reference integrity needs stable-v1 closure | Content-addressed objects/references exist, but final stable integrity/no-implicit-fetch rules must be bound to conformance | Freeze digest/size/reference rules and integrity negatives |
| P13 | Migration/deprecation behavior is not yet stable-v1 release policy | Protocol generation rules exist conceptually; current docs remain draft | Publish explicit pre-v1→v1, deprecation and breaking-change policy |
| P14 | Draft status is still propagated across protocol/SDK/docs | Protocol index, proto README and SDK documentation explicitly state TRUYN/1 is draft/pre-stable | Remove draft/stable claims only after P1–P13 and exact-head conformance are accepted |

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
