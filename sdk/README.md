# TRUYN SDKs

Native first-party client libraries for applications integrating directly with TRUYN.

**Current maturity:** five required relay clients implemented + shared executable conformance. npm, PyPI and Go have accepted immutable public prereleases; Maven Central and NuGet remain open.  
**Documentation audit:** 2026-09-23  
**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1`

## Required first-party SDKs

| Language | Directory | Distribution | Current state |
|---|---|---|---|
| JavaScript / TypeScript | `typescript/` | accepted npm `@truyn/sdk@0.1.0-alpha.2`; current source candidate `0.1.0-alpha.4` | implemented + conformance; alpha.4 is not an accepted registry release yet |
| Python | `python/` | PyPI `truyn-sdk==0.1.0a1` | implemented + accepted immutable public prerelease |
| Go | `go/` | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | implemented + accepted immutable public prerelease |
| Java | `java/` | Maven `org.truyn:truyn-sdk:0.1.0-alpha.1` | implemented; Maven Central publication open |
| C# / .NET | `dotnet/` | NuGet `Truyn.Sdk 0.1.0-alpha.1` | implemented; NuGet.org publication open |
| Rust | `rust/` | optional | secondary track |

npm alpha.1 remains immutable historical evidence and is superseded by alpha.2 after the clean-room Node 22 ESM import defect. `sdk/npm/v0.1.0-alpha.3` is preserved as immutable bootstrap/release-process evidence; it is not treated as an accepted public registry release. Current TypeScript source is `0.1.0-alpha.4` and remains a release candidate until exact-main trusted publication plus independent registry verification succeeds. Accepted coordinates are never overwritten.

## Common contract

All five required SDKs implement bounded relay semantics:

- local Ed25519 identity;
- signed TRUYN envelopes / received-event verification;
- relay registration/authenticated session use;
- authorization-aware discovery;
- OFFER / NEED / RESULT;
- requester-owned direct NEED cancellation;
- object/artifact reference payloads;
- normalized fail-closed errors;
- Agent Descriptor retrieval/verification/interface negotiation.

SDKs never create provider ownership/authorization/billing authority and never transport upstream provider credentials as discovery metadata.

## Executable conformance

Run:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

The gate starts a real local relay and signed Descriptor fixture and executes independent provider/requester flows in TypeScript, Python, Go, Java and .NET. Dedicated negative/lifecycle regressions remain authoritative for properties the shared happy-path runner does not attempt.

## Streaming / cancellation

Authenticated relay-event streaming and signed compact generic `PARTIAL` delivery are implemented. `PARTIAL` preserves correlation, monotonic sequence, identical-retry idempotency, bounded backpressure and terminal ordering.

Direct compact NEED cancellation is implemented for the requester-owned bounded lifecycle. Chain-stage cancellation remains unsupported; the legacy/general `waitForResult` path is not guaranteed to be interrupted by `/v1/revoke`.

## Agent Descriptor

Intentionally public runtimes may explicitly opt in to:

```text
GET /.well-known/truyn-agent.json
```

Serving is default-off. The Descriptor is signed by the current TRUYN identity key, TTL-bounded and filtered to an explicit public capability subset. It never grants provider authorization.

### Current lifecycle

The former startup-only limitation is closed: Open-1.0 **S102** added bounded automatic Descriptor refresh/re-sign before expiry. Runtime refresh preserves identity binding, capability filtering, TTL bounds and signature validity; regression coverage lives in `tests/agent-descriptor-refresh.test.js`.

Still open: complete malformed/missing endpoint rejection and usable-interface typed mapping parity across every required SDK. Delegated Descriptor-signing keys remain future optional work.

## Object / artifact references

Portable artifact payloads remain reference-oriented and preserve media type, byte count, digest and metadata without embedding arbitrary binary/base64 bodies or credentials. Provider authorization is independent from artifact visibility.

## Package build / provenance

Ordinary CI builds verification distributions for npm, Python, Go, Maven and NuGet. `sdk/release/dist/manifest.json` binds each artifact to source identity, coordinate/version, byte size and SHA-256.

CI build success is not public registry acceptance. Accepted public releases are npm alpha.2, PyPI alpha and Go alpha. TypeScript alpha.4 is the current source/release candidate only. Maven Central and NuGet remain separate external publication gates.

Package verification checks structure, legal files, digests and forbidden archive-entry names. Complete byte-content secret/topology scanning of every archive member remains a separate hardening gate.

## Compatibility boundary

SDK API contract `1` versions the bounded developer surface. It does not declare `TRUYN/1` stable or turn prereleases into stable v1 ecosystem promises.

Compatibility/deprecation/migration rules: `../docs/compatibility/SDK_COMPATIBILITY.md`.

## Remaining Developer Release gates

- [x] five required clients;
- [x] shared executable conformance;
- [x] npm alpha.2 / PyPI / Go accepted immutable prereleases;
- [x] Descriptor serving/fetch/signature;
- [x] automatic Descriptor refresh/re-sign;
- [ ] TypeScript alpha.4 trusted publication + independent registry acceptance;
- [ ] complete usable-interface validation/mapping parity;
- [ ] Maven Central publication evidence;
- [ ] NuGet.org publication evidence;
- [ ] archive-member byte-content leakage scanning;
- [ ] live public developer-site activation/liveness.

## License

All SDKs are Apache-2.0 and distributions retain `LICENSE` and `NOTICE`.
