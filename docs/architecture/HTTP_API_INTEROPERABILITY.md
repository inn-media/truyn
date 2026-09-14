# TRUYN HTTP / API Interoperability Architecture

**Status:** First-class interface architecture defined; bounded HTTP primitives implemented; full generic REST interoperability remains an implementation track.  
**Snapshot:** 2026-09-14  
**Protocol:** `TRUYN/1` draft

TRUYN treats HTTP/API as a **first-class interoperability interface family** alongside NLWeb, MCP and A2A.

Canonical positioning:

> **TRUYN is protocol-agnostic connectivity infrastructure supporting HTTP/API, NLWeb, MCP and A2A interoperability.**

More precisely:

> **TRUYN connects services and agents across HTTP APIs, NLWeb, MCP and A2A through a shared discovery, routing and resilient delivery fabric.**

HTTP/API does not replace NLWeb, MCP or A2A. Each interface type solves a different interaction problem while TRUYN provides shared discovery, eligibility, routing, transport, security and provenance around them.

## Interface model

| Interface | Primary role | Example |
|---|---|---|
| **HTTP / REST API** | Classical programmatic request/response interaction | `GET /articles`, `POST /search`, JSON request/response |
| **NLWeb** | Natural-language discovery and information access | “Show the latest news about SOCAR” |
| **MCP** | AI model invokes tools/resources | model calls a tool exposed by a provider |
| **A2A** | Agent-to-agent interaction and task lifecycle | one autonomous agent delegates work to another |
| **TRUYN** | Finds, connects, authorizes, routes and delivers across these surfaces | discovery → eligible endpoint → resilient execution |

A useful mental model is:

- **API** answers: “How does an application call a function or resource?”
- **NLWeb** answers: “How can a user or agent ask for information semantically?”
- **MCP** answers: “How does an AI model invoke a capability?”
- **A2A** answers: “How do agents communicate and coordinate?”
- **TRUYN** answers: “How do these endpoints discover each other and connect reliably under one network fabric?”

## Canonical architecture

```text
application / agent / model
          │
          ├── HTTP / REST API
          ├── NLWeb
          ├── MCP
          └── A2A
          │
          ▼
┌───────────────────────────────┐
│ TRUYN interoperability edges │
│                               │
│ interface/profile validation  │
│ capability normalization      │
│ identity correlation          │
│ auth/policy boundary          │
└──────────────┬────────────────┘
               │
               ▼
        TRUYN discovery
        eligibility / policy
        selection / routing
        relay / resilient delivery
        provenance / trust
               │
               ▼
       provider / service edge
          │       │       │
          ▼       ▼       ▼
        HTTP    MCP/A2A  NLWeb
         API     agent    endpoint
```

HTTP/API is an interoperability edge, not a new `TRUYN/1` wire dependency. TRUYN native discovery and routing remain authoritative for network behavior.

## Domain-semantics boundary

TRUYN must understand **how to discover and invoke an API endpoint**, but it must not own the endpoint's business semantics.

TRUYN may know facts such as:

- an endpoint exists;
- it uses HTTP or HTTPS;
- it exposes one or more capabilities;
- which methods/profile/schema constraints are supported;
- how it is authenticated;
- whether it is visible and eligible to the requester;
- its health, trust and routing metadata;
- how to deliver a bounded request and return a bounded response.

TRUYN must **not** define what application-specific paths or entities mean. For example, the TRUYN core must not define the business meaning of:

- `/publishers`;
- `/licenses`;
- `/campaigns`;
- `/articles`;
- `/orders`;
- `/customers`;
- product-specific or publisher-specific resource models.

Those paths and schemas belong to the API owner/application layer. TRUYN transports and interoperates with them through explicit contracts.

Canonical invariant:

> **TRUYN knows that an HTTP/API capability exists and how to reach it; the application owns what that API means.**

## Current implemented HTTP foundations

HTTP support is already materially present in the public repository, but the current pieces have different scopes.

### 1. Generic custom HTTP provider

`adapters/providers/custom-http.js` already:

- accepts an absolute `http://` or `https://` endpoint;
- supports `none` or bearer authentication;
- advertises configured TRUYN capabilities;
- sends bounded JSON execution input;
- accepts JSON or text responses;
- returns provider request/latency/usage metadata where available.

The current provider is intentionally bounded: it performs a fixed JSON `POST` execution shape. It is **not yet** a general arbitrary REST client supporting every method/path/query/header/schema combination.

### 2. HTTP relay transport

`network/transport/http-relay.js` already provides HTTP-based relay delivery for signed TRUYN envelopes, including relay submission, polling, result collection, timeout handling and envelope verification.

This proves that HTTP is already a real TRUYN transport surface, but relay HTTP is distinct from generic external REST/API interoperability.

### 3. TRUYN HTTP adapter server

`adapters/http/server.js` already exposes a bounded local HTTP interface into a TRUYN node, including:

- `GET /health`;
- `GET /v1/identity`;
- `GET /v1/offers`;
- `POST /v1/offer`;
- `POST /v1/need`;
- `GET /v1/events`;
- `POST /v1/result`.

The reference server is local-only by design and requires an authenticated gateway for remote exposure.

### 4. Adapter documentation

`adapters/README.md` already lists generic HTTP alongside OpenAI-compatible, Anthropic, Azure OpenAI, Vertex Gemini, MCP and A2A adapter surfaces.

These existing primitives justify treating HTTP/API as a first-class architectural surface today while keeping stronger generic REST claims gated on implementation evidence.

## First-class HTTP/API contract

A complete first-class HTTP/API interoperability layer should support the following bounded concepts without absorbing application semantics.

### Endpoint description

An eligible API endpoint should be representable through explicit descriptor/capability metadata such as:

- interface type: `http-api`;
- base URL or explicitly allowed absolute endpoint;
- supported method(s);
- path or operation identifier;
- content types;
- request/response size limits;
- auth profile identifier without embedding authority in payload metadata;
- timeout/retry/idempotency constraints;
- capability mapping;
- health/profile/version information.

Exact machine-readable schema remains an implementation contract and must not be invented as normative wire semantics before code/spec review.

### Request mapping

The eventual generic API adapter should be able to map a bounded TRUYN capability invocation to explicitly allowed HTTP request components:

- method;
- path;
- query parameters;
- selected headers;
- body;
- accepted response content types.

The mapping must be explicit and policy-bounded. Arbitrary user-controlled URL fetch is not a valid default.

### Discovery

HTTP/API providers participate in the same TRUYN discovery model as other interfaces:

```text
capability request
      ↓
TRUYN discovery
      ↓
eligible provider candidates
      ↓
interface constraint: HTTP/API
      ↓
selection
      ↓
HTTP/API invocation
```

An HTTP endpoint being reachable does not make it authorized or discoverable.

### Routing and resilience

HTTP/API execution should inherit normal TRUYN routing and resilience rules where semantically valid:

- bounded retry behavior;
- timeout/cancellation;
- health-aware selection;
- correlation/provenance;
- no duplicate application side effects where idempotency/exactly-once behavior is claimed;
- fail-closed behavior on unsupported method/profile/schema requirements.

### Authentication and authority

HTTP credentials are adapter/runtime-local transport credentials. They never become TRUYN account, tenant, provider-owner, entitlement or billing authority.

Authorization and commercial policy must be resolved by the normal TRUYN authority path before chargeable or protected provider execution.

## Relationship to NLWeb, MCP and A2A

The interfaces are peers, not a hierarchy:

```text
HTTP/API ─┐
NLWeb    ─┼─→ TRUYN discovery / policy / routing / delivery
MCP      ─┤
A2A      ─┘
```

Bridges may be implemented where semantics can be preserved, for example:

- `NLWeb → TRUYN → HTTP/API`;
- `MCP → TRUYN → HTTP/API`;
- `A2A → TRUYN → HTTP/API`;
- `HTTP/API → TRUYN → MCP/A2A/NLWeb` where an explicit mapping exists.

A bridge must never invent authority, silently drop required semantics or duplicate side effects.

## Security invariants

HTTP/API support must preserve these invariants:

- no arbitrary SSRF-style URL fetching from untrusted request payloads;
- endpoint allowability is server-side policy, not requester authority;
- private endpoints remain undiscoverable to unauthorized requesters;
- credentials remain adapter/runtime-local and are not copied into TRUYN payloads;
- method/path/header mappings are explicitly bounded;
- response sizes/content types are bounded and validated;
- redirects are either forbidden or explicitly policy-controlled;
- retry semantics respect idempotency and cannot silently duplicate remote writes;
- unauthorized requests cause zero protected/paid upstream execution;
- HTTP response metadata never becomes account/tenant/provider/billing authority.

## Development gates

### HAPI-0 — Architecture and boundary

- [x] define HTTP/API as a first-class interoperability interface alongside NLWeb, MCP and A2A;
- [x] preserve application/domain semantics outside TRUYN;
- [x] inventory existing generic HTTP provider, HTTP relay and HTTP adapter server primitives;
- [x] distinguish existing bounded HTTP support from full generic REST interoperability.

### HAPI-1 — Descriptor and capability model

- [ ] define bounded HTTP/API interface metadata in Agent Descriptor/capability surfaces;
- [ ] support explicit method/path/content-type/profile declarations;
- [ ] define fail-closed version/profile behavior where needed;
- [ ] ensure HTTP/API metadata is non-authoritative.

### HAPI-2 — Generic request mapping

- [ ] extend beyond the current fixed custom-HTTP JSON `POST` shape;
- [ ] bounded method/path/query/header/body mapping;
- [ ] explicit response normalization and size/content-type limits;
- [ ] explicit redirect and URL policy;
- [ ] cancellation/timeout behavior.

### HAPI-3 — Discovery and routing

- [ ] discover eligible HTTP/API providers through normal TRUYN discovery;
- [ ] select only from authorized/visible candidates;
- [ ] route API-originated/API-destined work through normal TRUYN policy and relay paths;
- [ ] expose bounded health/capability information.

### HAPI-4 — Authentication / policy / side-effect safety

- [ ] adapter-local credential profiles;
- [ ] server-side provider/tenant/entitlement authority;
- [ ] idempotency/retry policy for mutating HTTP methods;
- [ ] negative tests proving zero unauthorized upstream execution;
- [ ] SSRF, redirect and private-network safety tests.

### HAPI-5 — Cross-interface bridges

- [ ] bounded NLWeb ↔ HTTP/API mappings where semantics are explicit;
- [ ] bounded MCP ↔ HTTP/API mappings;
- [ ] bounded A2A ↔ HTTP/API mappings;
- [ ] document unsupported/lossy mappings instead of silently translating them.

### HAPI-6 — External conformance

- [ ] independent HTTP/API provider black-box tests;
- [ ] method/path/query/header/body/response compatibility matrix;
- [ ] adversarial auth/SSRF/redirect/retry/idempotency tests;
- [ ] durable evidence for claimed first-class REST/API interoperability.

## Acceptance boundary

TRUYN can already truthfully claim **bounded HTTP support** because generic HTTP provider, relay and server surfaces exist in the repository.

TRUYN should not claim arbitrary/full REST interoperability until HAPI implementation and conformance gates prove the broader method/path/schema/security contract.

The architectural claim accepted by this document is:

> **HTTP/API is a first-class TRUYN interoperability surface, and the existing bounded HTTP primitives are the implementation foundation for completing that surface.**
