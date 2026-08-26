# TRUYN SDK Packaging and Versioning Policy

**Status:** packaging plan / release policy.  
**Current package state:** private/internal only. No public npm, PyPI, Go, Maven or NuGet package is authorized by this document.

This document defines how first-party SDKs move from the current DX-1 in-repository reference code to auditable package distributions.

It is a packaging policy, not a protocol change. It does not change `TRUYN/1`, Agent Descriptor semantics, relay behavior, authorization, routing, QUIC/Kademlia behavior, D-1000 evaluator logic or any runtime threshold.

## 1. Current package inventory

| Language | Repository path | Public distribution target | Current package identity | Current status |
|---|---|---|---|---|
| JavaScript / TypeScript | `sdk/typescript/` | npm | `@truyn/sdk` | private/internal DX-1 reference package; not publishable |
| Python | `sdk/python/` | PyPI | distribution `truyn-sdk`, import package `truyn` | internal/editable DX-1 reference package; not publishable |
| Go | `sdk/go/` | Go module | not finalized | scaffold only |
| Java | `sdk/java/` | Maven-compatible publication | not finalized | scaffold only |
| C# / .NET | `sdk/dotnet/` | NuGet | not finalized | scaffold only |
| Rust | `sdk/rust/` | crates.io-compatible if maintained | not finalized | optional secondary track |

The five required first-party targets before stable v1 remain JavaScript/TypeScript, Python, Go, Java and C#/.NET. Rust may be maintained as an additional SDK but does not replace any required language.

## 2. Private/internal status before stable

Until the explicit SDK release gate is met:

- TypeScript stays `private: true` and must not be published to the public npm registry;
- Python may be installed from the repository or an internal artifact, but must not be uploaded to public PyPI;
- Go/Java/.NET package coordinates are not public compatibility promises;
- package names, module paths and versions are reserved implementation details until the release gate;
- package artifacts may be used internally for CI, examples, integration testing and preview programs only;
- any internal package or tarball must identify the exact source commit it was built from;
- no package may include credentials, private topology, cloud identities, private provider IDs, live allowlists, quota/cost ceilings or secret-bearing URLs.

Internal package availability is not a stable SDK claim. Public documentation must continue to distinguish `implemented`, `CI-proven`, `internal package`, `public pre-release` and `stable`.

## 3. npm package plan

The JavaScript/TypeScript package target is:

```text
name: @truyn/sdk
runtime: Node.js >= 22
license: Apache-2.0
source: sdk/typescript/
```

Before public npm publication, the package must have:

1. a release build that does not require `--experimental-strip-types` for consumers;
2. generated JavaScript and TypeScript declarations or an equivalent consumer-safe export surface;
3. package contents reviewed so only SDK files, examples, license and notice material are included;
4. `LICENSE` and `NOTICE` coverage preserved;
5. exact package version tied to a signed or otherwise auditable repository tag;
6. release notes naming supported TRUYN protocol, Agent Descriptor and node/server versions;
7. conformance green for the package build, not only raw source tests;
8. negative security tests proving SDK publication does not expose private providers or bypass authorization.

The current `@truyn/sdk` package remains an in-repository DX-1 reference implementation. It is not a public npm release.

## 4. PyPI package plan

The Python package target is:

```text
distribution: truyn-sdk
import package: truyn
runtime: Python >= 3.10
license: Apache-2.0
source: sdk/python/
```

Before public PyPI publication, the package must have:

1. wheel and sdist builds from a tagged source commit;
2. package metadata declaring supported Python versions and runtime dependencies;
3. `LICENSE` and `NOTICE` coverage preserved in the source distribution and wheel;
4. release notes naming supported TRUYN protocol, Agent Descriptor and node/server versions;
5. conformance green for the built wheel, not only editable install;
6. no embedded credentials, private topology, live provider IDs, quota/cost ceilings or secret-bearing URLs;
7. a rollback/yank policy for broken pre-release packages;
8. the same authorization/privacy negative tests as the TypeScript package.

The current `truyn-sdk` metadata is an internal DX-1 reference. It is not a public PyPI release.

## 5. Versioning policy

TRUYN has separate compatibility dimensions. SDK versioning must not pretend that one number controls all of them.

Every SDK release must declare:

- SDK semantic version;
- supported TRUYN protocol generation, such as draft `TRUYN/1`;
- supported Agent Descriptor schema version;
- supported wire/schema generation where applicable;
- tested node/server version or commit range;
- minimum language/runtime version;
- feature matrix and known gaps;
- deprecated, experimental and removed APIs.

### Internal DX versions

`0.0.0`, `0.0.0-dxN.*` and similar development versions mean internal implementation state only. They are not public compatibility promises.

### Public pre-stable versions

Public pre-stable packages, once approved, should use `0.x.y` with explicit pre-release identifiers where needed, for example:

```text
0.1.0-alpha.1
0.1.0-dx3.1
0.2.0-rc.1
```

Breaking changes are allowed before stable only when release notes call them out and compatibility/conformance fixtures are updated in the same change set.

### Stable versions

`1.0.0` SDK stability requires:

1. stable `TRUYN/1` protocol generation;
2. stable Agent Descriptor schema/version policy;
3. all five required SDKs passing the common conformance suite;
4. public package provenance for npm, PyPI, Go, Maven-compatible publication and NuGet;
5. compatibility/deprecation policy documented and linked from release notes;
6. examples and quickstarts verified against the exact released package versions.

After `1.0.0`, SDK semantic versioning follows normal compatibility rules:

- `MAJOR` for breaking public API or compatibility changes;
- `MINOR` for backward-compatible features;
- `PATCH` for backward-compatible fixes;
- pre-release identifiers for unstable release candidates.

## 6. Release gates

A package may move through these states only in order:

```text
repository source only
  -> internal artifact / editable install
  -> private preview package
  -> public pre-release package
  -> stable public package
```

Promotion requires:

- source commit identified;
- conformance suite green;
- package build/install smoke test green;
- `LICENSE`/`NOTICE` included;
- release notes written;
- compatibility declaration written;
- security/privacy package-content review complete;
- maintainer approval under the current governance process.

## 7. Non-goals for the current DX-1/DX-2 work

The current packaging plan does not:

- publish npm or PyPI packages;
- reserve final Go/Java/.NET coordinates;
- claim stable SDK compatibility;
- change runtime APIs or relay/network behavior;
- add provider credentials or cloud configuration to packages;
- authorize production/mainnet package support.

The next implementation step after this policy is package-build automation and package-content tests, still without public publication.
