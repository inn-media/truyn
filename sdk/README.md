# TRUYN SDKs

Native first-party client libraries for applications that integrate directly with TRUYN without depending on an agent-specific provider adapter.

**Current maturity:** DX-3 stable API surface is active. TypeScript and Python now expose reference helpers for streaming, cancellation and object/artifact payloads. Go, Java and C#/.NET expose matching stable API skeleton surfaces pinned to the same shared conformance runner. Language package distributions remain private/internal and are not production-ready public SDK releases.

## Required first-party SDKs

| Language | Directory | Distribution target | Current status |
|---|---|---|---|
| JavaScript / TypeScript | `typescript/` | npm `@truyn/sdk` | DX-3 stable API reference; not public npm |
| Python | `python/` | PyPI `truyn-sdk` / import `truyn` | DX-3 stable API reference; internal/editable only |
| Go | `go/` | Go module | DX-3 stable API skeleton |
| Java | `java/` | Maven-compatible publication | DX-3 stable API skeleton |
| C# / .NET | `dotnet/` | NuGet | DX-3 stable API skeleton |
| Rust | `rust/` | crates.io-compatible if maintained | optional secondary track / scaffold |

The five required first-party targets before stable v1 are **JavaScript/TypeScript, Python, Go, Java and C#/.NET**.

Rust may be maintained as an additional SDK but does not replace any required first-party language.

## Current packaging boundary

The repository currently reserves package identities for DX reference work, but does not authorize public package publication.

- `sdk/typescript/package.json` identifies `@truyn/sdk` with an internal development version and remains marked non-publishable.
- `sdk/python/pyproject.toml` identifies the `truyn-sdk` distribution with import package `truyn` and an internal development version.
- Go, Java and C#/.NET package coordinates are DX-3 skeleton coordinates only; they are not public compatibility promises.

Before any public package release, follow `../docs/compatibility/SDK_PACKAGING.md`.

## Common contract

All first-party SDKs must provide equivalent TRUYN semantics while remaining idiomatic to their language:

- connect/configure a TRUYN node/client;
- retrieve requester identity;
- fetch and verify a TRUYN Agent Descriptor;
- discover authorized capabilities/providers;
- publish/revoke `OFFER`;
- submit `NEED` and correlate/stream/poll `RESULT`;
- carry deadlines/cancellation/timeouts;
- expose signed identity/provenance/trust metadata available from the node;
- handle object/artifact payloads through `ArtifactPayload`;
- expose normalized error/compatibility status;
- preserve the same authorization/billing boundary as CLI/MCP/HTTP/WebSocket/native paths.

The SDK is a client convenience layer. It is never an authorization bypass and must not contain upstream provider credentials in network metadata.

### Stable DX-3 API primitives

The DX-3 API contract adds stable names that every required SDK must expose or reserve:

| Primitive | Purpose |
|---|---|
| `NeedRequest` | High-level SDK request for capability invocation. |
| `ResultResponse` | High-level SDK response for completed capability invocation. |
| `StreamEvent` | Ordered streaming event for long-running results. |
| `ArtifactPayload` | Portable object/artifact input or output payload. |
| cancellation hook | Caller-owned cancellation path: `AbortSignal`, `CancellationToken`, `context.Context`, Java async cancellation or .NET `CancellationToken`. |

See `../docs/developers/sdk-api.md` for the external developer-facing API shape.

### Shared conformance data and runner

The language-neutral conformance contract is rooted at [`conformance/`](conformance/). It contains the shared DTO schema, foundational golden fixtures, Agent Descriptor cryptographic/negotiation vectors and executable reference semantics.

The unified runner checks all five required first-party language directories against this shared source of truth:

```bash
node sdk/conformance/run-conformance.mjs --json
node sdk/conformance/run-conformance.mjs --language=go --json
```

The runner validates the language matrix, required source files, foundational DTO markers, DX-3 stable API markers, fixture-set identity, protocol generation and the private/internal package boundary. It does not add network endpoints, protocol message kinds, routing behavior, provider-policy behavior or D-1000 semantics.

## Agent Descriptor

The onboarding/discovery metadata contract is the **TRUYN Agent Descriptor**.

For intentionally public HTTP-facing participants, the target well-known path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor provides identity, supported TRUYN versions/interfaces, public capability classes and interaction features. It does **not** replace dynamic `OFFER` state and never grants requester authorization.

The shared reference now implements:

- v1 JSON parsing and structural validation;
- expiry validation with explicit offline/cache override;
- descriptor/protocol/interface compatibility negotiation;
- identity-bound Ed25519 signature verification using existing TRUYN canonicalization;
- fail-closed behavior for tampering, wrong identity keys and unsupported delegated descriptor keys.

These are conformance semantics for first-party SDKs; they do not yet make any package directory a published public SDK release.

See:

- `conformance/README.md`
- `../docs/developers/README.md`
- `../docs/developers/sdk-api.md`
- `../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `../spec/protocol/v1/agent-descriptor.md`
- `../docs/compatibility/SDK_COMPATIBILITY.md`
- `../docs/compatibility/SDK_PACKAGING.md`
- `../docs/getting-started/SDK_QUICKSTART.md`

## Implementation sequence

1. **DX-0:** architecture, Agent Descriptor, SDK contract, language scaffolds.
2. **DX-1:** TypeScript/JavaScript + Python reference SDKs and shared conformance fixtures.
3. **DX-2:** Go + Java + C#/.NET skeleton parity plus unified conformance runner.
4. **DX-3:** stable SDK API surface, streaming/cancellation/artifact payloads and external developer docs.
5. **DX-4:** stable v1 conformance gate across all five required SDKs and public package release readiness.

See `../ROADMAP.md` for sequencing relative to the broader network productionization program.

## License

All TRUYN SDKs in this directory are licensed under the **Apache License 2.0 (`Apache-2.0`)**. SDK distributions must include [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
