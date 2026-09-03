# TRUYN Go SDK

**Status:** implemented Developer Release relay client; source/build complete, pre-stable, and awaiting observed public module/tag release evidence.

The Go SDK is one of the five required first-party Developer Release clients. It implements the bounded common contract:

- Ed25519 identity and signed TRUYN envelopes;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER` / `NEED` / verified provider event / correlated `RESULT`;
- requester-owned direct NEED cancellation;
- stable API-v1 object/artifact reference shapes;
- Agent Descriptor HTTP retrieval, schema/version/expiry validation, identity-key signature verification and protocol/interface negotiation;
- normalized fail-closed errors.

Target pre-release module/tag:

```text
github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1
```

After the tag is publicly released, consumers can install with:

```bash
go get github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1
```

`TRUYN/1` remains draft and this package line is pre-stable.

Run the Go source/fixture conformance gate:

```bash
node sdk/conformance/run-conformance.mjs --language=go --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI compiles the Go SDK and builds/verifies the Go module source bundle with exact source SHA, byte size and SHA-256 provenance.

Build/provenance is not public module availability. Public tag/module resolution remains an external release/evidence gate.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
