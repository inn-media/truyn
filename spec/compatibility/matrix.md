# Compatibility Matrix

This file records current compatibility expectations without collapsing software, protocol, storage and SDK release versions into one number.

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
| `0.1.0-alpha.1` (`0.1.0a1` on PyPI) | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | five-language source/build/conformance proven; native public registry publication not yet evidenced |

SDK package version and stable SDK API version are independent from protocol-generation stability.

## Rules

- Software version, SDK version, stable SDK API contract, protocol generation, wire schema and storage schema are independent dimensions.
- A node MUST negotiate/recognize a supported protocol generation before exchanging semantic payloads.
- A first-party SDK MUST validate/declare compatible protocol and Agent Descriptor versions rather than infer compatibility from its package version alone.
- Unsupported required protocol/Descriptor semantics fail explicitly; clients must not silently guess or downgrade them.
- Backward-compatible optional fields may be added inside a generation only when semantics remain compatible.
- Breaking network semantic changes require a new protocol generation or explicit extension negotiation.
- Storage/config migrations are local implementation concerns and MUST NOT silently change network identity.
- Implemented/CI-proven/bounded interoperability evidence does not by itself create a stable compatibility promise.
- Native package build/provenance does not by itself prove public registry availability.

See `../../docs/compatibility/README.md`, `../../docs/compatibility/SDK_COMPATIBILITY.md` and `../../docs/architecture/IMPLEMENTATION_STATUS.md` for the current factual maturity boundary.
