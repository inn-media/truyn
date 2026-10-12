# Compatibility Matrix

This file records current compatibility expectations without collapsing software, protocol, storage and SDK release versions into one number.

## P11 frozen protocol negotiation decisions

The release-candidate **version/required-semantic compatibility decision table** is frozen as [P11 matrix](P11_VERSION_NEGOTIATION_MATRIX.md), with the [machine-readable RC1 vectors](p11-negotiation-matrix.json) exercised by `tests/protocol-v1-compatibility-matrix.test.js`. It covers shared generation selection, safe protocol fallback, optional overlap and fail-closed mismatch/required semantics. This is a **stable matrix revision, not a Stable TRUYN/1 declaration**; real TRUYN/2 interoperability and cross-generation per-semantic evidence are not claimed.

## Current repository line

| Software | TRUYN/1 | TRUYN/2 | Storage schema | Notes |
|---|---:|---:|---|---|
| `0.1.0-mvp.2` | draft / implemented reference generation | no | draft | active reference implementation with bounded CI/WAN/interoperability evidence; no stable protocol/mainnet compatibility promise |

The old `0.1.0-dev` “architecture/protocol skeleton” row is obsolete for implementation maturity. `TRUYN/1` itself is still draft, so implemented reference behavior must not be misread as a stable-v1 network compatibility guarantee.

## A2A / MCP bounded pre-v1 line

| Direction / profile | Exact external profile | Runtime surface | Status |
|---|---|---|---|
| A2A bounded g1 | `1.0` JSON-RPC | Agent Card, SendMessage, GetTask, bounded Artifact mapping + accepted extended exact-version profiles | implemented / CI-evidenced, pre-v1 |
| MCP import/tools g1 | `2026-07-28` | discovery, `tools/list`, `tools/call`, selected TRUYN import mapping | implemented / CI-evidenced, pre-v1 |
| MCP referenced artifact | `2026-07-28` | explicit `resource_link -> resources/read` with integrity verification | implemented / external black-box evidenced, pre-v1 |
| MCP P3-M1 general resources | `2026-07-28`; official black-box `@modelcontextprotocol/server@2.0.0` | bounded `resources/list`, `resources/templates/list`, explicit `resources/read -> OBJECT/STATE`, `subscriptions/listen` invalidation + explicit reread | implemented / exact-head acceptance gated, pre-v1 |
| MCP P3-M2 Prompts | `2026-07-28`; official black-box `@modelcontextprotocol/server@2.0.0` | bounded `prompts/list`, explicit `prompts/get -> immutable OBJECT`, `promptsListChanged` invalidation + explicit refresh, explicit-only MRTR continuation | implemented / exact-head acceptance gated, pre-v1 |
| MCP facade legacy tool profiles | `2025-11-25`, `2025-06-18` | legacy initialize/tool facade only | implemented / bounded legacy inbound support |

P3-M1 does not promote legacy MCP versions into outbound/import resource support or add arbitrary TRUYN -> MCP Resource publication. P3-M2 likewise does not promote legacy outbound/import Prompts, does not add prompt facade publication, automatic prompt execution, `completion/complete`, or Apps/extensions. See `../../docs/compatibility/MCP_GENERAL_RESOURCE_SEMANTICS.md` and `../../docs/compatibility/MCP_PROMPT_SEMANTICS.md`.

## First-party SDK line

| SDK line | Stable SDK API | TRUYN protocol | Agent Descriptor | Publication state |
|---|---:|---|---|---|
| npm `@truyn/sdk@0.1.0-alpha.5` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |
| PyPI `truyn-sdk==0.1.0a2` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |
| Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |
| Maven `org.truyn:truyn-sdk:0.1.0-alpha.2` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |
| NuGet `Truyn.Sdk@0.1.0-alpha.2` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |

npm `@truyn/sdk@0.1.0-alpha.1` remains immutable historical failed evidence and is superseded without overwrite. SDK package version and stable SDK API version are independent from protocol-generation stability.

## Frozen bounded RC profile (not Stable TRUYN/1)

The supported reference profile preserves five signed JSON message kinds (`IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE`), Ed25519 over TCJ1 bytes with no extra prefix, identity/key binding and the separately specified compact `PARTIAL` lifecycle. The A–I semantic registry does not add mandatory top-level JSON types. P11 overlap/required-semantic outcomes are frozen in `p11-negotiation-matrix.json` and `P11_VERSION_NEGOTIATION_MATRIX.md`.

Current five-language prereleases are bound to frozen source `57971b134a41c3e3ea4b42f68e86a7d117036006` and the [registry acceptance record](../../docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md). [P1–P14 reconciliation](../../docs/compatibility/TRUYN1_RC_GAP_LEDGER.md) separates existing normative/runtime/tests from independent release acceptance. P1–P5, P10 and the bounded P12 reference profile have their cited scope-specific acceptance; P6–P9/P11 final release qualification, P13-FORMAT and P14 admission remain separate. P13-OPS applies to managed service/Mainnet, not the protocol-only format gate.

## Rules

- Software version, SDK version, stable SDK API contract, protocol generation, wire schema and storage schema are independent dimensions.
- A node MUST negotiate/recognize a supported protocol generation before exchanging semantic payloads.
- A first-party SDK MUST validate/declare compatible protocol and Agent Descriptor versions rather than infer compatibility from its package version alone.
- Unsupported required protocol/Descriptor semantics fail explicitly; clients must not silently guess or downgrade them.
- Backward-compatible optional fields may be added inside a generation only when semantics remain compatible.
- Breaking network semantic changes require a new protocol generation or explicit extension negotiation.
- Storage/config migrations are local implementation concerns and MUST NOT silently change network identity.
- Implemented/CI-proven/bounded interoperability evidence does not by itself create a stable compatibility promise.
- Package build/provenance does not by itself prove public registry availability; accepted registry state below is backed by independent public evidence. npm alpha.5, PyPI alpha and Go alpha are separately accepted from observed immutable public evidence, while Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.2` is an **accepted immutable public release**. NuGet.org `Truyn.Sdk 0.1.0-alpha.2` is an accepted immutable public prerelease.

See `../../docs/compatibility/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/IMPLEMENTATION_STATUS.md` for the current factual maturity boundary.
