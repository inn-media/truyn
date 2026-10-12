# TRUYN C#/.NET SDK

**Status:** implemented first-party relay client; accepted immutable Wire Freeze public prerelease `Truyn.Sdk 0.1.0-alpha.2` on NuGet.org. Pre-stable, not Stable TRUYN/1.

The .NET SDK is one of the five required first-party Developer Release clients. It implements the bounded common contract rather than a skeleton-only surface:

- Ed25519 identity and signed TRUYN envelopes;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER` / `NEED` / verified provider event / correlated `RESULT`;
- requester-owned direct NEED cancellation through canonical signed `REVOKE` semantics;
- stable API-v1 object/artifact reference shapes;
- Agent Descriptor HTTP retrieval, schema/version/expiry validation, identity-key signature verification and protocol/interface negotiation;
- normalized fail-closed errors.

Current alpha coordinate:

```text
Truyn.Sdk 0.1.0-alpha.2
```

This package line is pre-stable. The bounded SDK API-v1 surface follows the accepted TRUYN/1, first-class REST/API, and interoperability contracts, while protocol/profile stability and final Open 1.0 release status remain governed by their own exact-head qualification gates. Provider authorization, visibility and billing remain server/runtime policy, never client-supplied authority.

Run the .NET source/fixture conformance gate:

```bash
node sdk/conformance/run-conformance.mjs --language=dotnet --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI also compiles the .NET SDK and builds/verifies the NuGet package with exact source SHA, byte size and SHA-256 provenance.

Package build success alone is not publication. The current NuGet.org prerelease has separate accepted registry proof in [the Wire Freeze release ledger](../../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md); stable release and consumer rollout remain separate gates.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.


## Public NuGet prerelease

**Current public NuGet prerelease:** `Truyn.Sdk 0.1.0-alpha.2`; see the Wire Freeze release ledger above.

```bash
dotnet add package Truyn.Sdk --version 0.1.0-alpha.2
```

Historical alpha.1 publication and its exact source/digest are preserved in `../release/evidence/nuget-alpha1-2026-09-23.json`; they are not evidence for alpha.2 bytes.
