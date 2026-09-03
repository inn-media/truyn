# TRUYN SDK Packaging and Versioning Policy

**Status:** Developer Release package/build verification is implemented for the `0.1.0-alpha.1` line; native public registry publication and immutable release binding remain external release gates.  
**Protocol:** `TRUYN/1` draft.  
**Stable SDK API contract:** `1` (separate from protocol stability).

This document defines the packaging and publication boundary for the five required first-party SDKs. The old DX-1/DX-2 scaffold-only description is obsolete: all five required clients are implemented and ordinary CI builds/verifies package artifacts. The release manifest records a configured source-SHA provenance field plus artifact digests, but pull-request CI currently checks out GitHub's synthetic merge ref while `TRUYN_RELEASE_SOURCE_SHA` identifies the PR head. Therefore ordinary PR CI does **not** yet prove an exact checked-out build-tree-to-recorded-SHA binding. Ordinary CI also rebuilds the same nominal alpha version from different PR/main inputs, so those outputs are **verification artifacts**, not one immutable released version. None of this proves that a native public registry currently serves the packages.

This is a packaging policy, not a protocol change. It does not alter `TRUYN/1`, Agent Descriptor semantics, relay behavior, authorization, routing, QUIC/Kademlia behavior, D-1000 evaluator logic or runtime thresholds.

## 1. Developer Release inventory

| Language | Repository path | Public distribution target | Developer Release coordinate | Current state |
|---|---|---|---|---|
| JavaScript / TypeScript | `sdk/typescript/` | npm | `@truyn/sdk@0.1.0-alpha.1` | implemented client; package verification build CI-proven; public registry publication not yet evidenced |
| Python | `sdk/python/` | PyPI | `truyn-sdk==0.1.0a1` / import `truyn` | implemented client; wheel/sdist verification build CI-proven; public registry publication not yet evidenced |
| Go | `sdk/go/` | Go module | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` | implemented client; module source/build checks CI-proven; public tag/module availability not yet evidenced |
| Java | `sdk/java/` | Maven Central target | `org.truyn:truyn-sdk:0.1.0-alpha.1` | implemented client; Maven verification build CI-proven; public registry publication not yet evidenced |
| C# / .NET | `sdk/dotnet/` | NuGet | `Truyn.Sdk 0.1.0-alpha.1` | implemented client; NuGet verification build CI-proven; public registry publication not yet evidenced |
| Rust | `sdk/rust/` | crates.io-compatible if maintained | optional | secondary track; does not replace any required first-party language |

The five required first-party targets are JavaScript/TypeScript, Python, Go, Java and C#/.NET.

## 2. CI verification versus publication

The repository-side Developer Release gate includes:

- executable five-language conformance against a real local relay;
- package compilation/build for all five required ecosystems;
- package archive-entry/licensing verification;
- `LICENSE` / `NOTICE` coverage checks;
- a manifest source-SHA marker plus artifact byte size and SHA-256 digests in `sdk/release/dist/manifest.json`;
- pre-stable semantic-versioning, compatibility, migration and deprecation policy.

For pushes where the checked-out commit and reported source SHA are the same, that marker can identify the build commit directly. For pull requests, current CI builds the synthetic merge checkout while the manifest override identifies `github.event.pull_request.head.sha`; the manifest therefore does not by itself identify the exact checked-out merge tree. Exact build-tree provenance remains a release-infrastructure gate.

`verify-release.mjs` verifies expected artifacts/digests and inspects archive **entry names** for forbidden paths/names. It does not recursively scan all archived bytes with the source-tree credential/private-topology patterns. Full generated-package byte-content leakage review therefore remains a publication/release-security requirement.

These facts authorize a **source/build-complete client layer with per-CI package verification, reported-source metadata and digest provenance** claim. They do not authorize a claim that npm, PyPI, the Go module proxy, Maven Central or NuGet currently serves the package, nor that every CI artifact under the nominal alpha version is an immutable release, nor that every PR manifest source SHA is the exact checkout tree that produced the bytes.

Public publication is a separate operational event and requires observable registry/tag evidence tied to one immutable release source/version binding.

## 3. Current alpha line and immutability boundary

The current nominal Developer Release package line is:

```text
release: 0.1.0-alpha.1
python: 0.1.0a1
go tag target: sdk/go/v0.1.0-alpha.1
protocol: TRUYN/1
stable SDK API: 1
channel: pre-release
```

Current `.github/workflows/ci.yml` invokes `sdk/release/build-release.sh` for pull requests and pushes to `main`, while package metadata remains on the nominal `0.1.0-alpha.1`/`0.1.0a1` line. `write-manifest.mjs` records `TRUYN_RELEASE_SOURCE_SHA` when supplied. In pull-request CI that value is the PR head SHA even though the checkout is the synthetic merge ref; on normal `main` push CI the reported SHA corresponds to the pushed commit. Thus different CI runs carry useful provenance metadata and artifact digests, but **ordinary PR CI does not yet enforce exact checked-out-build-tree binding, and ordinary CI does not enforce immutable version-to-source binding**.

For an accepted/public release, rebuilding the same published package version from different source is forbidden. Before publication, the release path must either:

- build the release only from the frozen/tagged source selected for that version; or
- assign a distinct prerelease version to materially different source.

The publication path must also record the actual checked-out release commit/tree that produced the package bytes rather than relying on a PR-head override that can differ from the checkout. Until those gates are implemented and observed, CI outputs must be described as verification artifacts rather than immutable release artifacts.

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
10. observable successful publication for the intended package coordinate/tag.

A source workflow describing how publication should happen is not itself registry publication evidence.

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

Breaking changes may occur only through an explicit version change with release notes and migration guidance. Once an alpha/beta version is selected for public publication, its meaning and source binding must not silently change.

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
  -> per-CI verification package + reported-source metadata + digest provenance
  -> exact build-tree-bound immutable public pre-release publication
  -> stable public package
```

Current required SDKs are at the **per-CI verification package + reported-source metadata + digest provenance** stage. Exact PR build-tree binding, immutable native public publication and stable ecosystem compatibility remain open.

## 7. Non-goals

This policy does not:

- make `TRUYN/1` stable;
- make an SDK client an authorization or billing authority;
- change provider visibility/access semantics;
- change network/D-1000 acceptance thresholds;
- claim registry availability before it is externally observed;
- claim exact PR checkout-tree provenance from the current head-SHA manifest override;
- claim complete generated-package byte-content leakage scanning from the current entry-name verifier;
- make Rust a required stable-v1 language.

See also:

- `SDK_COMPATIBILITY.md`;
- `../architecture/SDK_DEVELOPER_EXPERIENCE.md`;
- `../../sdk/release/PUBLISHING.md`;
- `../../sdk/release/version.json`.
