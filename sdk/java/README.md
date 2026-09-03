# TRUYN Java SDK

**Status:** implemented Developer Release relay client; source/build complete, pre-stable, and not yet claimed as a publicly published Maven Central release.

The Java SDK is one of the five required first-party Developer Release clients. It implements the bounded common contract rather than a DTO/skeleton-only surface:

- Ed25519 identity and signed TRUYN envelopes;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER` / `NEED` / verified provider event / correlated `RESULT`;
- requester-owned direct NEED cancellation;
- stable API-v1 object/artifact reference shapes;
- Agent Descriptor HTTP retrieval, schema/version/expiry validation, identity-key signature verification and protocol/interface negotiation;
- normalized fail-closed errors.

Current alpha coordinate:

```text
org.truyn:truyn-sdk:0.1.0-alpha.1
```

`TRUYN/1` remains draft and this package line is pre-stable.

Run the Java source/fixture conformance gate:

```bash
node sdk/conformance/run-conformance.mjs --language=java --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI also compiles the Java SDK and builds/verifies Maven binary/source/Javadoc/POM artifacts with exact source SHA, byte size and SHA-256 provenance.

Package build success is not public registry publication. Maven Central publication remains an external release/evidence gate and must not be inferred from this README.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
