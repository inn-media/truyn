# Adapters

Adapters connect external agents, models, runtimes and protocols to TRUYN. **Adapters are edges; they are not the TRUYN network itself.**

**Snapshot:** 2026-09-14  
**Protocol:** `TRUYN/1` draft  
**A2A/MCP compatibility generation:** `a2a-mcp-pre-v1/g1`

## First-class interoperability surfaces

TRUYN treats the following as peer interface families at the interoperability edge:

| Interface | Primary interaction model |
|---|---|
| **HTTP / REST API** | classical programmatic request/response |
| **NLWeb** | natural-language discovery and information access |
| **MCP** | AI model invokes tools/resources |
| **A2A** | agent-to-agent interaction and task lifecycle |

Canonical positioning:

> **TRUYN connects services and agents across HTTP APIs, NLWeb, MCP and A2A through a shared discovery, routing and resilient delivery fabric.**

These interface families do not replace one another. TRUYN discovers eligible capabilities, applies the normal authority boundary, selects/routes work and returns results while each external interface retains its own semantics.

## Implemented bounded surfaces

The repository contains provider/protocol adapters for OpenAI/OpenAI-compatible, Anthropic, Azure OpenAI, Vertex Gemini, **generic HTTP**, MCP server/client/discovery/import and A2A server/client/polling/artifact-integrity paths. Provider availability and entitlement remain independent from adapter implementation.

HTTP is already materially implemented in three distinct bounded forms:

- `providers/custom-http.js` — generic custom HTTP/HTTPS JSON provider with capability mapping and adapter-local auth;
- `../network/transport/http-relay.js` — HTTP relay transport for signed TRUYN envelopes;
- `http/server.js` — local HTTP server surface into a TRUYN node.

This is enough to treat HTTP/API as a first-class architecture surface, but the existing `custom-http` provider is still a fixed JSON `POST` execution shape rather than a complete arbitrary REST client. General method/path/query/header/body/schema interoperability remains tracked in the HAPI roadmap gates.

See `../docs/architecture/HTTP_API_INTEROPERABILITY.md`.

## Domain-semantics boundary

TRUYN should know that an HTTP/API endpoint exists, which capability it exposes, how it may be reached and whether it is eligible. TRUYN should **not** define application-specific resource semantics such as `/publishers`, `/licenses`, `/campaigns`, `/articles` or product-specific data models.

Those belong to the API/application owner. HTTP/API metadata is interoperability metadata, not account, tenant, provider-owner, entitlement or billing authority.

## A2A / MCP accepted profile

C1–C8, independent official A2A/MCP black-box proofs, **P2-E1 / Sprint E** referenced-artifact interoperability, **P2-E2** compatibility generation `a2a-mcp-pre-v1/g1`, and **P2-E3** canonical documentation reconciliation are accepted.

Every execution-capable adapter — HTTP/API, NLWeb, MCP or A2A — must preserve TRUYN account/provider/grant/entitlement/billing authority, explicit protocol/profile handling, correlation integrity, bounded payload/artifact handling, explicit-only reference resolution and exactly-once/idempotent side-effect rules where claimed.

A public adapter endpoint never implies public provider access.

**Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

See `../docs/architecture/HTTP_API_INTEROPERABILITY.md`, `../docs/architecture/NLWEB_INTEROPERABILITY.md`, `../docs/architecture/A2A_MCP_INTEROPERABILITY.md`, `../docs/compatibility/A2A_MCP_COMPATIBILITY.md`, `../docs/compatibility/A2A_MCP_STABILITY.md` and `../docs/architecture/IMPLEMENTATION_STATUS.md`.
