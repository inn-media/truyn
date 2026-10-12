# Agent Descriptor: current source evidence

**Reviewed source:** `af530daa8f1cd1dc7c467089aef2c6442e90138a` (2026-10-12). This is a bounded source reconciliation, not release admission.

**DESCRIPTOR_INTERFACE_NEGATIVE_PARITY=UNVERIFIED**

## Supported and unsupported claims

The serving helper in `runtime/agent-descriptor.js` implements bounded refresh/re-signing; `tests/agent-descriptor-refresh.test.js` covers that contract. The five-language E2E supplies a valid signed Descriptor. Neither fact proves rejection of missing/blank interface endpoints or blank interface types across every SDK.

The current `sdk/conformance/v1/agent-descriptor-runtime-fixtures.json` contains exactly these observed cases:

- `descriptor.signature-valid`
- `descriptor.signature-array-valid`
- `descriptor.signature-tampered`
- `descriptor.identity-key-mismatch`
- `descriptor.expired`
- `descriptor.negotiation-valid`
- `descriptor.protocol-no-overlap`
- `descriptor.interface-no-overlap`
- `descriptor.invalid-json`

No current fixture case supplies the missing/blank endpoint or blank-type negatives claimed in the initial sanitation. `sdk/go/descriptor.go` checks that the interfaces array is present/nonempty but not that each interface has a usable endpoint. `sdk/java/src/main/java/org/truyn/sdk/AgentDescriptors.java` likewise does not establish the full claimed interface rejection. This is a concrete current-source parity gap, not an assertion that all Descriptor implementation is missing.

## Historical versus current authority

S103 PR #823 was merged historically. A merged PR or an old green run does not prove that its intended source/fixtures survive later main changes. Issue #615 remains reconciliation-required; do not mark later sprints complete or infer current negative parity from the historical merge. The prior initial sanitation claim is explicitly corrected by this record, not silently treated as accepted evidence.

## Closure requirement

A separate implementation/qualification change must add explicit missing-endpoint, blank-endpoint and blank-type negative fixtures, reject them consistently in all five language validators/runners, execute the common cases on one exact source, and requalify after merge. Document any existing released-binary limitation separately; existing immutable registry packages cannot inherit a source repair without a new version. Refresh, valid-profile conformance, malformed-interface parity and full production/delegated-signing lifecycle remain distinct scopes. This documentation repair neither changes runtime nor admits Stable v1, private rollout or Mainnet.
