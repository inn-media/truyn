# TRUYN Go SDK

**Status:** implemented Developer Release relay client; source/build complete, pre-stable, and accepted as immutable public Go module prerelease `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` with accepted public tag/module evidence.

The Go SDK is one of the five required first-party Developer Release clients. It implements the bounded common contract:

- Ed25519 identity and signed TRUYN envelopes;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER` / `NEED` / verified provider event / correlated `RESULT`;
- requester-owned direct NEED cancellation through canonical signed `REVOKE` semantics;
- stable API-v1 object/artifact reference shapes;
- Agent Descriptor HTTP retrieval, schema/version/expiry validation, identity-key signature verification and protocol/interface negotiation;
- normalized fail-closed errors.

Accepted pre-release module/tag:

```text
github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1
```

Consumers can install with:

```bash
go get github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1
```

This is a pre-stable `0.x` SDK. The bounded SDK API-v1 surface follows the accepted TRUYN/1, first-class REST/API, and interoperability contracts, while protocol/profile stability and final Open 1.0 release status remain governed by their own exact-head qualification gates. Provider authorization, visibility and billing remain server/runtime policy, never client-supplied authority.

Run the Go source/fixture conformance gate:

```bash
node sdk/conformance/run-conformance.mjs --language=go --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI compiles the Go SDK and builds/verifies the Go module source bundle with exact source SHA, byte size and SHA-256 provenance. Public module/tag resolution for this alpha is already accepted; stable release status remains separate.

See `../README.md`, `../conformance/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
