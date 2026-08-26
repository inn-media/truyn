# TRUYN SDK Compatibility

**Status:** defined target policy; first-party SDKs are not yet stable/published.

TRUYN requires first-party SDKs for JavaScript/TypeScript, Python, Go, Java and C#/.NET. The SDKs must expose equivalent TRUYN semantics without requiring identical language APIs.

## Current package status

Current SDK packages are **private/internal only**:

- TypeScript / JavaScript: `@truyn/sdk`, internal DX-1 reference package, not public npm.
- Python: `truyn-sdk` distribution with import package `truyn`, internal DX-1 reference package, not public PyPI.
- Go, Java and C#/.NET: scaffold targets only; public coordinates are not stable claims.

The packaging and versioning policy is defined in [SDK Packaging and Versioning Policy](SDK_PACKAGING.md).

## Required compatibility declaration

Every SDK release must declare:

- SDK semantic version;
- supported TRUYN protocol generation(s);
- supported wire/schema generation(s);
- supported Agent Descriptor schema/version;
- minimum language/runtime version;
- tested TRUYN node/server version range;
- implemented feature set;
- experimental/deprecated API status;
- package publication state: internal, private preview, public pre-release or stable.

## Pre-v1 policy

Until `TRUYN/1` and the SDK surface stabilize:

- SDK APIs may change with explicit release notes;
- internal DX versions such as `0.0.0` or `0.0.0-dxN.*` are not public compatibility promises;
- testnet may require newer SDK versions;
- SDKs must fail clearly on unsupported protocol/descriptor versions;
- no SDK may silently reinterpret unknown required protocol semantics;
- common conformance fixtures should be used to prevent language drift;
- examples and quickstarts must say whether they use repository source, internal packages, public pre-release packages or stable packages.

## Cross-language parity gate

The five required first-party SDKs must share conformance coverage for:

- Agent Descriptor retrieval/validation;
- identity retrieval;
- authorized capability discovery;
- private capability non-disclosure;
- `OFFER` publish/revoke;
- `NEED` to `RESULT` correlation;
- deadline/timeout/cancellation behavior;
- normalized error mapping;
- content/artifact references;
- security-negative behavior proving unauthorized private-provider execution does not occur.

A language implementation is not considered parity-complete merely because it can call an HTTP endpoint.

## Stable v1 gate

Before TRUYN claims stable first-party SDK support:

1. TypeScript/JavaScript, Python, Go, Java and C#/.NET packages are published from tagged source;
2. all five pass the common conformance suite against stable `TRUYN/1`;
3. the supported Agent Descriptor schema is versioned and tested;
4. deprecation/compatibility rules are documented;
5. package/release provenance is auditable;
6. examples and quickstarts match the released package versions;
7. package contents are reviewed to exclude credentials, private topology, private provider IDs, live allowlists, quota/cost ceilings and secret-bearing URLs.

Rust is currently an optional additional SDK track and is not a replacement for any required first-party SDK.

See also:

- [SDK Packaging and Versioning Policy](SDK_PACKAGING.md)
- `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `spec/protocol/v1/agent-descriptor.md`
