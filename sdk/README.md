# TRUYN SDKs

Native first-party client libraries for applications that integrate directly with TRUYN without depending on an agent-specific provider adapter.

**Current maturity:** Five required first-party SDKs are implemented, five-language conformance passed and the immutable **Wire Freeze pre-release set** has independent public-registry acceptance (**6/6 source + npm + PyPI + Go + Maven + NuGet proofs PASS**). This is pre-stable `TRUYN/1`, not stable v1. The superseded npm alpha.2 and first-alpha PyPI/Go/Maven/NuGet coordinates are preserved as historical artifacts, not overwritten; the Go/Maven/NuGet alpha.2 coordinates below remain current. See [Wire Freeze SDK registry closure](../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md).

**Historical Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73` (not the current source HEAD or new SDK publication). **Expanded Wire Freeze source merge:** `main@10fac0de290a303b7e39205fb895adfaa01dc30e`.  
**Protocol:** `TRUYN/1` draft; five-language TCJ1 and published-alpha legacy/new matrix verified for the accepted PR-head scope, not stable-v1  
**Stable SDK API contract:** `1`

## Required first-party SDKs

| Language | Directory | Distribution coordinate | Current status |
|---|---|---|---|
| JavaScript / TypeScript | `typescript/` | npm `@truyn/sdk@0.1.0-alpha.5` | **Wire Freeze prerelease, public registry bytes/attestation/signatures/clean-room PASS** |
| Python | `python/` | PyPI `truyn-sdk==0.1.0a2` | **Wire Freeze prerelease, independent registry package/digest PASS** |
| Go | `go/` | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2` | **Wire Freeze prerelease, independent proxy/sumDB and source-content PASS** |
| Java | `java/` | Maven `org.truyn:truyn-sdk:0.1.0-alpha.2` | **Wire Freeze prerelease, independent Maven Central/PGP PASS** |
| C# / .NET | `dotnet/` | NuGet `Truyn.Sdk 0.1.0-alpha.2` | **Wire Freeze prerelease, independent NuGet signature/content PASS** |
| Rust | `rust/` | optional | optional secondary track |

The five required first-party targets are **JavaScript/TypeScript, Python, Go, Java and C#/.NET**. Rust may be maintained as an additional SDK but does not replace any required language.

Historical npm alpha.1 had a clean-room ESM packaging defect, repaired by the distinct alpha.2 release. Both remain immutable history. Current installation uses the five Wire Freeze coordinates above; no historical version, tag, digest or publication evidence is overwritten.

Ordinary CI rebuilds verification packages on different source SHAs, and the manifest binds each verification build to its exact reported source. Those CI artifacts are therefore **per-commit verification artifacts**, not proof of one immutable published release. Publication accepts only an explicitly frozen/tagged source and the exact green CI artifact selected for that source.

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

## Expanded CORE Wire Freeze and published-alpha backwards compatibility

The public [semantic A–I registry](../spec/registry/README.md) is an architectural classification, **not** a change to the five physical signed Envelope types or six compact codes. PR #975 merged the TCJ1 interoperability changes at `main@10fac0de290a303b7e39205fb895adfaa01dc30e`, qualified on source head `cb7618170422270628ac96b5fbb53ae307cdc7f3`. Shared Unicode/numeric vectors and all five SDKs passed the [CI conformance run](https://github.com/inn-media/truyn/actions/runs/38144117793); the [published-alpha old/new relay matrix](https://github.com/inn-media/truyn/actions/runs/38144117794) passed 20/20. It uses actual immutable npm/PyPI/Go/Maven/NuGet prereleases across four old/new provider/requester combinations. The result covers the observed NEED/RESULT interchange, not every negative replay, revocation, QUIC, DHT or exactly-once side effect across all SDK generations. No existing immutable registry coordinate was overwritten. The merged public source SHA is not itself a new publicly distributed release or private consumer pin.

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

All five required SDK clients retrieve the Descriptor, validate schema/version/expiry, verify identity-key binding/signature and select a mutually supported protocol/interface. Missing/blank endpoint and blank-type negative parity is **not verified on current source**: the shared `sdk/conformance/v1/agent-descriptor-runtime-fixtures.json` lacks those cases, and current Go/Java validation does not establish the claimed rejection. Historical S103 PR #823 being merged is not proof that its intended behavior survives on current main. The runtime serving helper renews and re-signs an eligible Descriptor in the bounded refresh window; `tests/agent-descriptor-refresh.test.js` exercises the refresher.

This is implemented bounded source/conformance, not a fresh certification of every historical SDK binary or complete production lifecycle. Delegated signing, operational liveness and final exact-SHA Open 1.0 acceptance remain separate. Descriptor metadata never grants provider authorization.

## Package build and release provenance

Ordinary CI builds verification distributions for all required ecosystems:

- npm tarball;
- Python wheel + sdist;
- Go module source bundle;
- Maven binary/source/Javadoc/POM artifacts;
- NuGet package.

`sdk/release/dist/manifest.json` records the exact source commit SHA, package coordinate/version, byte size and SHA-256 digest for each CI build. `verify-release.mjs` checks expected artifacts, digests, `LICENSE`/`NOTICE`, and forbidden **archive entry names** such as `.env`, `.git`, `.github`, `node_modules` or private-key-like names.

The ordinary CI gate additionally installs the packed TypeScript tarball into a clean temporary project and imports the public `TruynClient` and `TruynLocalNodeClient` exports. This regression gate exists specifically so an npm package that builds but cannot be imported by a clean Node consumer cannot pass the release path again.

It does **not** unpack and scan every archived file byte using the source-tree credential/private-topology patterns. Therefore byte-content secret/topology scanning of generated packages remains a separate release-review requirement; CI package verification must not be described as complete leakage scanning.

### Publication boundary

Native public registry publication is **not** implied by CI package build success. Public publication requires the separately accepted release-infrastructure path, external namespace ownership/trusted-publishing setup, an immutable version/source binding, package-content security review, and observed registry evidence.

The current five-SDK Wire Freeze publication boundary is closed for the exact coordinates above. Frozen source, registry bytes, signatures/provenance and independent consumer verification are recorded in [the release ledger](../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md). Historical npm alpha.2 and NuGet alpha.1 evidence stays under `release/evidence/` and is not reused as evidence for newer bytes.

Likewise, checked-in developer-site source is not proof that the public developer site is live.

See `release/PUBLISHING.md` and `../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.

## Compatibility boundary

Stable SDK API contract `1` versions the bounded SDK surface. It does not declare `TRUYN/1` stable and it does not turn the alpha package line into a stable ecosystem promise.

Compatibility/deprecation/migration rules are canonical in `../docs/compatibility/SDK_COMPATIBILITY.md`.

## Historical DX sequence

The repository progressed through DX-0/DX-1/DX-2/DX-3 into the merged Developer Release Layer. Those earlier labels remain useful history, but current status must not describe Go/Java/.NET as skeletons or direct cancellation/PARTIAL streaming as entirely future work.

Current remaining Developer Release/lifecycle gates include:

- missing/blank endpoint and blank-type rejection across all five SDKs, plus broader Descriptor lifecycle/delegated-signing and production serving qualification beyond the implemented refresh;
- archive-member byte-content leakage scanning;
- live public developer-site activation/liveness evidence.

Optional later contracts include standardized cross-provider tokenizer semantics, chain-stage cancellation and delegated Descriptor-signing keys.

## License

All TRUYN SDKs in this directory are licensed under the **Apache License 2.0 (`Apache-2.0`)**. SDK distributions must include [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

Current Descriptor evidence and remaining interface-negative parity: [source-reconciled status](../docs/compatibility/AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md).
