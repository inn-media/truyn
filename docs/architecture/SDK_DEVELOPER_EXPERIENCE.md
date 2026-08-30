# TRUYN SDK and Developer Experience Architecture

**Status:** Developer Release Layer implementation complete in source/build form; native registry publication and public-site activation remain external release gates.  
**Developer Release PR:** `#399`  
**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1` (separate from protocol stability)

The old “SDK scaffolding only” and “portable payload slice only” descriptions are obsolete. TypeScript/JavaScript, Python, Go, Java and C#/.NET now have implemented first-party Developer Release clients and share one executable conformance path. Package artifacts and provenance are built in ordinary CI. Public registry publication is intentionally not claimed until registry ownership/trusted-publishing bootstrap is complete.

## Target developer experience

```text
install SDK
    ↓
configure/connect to a TRUYN node/gateway
    ↓
fetch + verify Agent Descriptor / identity information
    ↓
discover authorized capabilities
    ↓
publish OFFER / submit NEED / receive PARTIAL* / RESULT
    ↓
consume references/events/provenance safely
```

`PARTIAL*` is available for direct fast NEED runtime streaming where supported. SDKs are clients of TRUYN; they do not redefine authorization, provider ownership or billing authority.

## Required first-party SDK matrix

| Language | Repository target | Distribution coordinate | Developer Release state |
|---|---|---|---|
| TypeScript / JavaScript | `sdk/typescript/` | npm `@truyn/sdk@0.1.0-alpha.1` | **Implemented client + Descriptor verification + executable conformance** |
| Python | `sdk/python/` | PyPI `truyn-sdk==0.1.0a1` | **Implemented client + Descriptor verification + executable conformance** |
| Go | `sdk/go/` | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | **Implemented relay client + Descriptor verification + executable conformance** |
| Java | `sdk/java/` | Maven `org.truyn:truyn-sdk:0.1.0-alpha.1` | **Implemented relay client + Descriptor verification + executable conformance** |
| C# / .NET | `sdk/dotnet/` | NuGet `Truyn.Sdk 0.1.0-alpha.1` | **Implemented relay client + Descriptor verification + executable conformance** |
| Rust | `sdk/rust/` | optional | optional secondary track |

The coordinates above identify the intended immutable alpha release line. `publicDistribution=false` remains correct until each native public registry location is actually observed and bound to release evidence.

## Common Developer Release contract

All five required first-party SDKs cover the same bounded semantics:

- local Ed25519 identity creation;
- TRUYN envelope signing and received-event signature verification;
- relay registration and authenticated session use;
- authorized capability discovery;
- `OFFER` publication;
- `NEED` submission and provider-side verified NEED consumption;
- correlated signed `RESULT` return and requester verification;
- requester-owned direct NEED cancellation through signed `REVOKE`;
- stable API-v1 object/artifact reference shapes;
- normalized fail-closed errors;
- Agent Descriptor HTTP retrieval, validation, identity-key signature verification and protocol/interface negotiation.

Language syntax may differ. Semantic and security behavior may not.

## Five-language executable conformance

`sdk/conformance/run-five-language-e2e.mjs` is the Developer Release acceptance gate.

It starts:

1. one real local TRUYN relay;
2. one HTTP Agent Descriptor fixture signed by a real ephemeral TRUYN Ed25519 identity;
3. an independent provider/requester pair in each of TypeScript, Python, Go, Java and .NET.

Every language must first retrieve the same signed Descriptor and prove:

- `schema = truyn.agent-descriptor/v1`;
- supported descriptor version;
- unexpired validity window;
- Descriptor identity matches the Ed25519 public key-derived TRUYN node identity;
- signature verifies over the canonical unsigned Descriptor;
- `TRUYN/1` protocol overlap exists;
- an advertised interface can be negotiated.

Then each language independently executes:

```text
register provider + requester
        ↓
authorized OFFER
        ↓
NEED
        ↓
verified provider NEED event
        ↓
RESULT
        ↓
verified requester RESULT
        ↓
second direct NEED → requester-owned signed cancellation
```

This is executable network behavior, not DTO/marker parity.

## Cancellation boundary

Local SDK cancellation and remote execution cancellation remain distinct.

```text
cancel local SDK wait / stop consuming event stream    implemented bounded behavior
cancel requester-owned direct NEED                     implemented / CI-proven bounded lifecycle
cancel arbitrary chain stage                           NOT supported
```

For a direct NEED:

- requester authority is checked at the relay;
- OFFER and NEED revocation namespaces are explicit;
- signed fast REVOKE uses the same bounded lifecycle channel as fast NEED work;
- provider pending work can be removed before execution and in-flight work receives an `AbortSignal` where the language/runtime exposes it;
- built-in providers propagate cancellation into upstream operations where supported;
- late RESULT/PARTIAL output after terminal cancellation is rejected fail closed;
- cancellation never grants provider authorization or changes billing responsibility.

## Streaming boundary

Two streaming concepts are implemented:

1. authenticated relay/event streaming for SDK consumers;
2. signed compact `PARTIAL` delivery for provider partial results.

The PARTIAL contract provides correlation, strict zero-based monotonic sequence, idempotent identical retry, bounded backpressure, ordered terminal RESULT and fail-closed late/cross-request/cross-provider delivery.

`PARTIAL` remains a **generic ordered delta/chunk** contract. TRUYN does not prescribe a tokenizer, provider token ID format or universal token-delta vocabulary. A standardized cross-provider tokenizer/token-delta convention is optional future compatibility work and is not required for the Developer Release Layer.

## Object/artifact references

All five SDKs expose portable object/artifact payload semantics. Artifact payloads remain reference-oriented and preserve media type, byte count and digest fields without embedding arbitrary binary/base64 data or implicitly fetching remote URLs.

Provider authorization remains independent from artifact/reference visibility.

## TRUYN Agent Descriptor lifecycle

The bounded Descriptor lifecycle is now implemented end to end for the Developer Release profile.

### Serving

Provider runtime may expose:

```text
GET /.well-known/truyn-agent.json
```

Serving is **disabled by default** and requires explicit opt-in:

```text
TRUYN_PUBLIC_AGENT_DESCRIPTOR=1
TRUYN_PUBLIC_AGENT_DESCRIPTOR_URL=https://agent.example/.well-known/truyn-agent.json
TRUYN_PUBLIC_CAPABILITIES=reasoning.general,...
```

The runtime:

- signs the Descriptor with the current TRUYN identity key;
- sets issued/expiry timestamps with bounded TTL;
- advertises only the intersection of actual runtime capabilities and the explicit public capability allowlist;
- never derives authorization from the Descriptor;
- does not expose private provider/backchannel/allowlist/quota/billing topology.

### Discovery and verification

First-party clients retrieve the Descriptor over explicit HTTP(S), validate schema/version/expiry, verify identity-key binding and Ed25519 signature, then negotiate protocol and interface. TypeScript/Python may resolve the identity key through the authenticated relay when appropriate; Go also supports authenticated relay key resolution when an explicit key is not supplied. Java/.NET helpers require an explicit trusted identity public key in the current alpha surface.

Descriptor and dynamic `OFFER` remain separate:

| Concern | Agent Descriptor | OFFER |
|---|---|---|
| bootstrap/self-description | yes | no |
| dynamic availability/capacity | no | yes |
| dynamic conditions/price | no | yes |
| grants provider authorization | never | never by itself; policy still decides |
| stable protocol/interface hints | yes | secondary |

Delegated Descriptor-signing keys are not supported in the alpha contract; current verification binds directly to the TRUYN identity key.

## Package build and release provenance

Ordinary CI builds and verifies consumer distributions for all required ecosystems:

- npm tarball;
- Python wheel + sdist;
- Go module source bundle;
- Maven binary/source/Javadoc/POM artifacts;
- NuGet package.

`sdk/release/dist/manifest.json` binds each artifact to:

- exact source commit SHA;
- package coordinate/version;
- byte size;
- SHA-256 digest.

Release verification also checks LICENSE/NOTICE and forbidden-content boundaries. CI uploads the exact release bundle as immutable workflow evidence for the run.

### Publication boundary

Native public registry publication is **not performed by ordinary CI** and is not claimed by this PR. Registry ownership/trusted-publishing bootstrap must be complete first. The later release-infrastructure PR is defined in `sdk/release/PUBLISHING.md` and must use a protected `sdk-release` environment, immutable tag-only release flow, least privilege and exact-bundle verification.

Do not add a permissive publication workflow or weaken the public-workflow allowlist to simulate completion.

## Stable compatibility and migration policy

`docs/compatibility/SDK_COMPATIBILITY.md` is the canonical migration policy. It defines:

- independent package / SDK API / protocol / Descriptor version dimensions;
- pre-v1 breaking-change rules;
- stable-v1 semver target;
- deprecation/removal rules;
- explicit protocol/Descriptor negotiation failures;
- migration checklist;
- immutable package/source provenance requirement;
- stable ecosystem gate.

Stable SDK API contract v1 does not mean `TRUYN/1` itself is final or that the five packages are publicly stable.

## Security invariants

SDKs MUST NOT:

- bypass provider visibility/access/billing gates;
- treat remote A2A/MCP metadata, Descriptor metadata or transport authentication as TRUYN authority;
- serialize provider credentials into TRUYN network payloads;
- automatically fetch arbitrary artifact URLs;
- silently retry/fallback in a way that duplicates provider-side execution;
- generalize direct NEED cancellation to unsupported chain-stage cancellation;
- accept cross-request/cross-provider RESULT or PARTIAL injection;
- guess unknown required protocol or Descriptor semantics.

## Developer documentation/site

`docs/developer-site/index.html` and `/docs` are the public developer-site source for the Developer Release profile. They describe the five-language alpha line, runtime surface, package coordinates, conformance, release provenance and compatibility boundary.

A source tree being Pages-ready is not the same as a live deployment. Public site activation/liveness must be verified separately after the accepted PR is merged and repository/domain Pages settings are enabled.

## Remaining SDK/DX gates

### Developer Release Layer

- [x] full bounded Go relay client parity;
- [x] full bounded Java relay client parity;
- [x] full bounded C#/.NET relay client parity;
- [x] shared five-language executable client/runtime conformance gate;
- [x] package builds + exact source/digest release provenance;
- [x] stable compatibility/deprecation/migration policy;
- [x] bounded Agent Descriptor serving + five-language fetch/verify/negotiation lifecycle;
- [ ] public native registry publication after external ownership/trusted-publishing bootstrap;
- [ ] live public developer-site activation/liveness proof after merge/settings activation.

### Optional / post-Developer-Release

- [ ] standardized cross-provider token-delta/tokenizer convention beyond generic `PARTIAL`, only if ecosystem interoperability requires it;
- [ ] chain-stage cancellation only if/when a separate bounded protocol contract is defined and proven;
- [ ] delegated Descriptor-signing key/revocation profile only after portable proof and conformance exists.

Therefore: **DX-3 runtime/API core is closed; the Developer Release implementation is source/build complete, while public distribution and live-site activation remain evidence-gated release operations rather than code-completeness claims.**

See `IMPLEMENTATION_STATUS.md`, `../../ROADMAP.md`, `../compatibility/SDK_COMPATIBILITY.md` and `../../sdk/release/PUBLISHING.md`.
