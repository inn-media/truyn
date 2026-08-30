# TRUYN SDK Compatibility and Migration Policy

**Status:** Developer Release policy implemented for the `0.1.0-alpha.x` line; public registry publication remains gated.  
**Protocol:** `TRUYN/1` remains draft.  
**Stable SDK API contract:** `1` is a separately versioned developer-facing contract and does not imply protocol stable-v1.

TRUYN requires first-party SDKs for JavaScript/TypeScript, Python, Go, Java and C#/.NET. The SDKs expose equivalent TRUYN semantics without requiring identical language syntax.

## Developer Release coordinates

The bounded alpha release line is:

- TypeScript / JavaScript: `@truyn/sdk@0.1.0-alpha.1`;
- Python: `truyn-sdk==0.1.0a1` (import package `truyn`);
- Go: `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`;
- Java: `org.truyn:truyn-sdk:0.1.0-alpha.1`;
- C#/.NET: `Truyn.Sdk 0.1.0-alpha.1`.

These coordinates describe the source/package line. They are **not a claim that every public registry already contains the package**. Registry state is verified independently; source/build conformance cannot substitute for public publication evidence.

## Compatibility declaration required for every release

Every SDK release must declare:

- SDK semantic version;
- stable SDK API contract version;
- supported TRUYN protocol generation(s);
- supported wire/schema generation(s);
- supported Agent Descriptor schema/version;
- minimum language/runtime version;
- tested TRUYN node/server version range;
- implemented feature set and explicit unsupported semantics;
- experimental/deprecated API status;
- package publication state: source-only, private preview, public pre-release or stable;
- exact source SHA and package digests/provenance.

## Semantic-versioning contract

### `0.x` / pre-v1

Before public stable v1, TRUYN may make breaking SDK changes only through an explicit version increment with release notes and migration guidance. An alpha/beta package never silently changes the meaning of the same immutable version.

Within one immutable pre-release version:

- wire/signature semantics are fixed;
- a package rebuild from different source is forbidden;
- unknown required protocol or Descriptor semantics fail explicitly;
- security gates may become stricter in a compatible patch, but a release must not broaden authorization, provider visibility or billing authority as a compatibility shortcut.

### Stable `1.x` target

After stable SDK v1 is declared:

- additive APIs and optional fields may ship in minor versions;
- backward-compatible fixes may ship in patch versions;
- removal/rename/type narrowing or changed required behavior needs the next major version unless correcting a documented security vulnerability;
- supported protocol/Descriptor ranges are declared, not guessed;
- old stable majors receive a documented support window before end-of-support.

## Deprecation policy

For a stable API after v1:

1. mark the API deprecated in code and documentation;
2. name the replacement and migration path;
3. keep the deprecated API through at least the next minor release unless retaining it would preserve a security vulnerability;
4. remove it only in a major release, or earlier only for a security emergency with a release-note advisory;
5. never use deprecation to change requester identity, provider ownership, billing responsibility or signature/correlation rules silently.

Pre-v1 alpha APIs may move faster, but release notes must still identify the break and migration.

## Protocol and SDK independence

SDK API version, SDK package version, TRUYN protocol generation and Agent Descriptor schema version are independent dimensions.

A client must negotiate/validate rather than infer compatibility from package version alone:

```text
SDK package version
        +
stable SDK API contract
        +
TRUYN protocol overlap
        +
Agent Descriptor schema overlap
        +
interface overlap
        ↓
compatible interaction
```

No protocol overlap or no supported Descriptor/interface overlap fails closed as a version/compatibility error. Unknown optional metadata may be ignored; unknown required semantics must not be guessed.

## Agent Descriptor migration

`truyn.agent-descriptor/v1` is the current draft Descriptor schema. First-party clients validate schema/version, expiry and current identity-key signature, then negotiate protocol/interface. A Descriptor is discovery metadata only and never an authorization grant.

If a future Descriptor schema changes required semantics:

- it receives a new `descriptorVersion` and, when needed, new schema identifier;
- old clients must reject the unsupported required version explicitly;
- dual-advertisement/translation is allowed only when semantics are lossless and security-equivalent;
- delegated Descriptor-signing keys remain unsupported until a portable delegation/revocation proof is standardized and added to shared conformance.

## Five-language parity gate

The required executable conformance gate covers the same release contract for TypeScript, Python, Go, Java and .NET:

- Ed25519 identity/signature behavior;
- signed Agent Descriptor HTTP retrieval, expiry validation, identity-key binding and protocol/interface negotiation;
- registration and authenticated relay use;
- authorized capability discovery;
- `OFFER` → `NEED` → verified provider event → correlated `RESULT`;
- requester-owned direct NEED revoke/cancellation;
- object/artifact reference surface and integrity shape;
- normalized failures and fail-closed unsupported semantics.

A language implementation is not parity-complete merely because it can call an HTTP endpoint or define matching DTO names.

## Migration checklist for application developers

When upgrading an SDK package:

1. read the release notes and compatibility declaration;
2. confirm the new SDK still advertises overlap with the target TRUYN protocol and Descriptor version;
3. run the application's integration tests against its relay/node version;
4. migrate deprecated APIs before their announced removal major;
5. never persist or copy internal provider credentials into SDK configuration or TRUYN payloads;
6. keep artifact fetching explicit and authorization-aware;
7. treat a new Descriptor capability as discoverability, not authorization.

## Stable-v1 ecosystem gate

TRUYN must not claim stable five-language ecosystem support until:

1. TypeScript/JavaScript, Python, Go, Java and C#/.NET packages are publicly published from immutable tagged source;
2. all five pass the common executable conformance suite against the declared stable protocol range;
3. the supported Agent Descriptor schema/lifecycle is versioned and tested;
4. package/release provenance is auditable and tied to the exact source SHA;
5. examples and quickstarts match the released package versions;
6. package contents are reviewed to exclude credentials, private topology, private provider IDs, live allowlists, quota/cost ceilings and secret-bearing URLs;
7. migration/deprecation rules above are in force for the stable line.

Rust remains an optional additional SDK track and does not replace any required first-party SDK.

See also:

- [SDK Packaging and Versioning Policy](SDK_PACKAGING.md)
- `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `spec/protocol/v1/agent-descriptor.md`
- `sdk/release/PUBLISHING.md`
