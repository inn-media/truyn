# TRUYN SDK Packaging and Versioning Policy

**Status:** Developer Release package/build verification is implemented. The release family is split after the npm packaging repair: TypeScript/JavaScript uses `0.1.0-alpha.2`, Python uses `0.1.0a1`, and Go/Java/.NET remain on `0.1.0-alpha.1`. npm, PyPI and Go have accepted immutable public release evidence; Maven Central and NuGet remain open.  
**Protocol:** `TRUYN/1` draft.  
**Stable SDK API contract:** `1` (separate from protocol stability).

This document defines the packaging and publication boundary for the five required first-party SDKs. The old DX-1/DX-2 scaffold-only description is obsolete: all five required clients are implemented and ordinary CI builds/verifies package artifacts.

The npm `@truyn/sdk@0.1.0-alpha.1` artifact is immutable but superseded for installation because a required clean-room Node 22 ESM import exposed a bundled CommonJS `ws` failure. The repair therefore uses the distinct immutable coordinate `@truyn/sdk@0.1.0-alpha.2`; that repair is now an accepted public release. The other ecosystem coordinates are not bumped merely because npm packaging changed.

This is a packaging policy, not a protocol change. It does not alter `TRUYN/1`, Agent Descriptor semantics, relay behavior, authorization, routing, QUIC/Kademlia behavior, D-1000 evaluator logic or runtime thresholds.

## 1. Developer Release inventory

| Language | Repository path | Public distribution target | Developer Release coordinate | Current state |
|---|---|---|---|---|
| JavaScript / TypeScript | `sdk/typescript/` | npm | `@truyn/sdk@0.1.0-alpha.2` | implemented client; accepted immutable public release with verified registry byte identity, provenance/signature evidence and independent clean-room Node 22 ESM import |
| Python | `sdk/python/` | PyPI | `truyn-sdk==0.1.0a1` / import `truyn` | implemented client; accepted immutable public artifact/provenance evidence |
| Go | `sdk/go/` | Go module | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | implemented client; accepted immutable public tag/module evidence |
| Java | `sdk/java/` | Maven Central target | `org.truyn:truyn-sdk:0.1.0-alpha.1` | implemented client; Maven verification build CI-proven; public registry publication remains evidence-gated |
| C# / .NET | `sdk/dotnet/` | NuGet | `Truyn.Sdk 0.1.0-alpha.1` | implemented client; NuGet verification build CI-proven; public registry publication remains evidence-gated |
| Rust | `sdk/rust/` | crates.io-compatible if maintained | optional | secondary track; does not replace any required first-party language |

The five required first-party targets are JavaScript/TypeScript, Python, Go, Java and C#/.NET.

## 2. CI verification versus publication

The repository-side Developer Release gate includes:

- executable five-language conformance against a real local relay;
- package compilation/build for all five required ecosystems;
- package archive-entry/licensing verification;
- `LICENSE` / `NOTICE` coverage checks;
- a release manifest carrying source-SHA metadata plus artifact byte size and SHA-256 digests;
- packed-tarball clean-room installation/import for the TypeScript SDK;
- pre-stable semantic-versioning, compatibility, migration and deprecation policy.

Ordinary CI is still a verification system, not a registry publication path. A public release must select one exact accepted source and one exact CI artifact for that source. npm alpha.2 has completed that separate publication/verification path; Maven Central and NuGet have not.

`verify-release.mjs` verifies expected artifacts/digests and inspects archive **entry names** for forbidden paths/names. It does not recursively scan all archived bytes with the source-tree credential/private-topology patterns. Full generated-package byte-content leakage review therefore remains a publication/release-security requirement.

Public publication is a separate operational event and requires observable registry/tag evidence tied to one immutable release source/version binding.

## 3. Current alpha family and immutability boundary

The current Developer Release family is:

```text
typescript/npm: 0.1.0-alpha.2
python:         0.1.0a1
go tag:         sdk/go/v0.1.0-alpha.1
java:           0.1.0-alpha.1
dotnet:         0.1.0-alpha.1
protocol:       TRUYN/1
stable SDK API: 1
channel:        pre-release
```

`@truyn/sdk@0.1.0-alpha.1` remains immutable historical evidence and must never be overwritten. Its clean-room import failure is repaired only by the new alpha.2 version. The accepted alpha.2 public release is permanently bound to its published bytes/source/provenance evidence; both npm `alpha` and default `latest` resolve to alpha.2 as recorded in the npm closure evidence.

For an accepted/public release, rebuilding the same published package version from different source is forbidden. The release path must either:

- publish the exact accepted artifact from the frozen/tagged source selected for that version; or
- assign a distinct prerelease version to materially different source.

## 4. Publication requirements

Before a native public registry/tag publication is claimed, the release operation must preserve:

1. immutable tagged/exact source bound to the published version;
2. the five-language executable conformance gate;
3. package build/install verification;
4. exact checked-out release source/tree binding plus package digests/provenance;
5. `LICENSE` and `NOTICE` inclusion;
6. compatibility declaration and release notes;
7. package-content security review excluding credentials, private topology, provider secrets/IDs, live allowlists, quota/cost ceilings and secret-bearing URLs, including byte-content inspection beyond archive entry names;
8. fail-closed authorization/privacy behavior equivalent to the source/runtime contract;
9. registry namespace/ownership and trusted-publishing credentials configured outside the public source tree;
10. observable successful publication for the intended package coordinate/tag;
11. registry byte identity against the accepted artifact;
12. supported provenance/signature identity bound to the expected repository/workflow/ref/source;
13. clean-room installation from the public registry.

A source workflow describing how publication should happen is not itself registry publication evidence.

npm alpha.2 satisfies the public publication evidence boundary. Maven Central and NuGet still must satisfy the same class of immutable source, registry byte identity, provenance/signature and clean-room requirements before acceptance.

## 5. Versioning policy

SDK package versions, the stable SDK API contract, TRUYN protocol generation, wire schema and Agent Descriptor schema are independent dimensions.

Every release must declare:

- SDK semantic version;
- stable SDK API contract version;
- supported TRUYN protocol generation(s);
- supported wire/schema generation(s) where applicable;
- supported Agent Descriptor version;
- tested node/server range;
- minimum language/runtime version;
- feature matrix and explicit unsupported semantics;
- deprecations/migration guidance;
- publication state;
- exact release source/tree and package provenance.

### Pre-stable `0.x`

Breaking changes may occur only through an explicit version change with release notes and migration guidance. Once an alpha/beta version is selected for public publication, its meaning and source binding must not silently change. An immutable defective artifact is superseded by a new version, never overwritten.

### Stable `1.x` target

Stable first-party SDK v1 requires at minimum:

1. a declared stable TRUYN protocol/node compatibility range;
2. a stable Agent Descriptor version/lifecycle policy;
3. all five required SDKs passing common executable conformance against that range;
4. native public package/tag publication with auditable immutable provenance;
5. compatibility/deprecation policy in force;
6. examples and quickstarts verified against released package versions.

After stable v1, normal semantic-versioning rules apply: major for breaking API/compatibility changes, minor for additive compatible features and patch for compatible fixes.

## 6. Package maturity vocabulary

Documentation must distinguish these states rather than collapsing them:

```text
implemented source
  -> CI-proven executable conformance
  -> per-CI verification package + digest/source metadata
  -> exact artifact/source-bound immutable public pre-release publication
  -> stable public package
```

npm alpha.2, PyPI alpha and Go alpha are accepted at the fourth stage. Java/Maven Central and .NET/NuGet remain below that publication stage. Acceptance in one ecosystem does not imply another ecosystem's publication.

## 7. Non-goals

This policy does not:

- make `TRUYN/1` stable;
- make an SDK client an authorization or billing authority;
- change provider visibility/access semantics;
- change network/D-1000 acceptance thresholds;
- claim registry availability before it is externally observed;
- claim complete generated-package byte-content leakage scanning from the current entry-name verifier;
- make Rust a required stable-v1 language.

See also:

- `SDK_COMPATIBILITY.md`;
- `../architecture/SDK_DEVELOPER_EXPERIENCE.md`;
- `../../sdk/release/PUBLISHING.md`;
- `../../sdk/release/version.json`.
