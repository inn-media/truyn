# TRUYN SDK and Developer Experience Architecture

**Status:** five required first-party clients implemented/conformance-proven; npm/PyPI/Go accepted prereleases; TypeScript alpha.4 is a current source/release candidate; Maven Central/NuGet/site and complete interface parity remain open.  
**Documentation audit:** 2026-09-23  
**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1` (independent of protocol stability)

The old “SDK scaffolding only” description is obsolete. TypeScript/JavaScript, Python, Go, Java and C#/.NET implement bounded first-party relay clients and share executable conformance. Rust remains optional.

## Required SDK matrix

| Language | Directory | Public coordinate / source candidate | Current state |
|---|---|---|---|
| TypeScript / JavaScript | `sdk/typescript/` | accepted npm `@truyn/sdk@0.1.0-alpha.2`; current source candidate `0.1.0-alpha.4` | implemented + conformance; alpha.4 publication not yet accepted |
| Python | `sdk/python/` | PyPI `truyn-sdk==0.1.0a1` | implemented + conformance + accepted immutable public prerelease |
| Go | `sdk/go/` | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | implemented + conformance + accepted immutable public prerelease |
| Java | `sdk/java/` | Maven `org.truyn:truyn-sdk:0.1.0-alpha.1` | implemented + conformance; Maven Central publication open |
| C# / .NET | `sdk/dotnet/` | NuGet `Truyn.Sdk 0.1.0-alpha.1` | implemented + conformance; NuGet.org publication open |
| Rust | `sdk/rust/` | optional | secondary track |

npm alpha.1 remains immutable historical evidence and is superseded by alpha.2; it is never overwritten. The repository tag `sdk/npm/v0.1.0-alpha.3` is preserved as immutable bootstrap/release-process evidence and is not promoted to accepted registry publication. Current source/version manifests target TypeScript `0.1.0-alpha.4`; acceptance still requires exact-main trusted publication and independent registry verification.

## Common client contract

The required clients cover the bounded Developer Release semantics:

- local Ed25519 identity;
- signed TRUYN envelopes and received-event verification;
- relay registration/authenticated session use;
- authorization-aware discovery;
- OFFER / NEED / RESULT;
- direct requester-owned NEED cancellation;
- stable object/artifact reference shapes;
- fail-closed error normalization;
- Agent Descriptor retrieval/validation/signature verification/interface negotiation.

SDKs are convenience surfaces. They never create provider ownership, authorization or billing authority.

## Streaming / cancellation / artifacts

Two streaming surfaces are implemented: authenticated relay-event streaming and signed ordered compact `PARTIAL` delivery. `PARTIAL` is a generic delta/chunk contract; TRUYN does not impose a universal tokenizer.

Direct NEED cancellation is implemented for the bounded direct/compact lifecycle. Arbitrary chain-stage cancellation remains unsupported unless a future protocol contract explicitly defines/proves it.

Large binary outputs remain reference-oriented artifact payloads with media type, byte count, digest and metadata; arbitrary base64/provider credentials do not belong in network envelopes.

## Agent Descriptor lifecycle

Public runtime serving is explicit opt-in and default-off:

```text
GET /.well-known/truyn-agent.json
```

The Descriptor:

- is signed with the current TRUYN identity key;
- carries bounded issued/expiry time;
- advertises only the explicit public subset of actual capabilities;
- never grants provider authorization;
- never exposes credentials/backchannels/private allowlists/quotas/billing topology.

### Refresh/re-sign state

The old statement that a provider can only create a Descriptor once at startup is **obsolete**.

Open-1.0 S102 implemented bounded automatic refresh/re-sign before expiry. The runtime preserves identity binding, public capability filtering, TTL bounds and signature verification while refreshing the served Descriptor. Regression coverage exists in `tests/agent-descriptor-refresh.test.js`.

Still open:

- complete malformed/missing endpoint rejection parity across every SDK;
- complete typed usable-interface mapping parity across every SDK;
- delegated Descriptor-signing key/revocation profile (optional future work).

Descriptor and dynamic OFFER remain distinct: Descriptor is bootstrap/self-description; OFFER carries dynamic availability/conditions. Neither grants access by itself.

## Five-language conformance

Run:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

The gate starts a real local relay and signed Descriptor fixture, then exercises independent provider/requester flows for TypeScript, Python, Go, Java and .NET. Dedicated negative/lifecycle regressions remain authoritative for properties the common happy-path runner does not attempt.

## Package / release provenance

Ordinary CI builds verification artifacts for npm, PyPI, Go, Maven and NuGet and binds them to exact source/digest metadata. CI build output is not public registry acceptance.

Accepted public registry releases are currently npm alpha.2, PyPI alpha and Go alpha. TypeScript alpha.4 is the current source/release candidate only. Maven Central and NuGet remain separate external publication gates.

Generated-package archive-member byte-content leakage scanning remains an open hardening item beyond entry-name/license/digest checks.

## Stable compatibility boundary

SDK API contract `1` versions this bounded client surface. It does **not** declare `TRUYN/1` stable and does not turn prerelease package coordinates into stable v1 ecosystem guarantees.

Canonical compatibility/migration rules: `docs/compatibility/SDK_COMPATIBILITY.md`.

## Remaining Developer Release gates

- [x] five required clients implemented;
- [x] shared executable conformance;
- [x] npm alpha.2 / PyPI / Go accepted immutable prereleases;
- [x] Agent Descriptor serving/fetch/signature;
- [x] bounded automatic Descriptor refresh/re-sign;
- [ ] TypeScript alpha.4 trusted publication + independent registry acceptance;
- [ ] complete usable-interface validation/mapping parity;
- [ ] Maven Central public publication evidence;
- [ ] NuGet.org public publication evidence;
- [ ] archive-member byte-content leakage scanning closure;
- [ ] live developer-site activation/liveness evidence.

Stable v1 remains a later release gate tied to explicit protocol/ecosystem criteria, not merely completion of this checklist.
