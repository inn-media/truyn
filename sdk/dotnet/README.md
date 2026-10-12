# TRUYN C#/.NET SDK

**Status:** implemented Developer Release client; Wire Freeze `Truyn.Sdk 0.1.0-alpha.2` is publicly published and independently accepted with immutable artifacts. Stable SemVer 1.0.0 is not published.

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

Package build success alone is not publication. The separate immutable Wire Freeze NuGet alpha.2 release and independent verification ARE accepted: [registry ledger](../../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md). Historical alpha.1 remains immutable.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.


## Public NuGet prerelease

**Accepted public NuGet prerelease:** `Truyn.Sdk 0.1.0-alpha.2`, independently verified on NuGet.org.

```bash
dotnet add package Truyn.Sdk --version 0.1.0-alpha.1
```

Release evidence: `../release/evidence/nuget-alpha1-2026-09-23.json`.

The accepted 2026-10-11 five-SDK prerelease family is independently qualified 6/6, not Stable 1.0.0: [canonical registry closure](../../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md).
