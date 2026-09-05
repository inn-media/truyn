# TRUYN A2A / MCP Bounded Pre-v1 Compatibility Promise

**Status:** bounded pre-v1 compatibility promise; **not** a stable-v1 guarantee.  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**TRUYN protocol:** `TRUYN/1` — draft  
**A2A tested/supported profile:** `1.0` over JSON-RPC  
**MCP tested modern profile:** `2026-07-28`  
**MCP legacy inbound facade profiles:** `2025-11-25`, `2025-06-18`  
**Canonical machine-readable declaration:** `adapters/compatibility/a2a-mcp.js`

This document defines the interoperability-specific compatibility promise for the current pre-v1 TRUYN A2A/MCP adapters. It complements `SDK_COMPATIBILITY.md`; it does not replace SDK/package SemVer, Agent Descriptor versioning, or TRUYN protocol versioning.

The word **stable** is intentionally not used as a current product claim. `TRUYN/1` remains draft. Generation `a2a-mcp-pre-v1/g1` means that the tested profiles and migration rules below are declared and executable, while a future incompatible profile may still require a new compatibility generation before TRUYN protocol stable-v1.

## 1. Version dimensions

These dimensions are independent:

```text
SDK package version
SDK API contract version
TRUYN protocol generation
Agent Descriptor version
A2A/MCP compatibility generation
external A2A/MCP protocol version
```

A package version alone never proves A2A/MCP compatibility. Interoperability is allowed only when the declared protocol/version/surface overlap exists and required semantics are understood.

## 2. Declared A2A profile

Generation `g1` promises the bounded A2A `1.0` JSON-RPC profile used by the accepted C3–C7 and Sprint C/E evidence.

Promised surfaces:

- Agent Card discovery/validation;
- JSON-RPC `SendMessage` execution;
- bounded `GetTask` polling lifecycle;
- bounded Artifact mapping;
- explicit referenced-artifact resolution with integrity verification;
- request/message/task correlation preservation;
- authoritative TRUYN provider provenance;
- fail-closed authorization/provider-owner/billing boundaries;
- exactly-once remote execution for the accepted bridge profile.

The A2A promise does **not** currently include:

- arbitrary future A2A protocol versions;
- full semantic parity for every streaming mode;
- full push-notification semantic parity;
- every optional A2A extension/security scheme;
- a claim that every third-party A2A implementation is certified.

## 3. Declared MCP profile

### Import/provider direction

The TRUYN MCP import/provider profile promises the modern tested protocol `2026-07-28` for:

- discovery;
- `tools/list`;
- `tools/call`;
- explicitly selected TRUYN import/provider mapping;
- the bounded Sprint E `resource_link` + `resources/read` referenced-artifact resolver profile.

Legacy MCP versions are **not** silently promoted into the outbound/import promise merely because the TRUYN MCP facade can accept them.

### TRUYN MCP facade/server direction

The current facade declares these accepted inbound protocol versions:

- `2026-07-28` — modern profile;
- `2025-11-25` — legacy initialize/tool profile;
- `2025-06-18` — legacy initialize/tool profile.

The runtime declaration is authoritative: `MCP_SUPPORTED_VERSIONS` and the compatibility manifest must remain aligned in CI.

The MCP promise does **not** currently include arbitrary optional resources, arbitrary prompts, MCP Apps/extensions, subscriptions, or a general `MCP resources → TRUYN OBJECT/STATE` semantic mapping. Sprint E proves one bounded referenced-resource resolver path only.

## 4. Version negotiation rules

Compatibility negotiation is fail closed.

| Input | Required behavior |
|---|---|
| supported declared version + supported required semantics | execute |
| declared legacy version on a direction where it is explicitly supported | execute |
| unsupported required version | deterministic compatibility error |
| unknown optional field/semantic | may ignore without changing authority |
| unknown required semantic | deterministic fail closed |
| missing required version | deterministic compatibility error |
| MCP modern header/body version mismatch | fail closed |
| A2A Agent Card without JSON-RPC `1.0` overlap | fail closed |

The machine-readable negotiation helper returns explicit `INTEROP_*` compatibility error codes. Existing protocol facades keep their protocol-native errors as well; for example unsupported MCP versions return the established `-32022` compatibility error.

Unknown optional metadata may never be interpreted as an authorization, provider-ownership, billing, provenance, or execution grant.

## 5. Immutable security/correctness semantics within generation g1

Within the same immutable adapter/release version and the same declared compatibility generation, TRUYN must not silently change the meaning of:

- correlation semantics;
- artifact integrity semantics;
- authorization boundary;
- provider ownership authority;
- billing authority;
- exactly-once remote execution guarantees.

A security fix may become stricter without a new generation when it only rejects behavior that was already outside the declared promise. A change that redefines a promised successful interaction, authority source, integrity rule, or required correlation rule is compatibility-breaking and requires the migration process below.

## 6. Breaking-change rule

An incompatible A2A/MCP profile change must not be hidden inside the same immutable release/profile declaration.

A breaking change requires all of:

1. a new declared A2A/MCP compatibility generation or explicit supported-version/range change;
2. an immutable package/adapter version change where released artifacts are affected;
3. release notes describing the break;
4. a migration note describing old → new behavior;
5. executable conformance evidence for both accepted and rejected paths;
6. exact external SDK/reference versions for any black-box evidence;
7. re-validation of authorization, provenance, artifact-integrity, correlation and exactly-once invariants.

Lossless dual-profile support is allowed when both profiles remain independently testable and security-equivalent. Silent heuristic translation of unknown required semantics is forbidden.

## 7. Deprecation and migration

Pre-v1 profiles may evolve faster than stable-v1, but migrations are explicit.

For a superseded compatibility profile:

- mark the old profile deprecated in this contract and the machine-readable declaration;
- state its replacement generation/version range;
- publish a migration note;
- retain executable conformance for the overlap window where support is claimed;
- remove the old profile only in a declared incompatible generation/release change, unless an emergency security issue requires earlier rejection;
- never use deprecation to broaden requester identity, provider visibility, provider ownership, billing responsibility, credential exposure, or URL-resolution authority.

## 8. Referenced artifact compatibility contract

After Sprint E, generation `g1` promises that the accepted referenced-artifact profile preserves:

- `mediaType` / MIME type;
- filename;
- exact byte size;
- SHA-256 digest;
- authoritative TRUYN provenance;
- explicit resolution semantics.

Referenced content is materialized only through an explicit resolver. An absent resolver fails closed. Digest or size mismatch fails closed. Implicit arbitrary URL fetching remains outside the promise.

The durable external black-box authority for this profile is `A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`. The compatibility promise does not weaken C6/Sprint E integrity rules.

## 9. Executable compatibility matrix

This policy is not Markdown-only. `tests/a2a-mcp-compatibility-promise.test.js` enforces the declared generation against runtime constants and negotiation behavior.

Required executable rows:

| Gate | Expected |
|---|---|
| A2A `1.0` + declared required semantics | PASS |
| unknown optional A2A semantic | PASS / ignored |
| unsupported A2A required version | deterministic FAIL |
| MCP `2026-07-28` import profile | PASS |
| declared legacy MCP facade version | PASS |
| legacy MCP version used as undeclared import profile | deterministic FAIL |
| completely unsupported MCP version | protocol-native deterministic FAIL |
| unknown required interoperability semantic | deterministic FAIL |
| compatibility declaration vs runtime constants | PASS |
| referenced artifact metadata + explicit resolver + SHA-256/size | PASS |
| missing resolver/corrupt referenced artifact | FAIL in Sprint E black-box suite |
| positive external remote execution | exactly once in Sprint C/D/E evidence |

The repository-wide `npm test` gate composes this compatibility test with the existing A2A/MCP C-series tests and independent Sprint C/D/E black-box tests. A green compatibility-policy unit test cannot substitute for a failing external interoperability proof.

## 10. Evidence required for a compatibility-generation change

Every generation change must record:

- exact source SHA;
- compatibility generation;
- TRUYN protocol status/generation;
- A2A supported/tested versions;
- MCP import/facade supported/tested versions;
- exact external SDK versions used for black-box evidence;
- CI run ID;
- CodeQL run ID;
- artifact/evidence digest where applicable;
- exactly-once counters where remote execution is involved;
- migration/deprecation notes;
- limitations and explicitly unsupported surfaces.

## 11. Graduation to a stable A2A/MCP guarantee

Generation `g1` is a **bounded pre-v1 compatibility promise**, not stable-v1.

The wording may be promoted to **Stable A2A/MCP compatibility guarantee** only after the repository separately declares the relevant TRUYN protocol generation stable and the stable ecosystem gates require the same version ranges, conformance matrix, migration/deprecation rules, immutable release provenance, and accepted external interoperability evidence.

Until then, the correct claim is:

> TRUYN declares and CI-enforces bounded pre-v1 A2A/MCP compatibility profiles with explicit fail-closed negotiation and migration rules.
