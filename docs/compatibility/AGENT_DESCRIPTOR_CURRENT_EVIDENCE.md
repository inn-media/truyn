# Agent Descriptor: current contract and five-SDK source evidence

**Implementation baseline:** `8cd23898314fd3d96a4796b485935f812a59f2a1` (2026-10-12). The prior sanitation identified a genuine bounded interface-parity gap. The current source adds the implementation and an executable shared suite; qualification must refer to the actual final SHA and successful CI, not this baseline.

**DESCRIPTOR_INTERFACE_PARITY=IMPLEMENTED**

## Contract authority and optional endpoints

An omitted interface endpoint is permitted; an explicitly empty endpoint is invalid in the current reference parser. The five source SDKs preserve this contract. Interface `type` must be a nonempty string. A supplied endpoint must be a nonempty string; null and other types are invalid. The existing nonempty-string profile does not trim whitespace or impose new URL/discovery rules.

The [normative interface entry](../../spec/protocol/v1/agent-descriptor.md#5-interface-entry) permits intentionally undisclosed endpoints. This implementation does not change that specification, TCJ1 signed bytes, identity binding, refresh/re-signing, or immutable released packages.

## Actual five-SDK shared interface matrix

The additional fixture is `sdk/conformance/v1/agent-descriptor-interface-fixtures.json`. The required runner is `sdk/conformance/run-descriptor-interface-parity.mjs`, invoked by the existing five-language release E2E. It serves the same freshly signed case to TypeScript, Python, Go, Java and .NET over loopback HTTP. Each driver invokes its actual SDK fetch/parse/validate/signature/negotiate path, not the reference parser on another language's behalf. The parent checks all five exact result sets, every expected outcome, one actual HTTP fetch per case, signer/identity binding and unchanged selected-interface fields.

| Bounded property | Expected outcome |
|---|---|
| Omitted optional endpoint acceptance | Accept and preserve omission |
| Normal supplied endpoint and optional metadata | Accept; preserve fields |
| Explicit empty, null or numeric endpoint | Reject as invalid interfaces |
| Missing, empty, null or numeric type | Reject as invalid interfaces |
| Non-object interface entry | Reject as invalid interfaces |
| Invalid additional/non-selected interface | Reject the entire Descriptor |
| Whitespace-only endpoint under the existing no-trim profile | Preserve existing acceptance; not a usable-URL certification |
| Tampered signature with otherwise valid present or omitted endpoint | Reject at signature verification |

There are **19 cases per SDK / 95 observed SDK fetch-and-validation outcomes** in a successful invocation. Negative interface documents are correctly signed; separate signature-negative cases alter the signature scalar, retaining its structurally valid curve-point encoding. Thus an unrelated signature/HTTP/expiry error cannot masquerade as malformed-interface rejection.

Native drivers:
- `sdk/typescript/test/descriptor-interface-conformance.ts`
- `sdk/python/tests/descriptor_interface_conformance.py`
- `sdk/go/descriptor_interface_test.go`
- `sdk/java/src/test/java/org/truyn/sdk/DescriptorInterfaceConformance.java`
- `sdk/dotnet/conformance/DescriptorInterfaceConformance.cs`

Go and Java now validate every interface entry. .NET no longer makes an omitted endpoint mandatory and follows the existing nonempty-string/no-trim profile. TypeScript/Python semantics were already consistent and are exercised through their real clients. Serving-time refresh in `runtime/agent-descriptor.js` and its tests are unchanged.

## Preserved baseline runtime cases

The existing `sdk/conformance/v1/agent-descriptor-runtime-fixtures.json` is unchanged and retains exactly these observed cases:

- `descriptor.signature-valid`
- `descriptor.signature-array-valid`
- `descriptor.signature-tampered`
- `descriptor.identity-key-mismatch`
- `descriptor.expired`
- `descriptor.negotiation-valid`
- `descriptor.protocol-no-overlap`
- `descriptor.interface-no-overlap`
- `descriptor.invalid-json`

The nine-case historical inventory and its bidirectional documentation regression remain distinct from the new 19-case interface fixture. The earlier sanitation test exercises the **reference parser only**; it is retained as a contract check, not substituted for the five actual SDK drivers.

## Exact-source qualification and release boundary

Run `node sdk/conformance/run-five-language-e2e.mjs` with all five toolchains installed. The mandatory child runner prints `DESCRIPTOR_INTERFACE_PARITY_REPORT=` JSON with actual source SHA, worktree cleanliness, fixture/document digests, per-language results and observed HTTP counts. Any absent SDK, skipped/missing case, unexpected outcome, unrelated negative error or wrong selection fails the command. `TRUYN_DESCRIPTOR_PARITY_REPORT` optionally stores the same JSON in a new file outside the checkout. Repository-contained destinations, symlink-parent escapes and existing files (including hard-link aliases) are rejected; the writer cannot mutate source after the cleanliness snapshot.

A dirty-worktree application run is diagnostic evidence only. Acceptance requires clean final-head full CI, DCO/security/CodeQL and independent merged-main qualification. Use the actual pull request and run records; do not infer acceptance from a checkbox, historical S103 merge or an older SHA. The earlier Java diagnostic run rejected a deliberately malformed signature point with a JDK-specific message; the scalar-tamper fixture preserves cryptographic rejection and all strict interface checks while removing that test-path ambiguity.

This closes only the bounded source interface matrix when qualified. It does not certify arbitrary Descriptor lifecycle, delegated signing, production/Mainnet or Stable TRUYN/1. Existing published Alpha bytes and private dependency pins are unchanged and require new versioned publication/consumer admission to obtain any source repair. Issue #615's broader S104-S200 and G1-G34 reconciliation remains independent.

## Review corrections and typed projections

The nineteenth shared case explicitly selects a whitespace-only extension type when the caller advertises that exact supported type. This preserves the existing nonempty-string/no-trim profile; Java and .NET selection and Java DTO mapping now use the validated raw values. The actual Java/.NET drivers additionally verify their returned typed interface fields. In .NET the existing CLR `Url` property is nullable and explicitly mapped to optional wire `endpoint`; supplied values round-trip, omission stays omitted, and existing CLR constructor/property names remain available. These checks do not redefine valid endpoint URLs or broaden release admission.
