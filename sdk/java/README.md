# TRUYN Java SDK

**Status:** implemented first-party relay client; accepted immutable Wire Freeze public prerelease `org.truyn:truyn-sdk:0.1.0-alpha.2` on Maven Central. Pre-stable, not Stable TRUYN/1.

The Java SDK is one of the five required first-party Developer Release clients. It implements the bounded common contract rather than a DTO/skeleton-only surface:

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
org.truyn:truyn-sdk:0.1.0-alpha.2
```

This package line is pre-stable. The bounded SDK API-v1 surface follows the accepted TRUYN/1, first-class REST/API, and interoperability contracts, while final Open 1.0 release status remains governed by its own exact-head qualification gates. Provider authorization, visibility and billing remain server/runtime policy, never client-supplied authority.

Run the Java source/fixture conformance gate:

```bash
node sdk/conformance/run-conformance.mjs --language=java --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI also compiles the Java SDK and builds/verifies Maven binary/source/Javadoc/POM artifacts with exact source SHA, byte size and SHA-256 provenance.

Package build success alone is not publication. The current Maven Central prerelease has separate accepted registry proof in [the Wire Freeze release ledger](../../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md); stable release and consumer rollout remain separate gates.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
