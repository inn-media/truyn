# TRUYN SDKs

Native first-party client libraries for applications that integrate directly with TRUYN without depending on an agent-specific provider adapter.

**Current maturity:** Developer Release relay-client implementation is source/build complete. TypeScript/JavaScript, Python, Go, Java and C#/.NET are implemented first-party relay clients and share one executable five-language conformance path. The package line is pre-release and public registry publication is not claimed until native registry ownership/trusted-publishing and immutable release evidence are complete. Agent Descriptor serving/fetch/signature happy paths exist, while automatic refresh and complete usable-interface validation/mapping parity remain open.

**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`  
**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1`

## Required first-party SDKs

| Language | Directory | Distribution coordinate | Current status |
|---|---|---|---|
| JavaScript / TypeScript | `typescript/` | npm `@truyn/sdk@0.1.0-alpha.1` | **Implemented client + Descriptor valid-fixture verification + executable conformance** |
| Python | `python/` | PyPI `truyn-sdk==0.1.0a1` | **Implemented client + Descriptor valid-fixture verification + executable conformance** |
| Go | `go/` | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | **Implemented relay client + Descriptor valid-fixture verification + executable conformance** |
| Java | `java/` | Maven `org.truyn:truyn-sdk:0.1.0-alpha.1` | **Implemented relay client + Descriptor valid-fixture verification + executable conformance** |
| C# / .NET | `dotnet/` | NuGet `Truyn.Sdk 0.1.0-alpha.1` | **Implemented relay client + Descriptor valid-fixture verification + executable conformance** |
| Rust | `rust/` | optional | optional secondary track |

The five required first-party targets are **JavaScript/TypeScript, Python, Go, Java and C#/.NET**. Rust may be maintained as an additional SDK but does not replace any required language.

The coordinates above identify the intended alpha line. Ordinary CI currently rebuilds that nominal version on different source SHAs, and the manifest binds each verification build to its exact source. Those CI artifacts are therefore **per-commit verification artifacts**, not proof of one immutable published release. Before publication, one release version must be bound to one frozen/tagged source (or different source must receive a different version).

## Common Developer Release contract

All five required SDKs cover the same bounded relay semantics while remaining idiomatic to their language:

- create a local Ed25519 identity;
- sign TRUYN envelopes and verify received signed events;
- register with a relay and use the authenticated session;
- discover only authorized capabilities/providers;
- publish an `OFFER`;
- submit a `NEED` and receive/verify provider-side NEED work;
- return and verify a correlated signed `RESULT`;
- issue direct NEED cancellation from the owning requester;
- carry stable API-v1 object/artifact reference shapes;
- normalize fail-closed errors without changing wire semantics;
- fetch and verify the accepted valid TRUYN Agent Descriptor fixture and select a compatible protocol/interface type.

SDKs are convenience surfaces. They never create authorization, provider ownership or billing authority, and they do not transport upstream provider credentials in TRUYN metadata.

## Five-language executable conformance

The Developer Release acceptance path is:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

It starts one real local TRUYN relay and one HTTP Agent Descriptor fixture signed by a real ephemeral TRUYN Ed25519 identity, then runs an independent provider/requester pair for TypeScript, Python, Go, Java and .NET.

Every language independently executes:

```text
register provider + requester
        ↓
authorized OFFER
        ↓
NEED
        ↓
verified provider NEED
        ↓
RESULT
        ↓
verified requester RESULT
        ↓
second direct NEED → cancellation call from owning requester
```

The lower-level shared source/fixture contract remains available through:

```bash
node sdk/conformance/run-conformance.mjs --json
```

The five-language E2E proves executable happy-path network behavior. It does **not** by itself prove every negative property in every language: for example, it does not attempt a non-owner cancellation and its valid Descriptor fixture does not detect every missing/malformed endpoint case.

## Direct NEED cancellation

Direct NEED cancellation is implemented for the bounded direct/compact lifecycle and is distinct from merely aborting a local SDK wait.

The relay/runtime verifies requester authority, propagates cancellation to matching provider work where supported, removes pending work before execution when possible and rejects late `RESULT`/`PARTIAL` output after terminal cancellation. For compact fast NEEDs, an open `waitMs > 0` waiter is completed as cancelled and a `waitMs=0` owner can read lifecycle state via `compactRequestStatus`.

The legacy/general `waitForResult` path is not guaranteed to be interrupted by `/v1/revoke` and may continue until normal result or timeout. Chain-stage cancellation remains unsupported.

## Streaming

Two streaming surfaces are implemented:

1. authenticated relay/event streaming for SDK consumers;
2. signed compact generic `PARTIAL` delivery for provider partial results.

`PARTIAL` enforces request/provider correlation, zero-based monotonic ordering, identical-retry idempotency, bounded backpressure and terminal `RESULT` ordering.

It is intentionally a generic ordered delta/chunk contract. TRUYN does not prescribe a universal tokenizer, provider token-ID format or cross-provider token vocabulary.

## Object/artifact references

All five SDKs expose portable object/artifact payload semantics. Artifact payloads are reference-oriented and preserve fields such as media type, byte count and digest without embedding arbitrary binary/base64 bodies or implicitly fetching remote URLs.

Provider authorization remains independent from artifact/reference visibility.

## Agent Descriptor status

The bounded public Descriptor primitives and valid-fixture client path are implemented.

Intentionally public runtimes may explicitly opt in to serving:

```text
GET /.well-known/truyn-agent.json
```

Serving is disabled by default. The runtime signs the Descriptor with the current TRUYN identity key, applies bounded validity and advertises only the explicitly allowed public subset of actual capabilities.

All five required SDK clients can retrieve the accepted valid Descriptor, validate its supported schema/version/expiry, verify identity-key binding/signature and select a mutually supported protocol/interface type. Two gaps remain:

- `runtime/service.js` creates the Descriptor once at provider startup and does not refresh/re-sign it before `expiresAt`; a long-running provider can therefore serve an expired Descriptor until restart;
- Go/Java/.NET do not yet all require a usable non-empty `interfaces[].endpoint` when selecting an interface, and Go/.NET typed endpoint mapping is not fully aligned with the schema.

Accordingly, **complete Agent Descriptor lifecycle and usable-interface parity are not yet accepted**. The Descriptor remains bootstrap/self-description metadata and never grants provider authorization. Delegated Descriptor-signing keys also remain outside the current alpha contract.

## Package build and release provenance

Ordinary CI builds verification distributions for all required ecosystems:

- npm tarball;
- Python wheel + sdist;
- Go module source bundle;
- Maven binary/source/Javadoc/POM artifacts;
- NuGet package.

`sdk/release/dist/manifest.json` records the exact source commit SHA, package coordinate/version, byte size and SHA-256 digest for each CI build. `verify-release.mjs` checks expected artifacts, digests, `LICENSE`/`NOTICE`, and forbidden **archive entry names** such as `.env`, `.git`, `.github`, `node_modules` or private-key-like names.

It does **not** unpack and scan every archived file byte using the source-tree credential/private-topology patterns. Therefore byte-content secret/topology scanning of generated packages remains a separate release-review requirement; CI package verification must not be described as complete leakage scanning.

### Publication boundary

Native public registry publication is **not** implied by CI package build success. Public publication requires the separately accepted release-infrastructure path, external namespace ownership/trusted-publishing setup, an immutable version/source binding, package-content security review, and observed registry evidence.

Likewise, checked-in developer-site source is not proof that the public developer site is live.

See `release/PUBLISHING.md` and `../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.

## Compatibility boundary

Stable SDK API contract `1` versions the bounded SDK surface. It does not declare `TRUYN/1` stable and it does not turn the alpha package line into a stable ecosystem promise.

Compatibility/deprecation/migration rules are canonical in `../docs/compatibility/SDK_COMPATIBILITY.md`.

## Historical DX sequence

The repository progressed through DX-0/DX-1/DX-2/DX-3 into the merged Developer Release Layer. Those earlier labels remain useful history, but current status must not describe Go/Java/.NET as skeletons or direct cancellation/PARTIAL streaming as entirely future work.

Current remaining Developer Release/lifecycle gates include:

- automatic Descriptor refresh/re-signing and complete usable-interface validation/mapping parity;
- immutable public native package publication;
- live public developer-site activation/liveness evidence.

Optional later contracts include standardized cross-provider tokenizer semantics, chain-stage cancellation and delegated Descriptor-signing keys.

## License

All TRUYN SDKs in this directory are licensed under the **Apache License 2.0 (`Apache-2.0`)**. SDK distributions must include [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
