# Agent Descriptor: current contract and source evidence

**Reviewed source:** `53b49b8113196b1538af3e6f335c4ebf6ada456d` (2026-10-12). This is source/documentation reconciliation, not protocol release admission.

**DESCRIPTOR_INTERFACE_NEGATIVE_PARITY=UNVERIFIED**

## Contract authority and optional endpoints

An omitted interface endpoint is permitted; an explicitly empty endpoint is invalid in the current reference parser. Cross-language malformed-interface parity is not yet established.

The [normative interface entry](../../spec/protocol/v1/agent-descriptor.md#5-interface-entry) describes an endpoint or endpoint reference when intentionally discoverable; it does not make every endpoint mandatory. The existing `sdk/conformance/reference/agent-descriptor.js` accepts an omitted `endpoint` and rejects a present empty-string endpoint. It requires a nonempty interface type. An endpoint-less Descriptor is not, by itself, malformed or a failed S103 case. This sanitation does not change schemas, SDK validators, signing or discovery semantics. Whitespace-only values must be reconciled with the exact contract rather than silently assigning new trimming rules.

## Supported implementation and unproven parity

The serving helper in `runtime/agent-descriptor.js` implements bounded refresh/re-signing; `tests/agent-descriptor-refresh.test.js` covers that contract. The five-language E2E supplies a valid signed Descriptor. Neither fact proves exhaustive malformed-interface handling across every SDK.

The current shared `sdk/conformance/v1/agent-descriptor-runtime-fixtures.json` contains these observed cases:

- `descriptor.signature-valid`
- `descriptor.signature-array-valid`
- `descriptor.signature-tampered`
- `descriptor.identity-key-mismatch`
- `descriptor.expired`
- `descriptor.negotiation-valid`
- `descriptor.protocol-no-overlap`
- `descriptor.interface-no-overlap`
- `descriptor.invalid-json`

It does not contain explicit optional-endpoint-positive, empty-endpoint-negative or missing/empty-type-negative parity cases. Current Go/Java validators do not establish the full reference-equivalent invalid-interface rejection; the absence of a mandatory-endpoint check is not itself a bug. The new documentation regression exercises the unchanged **reference parser only**, not all five SDK implementations or cryptographic verification of mutated fixtures.

## Historical versus current authority

S103 PR #823 was merged historically. Its old control wording about missing-endpoint rejection is not a normative override or proof that intended fixtures survive later main changes. Issue #615 requires source/contract reconciliation; preserve accepted history but do not infer current parity or S104-S200 completion from that merge. The initial sanitation and first correction overstated missing-endpoint rejection. This record supersedes those assertions without discarding their audit history.

## Remaining closure criteria

A separate implementation/qualification change must prove **omitted optional endpoint acceptance**, **explicit empty endpoint rejection**, and **missing/empty interface type rejection** consistently across the five required SDKs under the existing profile. Add explicit positive and negative shared cases, invoke each actual language validator, and qualify one exact source plus merged main. Any proposal to require previously optional endpoint information must first revise/version the normative contract and compatibility policy; it is not part of sanitation.

Published immutable packages do not inherit a source repair without a new release. Refresh, valid-profile conformance, optional/invalid-interface parity and full production/delegated-signing lifecycle are separate scopes. This repair admits neither Stable v1 nor private rollout/Mainnet.
