# TRUYN SDK Compatibility and Migration Policy

> **Current accepted Wire Freeze prerelease (2026-10-11):** npm `@truyn/sdk@0.1.0-alpha.5`, PyPI `truyn-sdk==0.1.0a2`, Go `sdk/go@v0.1.0-alpha.2`, Maven `org.truyn:truyn-sdk:0.1.0-alpha.2`, NuGet `Truyn.Sdk 0.1.0-alpha.2`. All five are bound to frozen public source `57971b134a41c3e3ea4b42f68e86a7d117036006` and the [independent registry acceptance record](../releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md). The active `sdk/release/public-coordinates.json` agrees with this current release. Its previous Developer Release contents are preserved byte-exact in `sdk/release/evidence/public-coordinates-developer-release-2026-09-23.json`. The exact current pins for P13-FORMAT are in [truyn1-five-sdk-freeze.json](../../spec/compatibility/truyn1-five-sdk-freeze.json). No prerelease is a Stable TRUYN/1 SDK declaration.

**Status:** Developer Release policy implemented for the `0.1.0-alpha.x` family; npm, PyPI, Go, Maven Central and NuGet have accepted immutable public releases.  
**Protocol:** `TRUYN/1` remains draft. PR #975 established five-SDK TCJ1 conformance and 20/20 legacy/new published-alpha peer combinations; neither implies stable-v1 or Mainnet.  
**Stable SDK API contract:** `1` is a separately versioned developer-facing contract and does not imply protocol stable-v1.

TRUYN requires first-party SDKs for JavaScript/TypeScript, Python, Go, Java and C#/.NET. The SDKs expose equivalent TRUYN semantics without requiring identical language syntax.

## Current Wire Freeze coordinates

| Language | Accepted immutable public prerelease |
|---|---|
| JavaScript/TypeScript | `@truyn/sdk@0.1.0-alpha.5` |
| Python | `truyn-sdk==0.1.0a2` (import `truyn`) |
| Go | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2` |
| Java | `org.truyn:truyn-sdk:0.1.0-alpha.2` |
| C#/.NET | `Truyn.Sdk 0.1.0-alpha.2` |

All five have independent public registry acceptance at frozen source `57971b134a41c3e3ea4b42f68e86a7d117036006`. Historical npm alpha.1 was defective and its alpha.2 repair remains immutable; neither historical coordinate is the current Wire Freeze installation target. Source/build conformance never substitutes for registry publication or private consumer admission.

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

If a published immutable prerelease is defective, the correction receives a new version. npm alpha.2 is the concrete application of this rule to the alpha.1 packaging defect.

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
4. remove it only in a major release **and after at least 180 calendar days of publicly announced deprecation**, or earlier only for a security emergency with a dated release-note advisory;
5. never use deprecation to change requester identity, provider ownership, billing responsibility or signature/correlation rules silently.

The shared stable deprecation minimum is **180 calendar days**, measured from the first dated public UTC notice, with the affected API/version range, replacement, migration steps and earliest UTC retirement date specified. A deprecated stable API MUST remain available through both the next minor release **and** the entire 180-day notice window (whichever finishes later), and its removal still requires a major release. Stable-major end-of-support must also receive at least 180 calendar days of public notice; any longer commitment prevails. The canonical protocol-wide rule is in `../../spec/protocol/v1/migration.md`. Security emergencies are exceptional, fail closed, and require a public explanation/mitigation rather than a silent compatibility bypass.

Pre-v1 alpha APIs may move faster and have no stable 180-day guarantee, but release notes must still identify the break, version bump and migration.

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

For TypeScript/JavaScript, package parity additionally includes installing the packed npm artifact into a clean Node project and importing the public client exports. A source-level TypeScript test is not sufficient to prove consumer package usability.

## Migration checklist for application developers

When upgrading an SDK package:

1. read the release notes and compatibility declaration;
2. confirm the new SDK still advertises overlap with the target TRUYN protocol and Descriptor version;
3. run the application's integration tests against its relay/node version;
4. migrate deprecated APIs before their announced removal major;
5. never persist or copy internal provider credentials into SDK configuration or TRUYN payloads;
6. keep artifact fetching explicit and authorization-aware;
7. treat a new Descriptor capability as discoverability, not authorization.

For current Wire Freeze npm onboarding, explicitly install `@truyn/sdk@0.1.0-alpha.5`. Do not infer the accepted frozen version from mutable `latest` or from a historical dist-tag observation. Application compatibility and rollout must be qualified before upgrading an existing consumer.

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

Current Descriptor evidence and remaining interface-negative parity: [source-reconciled status](AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md).
