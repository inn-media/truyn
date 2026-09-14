# TRUYN NLWeb Interoperability Architecture

**Status:** Planned / roadmap architecture; no NLWeb compatibility claim is currently accepted.  
**Snapshot:** 2026-09-14  
**Protocol:** `TRUYN/1` draft

NLWeb is an external natural-language web interoperability edge around TRUYN. It is **not** a replacement for TRUYN transport, identity, authority, routing, provenance or Trustability, and it is not a new `TRUYN/1` wire dependency.

TRUYN's role is to discover eligible NLWeb-compatible endpoints, connect to them, transport bounded requests, route/relay them under the same authority rules as other execution-capable edges, and return normalized results with TRUYN correlation/provenance metadata.

The implementation goal is:

> **TRUYN can transport and interoperate with NLWeb.**

A stronger architectural opportunity exists at the discovery layer:

> **NLWeb `who` can act as a semantic discovery interface to the TRUYN network; TRUYN can act as the distributed discovery, selection, execution and transport fabric behind NLWeb `who` and `ask`.**

It is explicitly **not**:

> TRUYN becomes an NLWeb application stack, search engine, publisher database, rights system or content graph.

## Upstream model

NLWeb exposes natural-language interaction semantics around structured web data. The upstream protocol currently centers on `ask`, while the NLWeb Agent Finder work defines `who` for discovering agents/sites/tools able to answer a natural-language question. NLWeb implementations also expose MCP compatibility.

TRUYN must pin and test an exact upstream NLWeb protocol/profile when implementation begins. Until executable conformance evidence exists, this repository must describe NLWeb support as **planned**, not implemented or compatible.

Upstream references:

- https://nlweb.ai/
- https://github.com/nlweb-ai/NLWeb
- https://github.com/nlweb-ai/nlweb-typespec
- https://github.com/nlweb-ai/AgentFinder

## Semantic discovery architecture — `who` × TRUYN discovery

The strategic role of `who` is larger than ordinary endpoint compatibility. `who` can provide a natural-language semantic discovery surface over TRUYN's distributed capability discovery.

Canonical composition:

```text
NLWeb WHO
   │
   │ semantic intent
   ▼
TRUYN discovery
   │
   │ capability / policy / visibility filtering
   ▼
eligible providers / agents / endpoints
   │
   │ selection
   │ reference selector: capability + trust + health + policy
   │ managed selector: optional richer ranking/history/reputation
   ▼
best eligible endpoint(s)
   │
   ▼
NLWeb ASK
   │
   ▼
TRUYN routing / relay / execution
   │
   ▼
application/provider layer
   │
   ├── Data Graph
   ├── Exchange
   ├── publisher service
   ├── enterprise service
   └── other external provider
```

The canonical division of responsibility is:

> **NLWeb provides semantic discovery and interaction semantics; TRUYN provides distributed discovery, eligibility filtering, selection, execution and transport.**

`who` answers a semantic question such as **“Who can answer questions about Azerbaijani energy news?”**. TRUYN then resolves that intent against the currently visible network capabilities and returns only eligible candidates. A selector chooses one or more candidates, after which `ask` can invoke the selected endpoint through the normal TRUYN authority and routing path.

This is not equivalent to making NLWeb the internal TRUYN discovery protocol. The TRUYN network continues to own its native identity, descriptors, OFFER/capability state, DHT/discovery mechanisms, trust signals, health and routing. `who` is an **external semantic query surface** that can compile into those native discovery constraints.

Likewise, TRUYN does not need to understand the internal data model of a Data Graph, Exchange, publisher CMS or other application reached after selection. Those systems are possible destinations/providers, not discovery authority.

### Semantic discovery contract

A future bounded implementation should preserve this separation:

1. receive an NLWeb `who` query and its accepted profile/version;
2. normalize the natural-language intent into bounded discovery constraints without granting authority;
3. query TRUYN-visible capabilities/providers/agents;
4. apply authorization and visibility filtering **before** returning candidates;
5. rank/select only from the eligible candidate set;
6. return NLWeb-compatible discovery output with correlation/provenance metadata where the selected profile supports it;
7. optionally compose the selected candidate into a subsequent `ask` request;
8. route `ask` through the normal TRUYN authenticate → authorize → entitlement/billing → dispatch path.

`who` may influence **what capability is being sought**. It must never decide **who the requester is, which tenant owns an endpoint, whether the requester is authorized, or who pays for execution**.

### Selection model

TRUYN Open must include a deterministic/reference selection path so NLWeb semantic discovery remains useful without the private platform. That selector may use public/open signals such as capability match, explicit policy, bounded trust status and current health.

TRUYN Platform may optionally provide richer managed selection using proprietary global/history signals, reputation, latency/failure history, abuse intelligence or commercial policy. That managed ranking is an optimization over the eligible set, not a replacement for public protocol semantics and not an authorization source.

## Architectural placement

```text
NLWeb client / site / agent
          │
      ask / who
          │
          ▼
┌──────────────────────────┐
│ TRUYN NLWeb adapter edge │
│                          │
│ version/profile check    │
│ identity correlation     │
│ auth/policy passthrough  │
│ bounded normalization    │
│ semantic discovery map   │
│ capability advertisement│
└────────────┬─────────────┘
             │
             ▼
      TRUYN discovery
      eligibility / selection
      routing / relay
      NEED / RESULT
      provenance / trust
             │
      ┌──────┴──────┐
      ▼             ▼
  TRUYN node    other edges
               MCP / A2A / HTTP
```

A2A, MCP and NLWeb remain external interoperability profiles. None of them can redefine TRUYN authority or billing ownership.

## Public/open implementation scope

The NLWeb interoperability program belongs in TRUYN Open and is expected to include:

1. **NLWeb client adapter**
   - call compatible `ask` endpoints;
   - call compatible `who`/Agent Finder discovery surfaces where the accepted profile supports them;
   - normalize successful structured responses into bounded TRUYN results;
   - preserve upstream request/response correlation and version metadata.

2. **NLWeb provider/edge adapter**
   - expose explicitly eligible TRUYN-backed capabilities through a compatible NLWeb edge;
   - remain private-by-default unless provider policy explicitly allows exposure;
   - never convert endpoint reachability into provider authorization.

3. **Discovery**
   - discover NLWeb-compatible endpoints from explicit configuration, accepted descriptors or bounded discovery mechanisms;
   - advertise NLWeb compatibility through TRUYN capability/descriptor metadata without making NLWeb a TRUYN capability itself;
   - filter all discovery by the same visibility and authorization boundary used by other TRUYN provider surfaces;
   - compile bounded `who` semantic intent into native TRUYN discovery/capability constraints.

4. **`ask` interoperability**
   - translate a bounded natural-language `ask` request into an authorized TRUYN execution flow when appropriate;
   - preserve result structure rather than flattening all NLWeb data into opaque text;
   - keep external protocol metadata namespaced and non-authoritative.

5. **`who` semantic discovery interoperability**
   - expose `who` as a semantic discovery surface over TRUYN discovery;
   - support natural-language discovery of eligible endpoints/capabilities;
   - return candidates only after TRUYN visibility/authorization filtering;
   - support reference selection of one or more eligible endpoints;
   - preserve a clean handoff from `who` discovery output to a subsequent `ask` execution;
   - never reveal private providers, internal deployment names, backchannels, tenant topology or billing information.

6. **Routing / relay**
   - route NLWeb-originated work through the normal TRUYN discovery/authorization/dispatch path;
   - support NLWeb destination selection as an interoperability constraint, not a bypass around TRUYN matching or security;
   - maintain exactly-once remote application semantics where the selected underlying TRUYN profile claims them.

7. **Auth / policy passthrough**
   - keep NLWeb transport credentials adapter-local;
   - resolve TRUYN requester/provider/tenant/billing authority server-side;
   - reject spoofed owner/tenant/provider/billing fields;
   - ensure an unauthorized NLWeb request produces zero upstream paid-provider execution.

8. **Health and capability advertisement**
   - expose bounded health/profile metadata for compatibility decisions;
   - advertise supported NLWeb profile/version, operations and response constraints;
   - fail closed on required-semantic or version incompatibility.

9. **Bridges**
   - provide an explicit `NLWeb → TRUYN → MCP` compatibility path where semantics can be preserved;
   - evaluate `MCP/A2A → TRUYN → NLWeb` as a bounded compatibility bridge;
   - bridge only semantics that can be represented without inventing authority, silently dropping required fields or duplicating side effects.

10. **Conformance and adversarial compatibility tests**
    - NLWeb `ask` client/provider black-box tests;
    - NLWeb `who` semantic-discovery tests;
    - `who → TRUYN discovery → candidate selection → ask` composition tests;
    - `NLWeb ↔ TRUYN` round-trip tests;
    - bounded `NLWeb ↔ MCP` and `NLWeb ↔ A2A` bridge tests;
    - malformed/version-mismatch/replay/correlation tests;
    - private-provider discovery leakage tests;
    - unauthorized-call tests proving provider execution count remains zero.

## Explicit non-goals

The following do **not** belong in the TRUYN NLWeb compatibility layer:

- web crawling or publisher ingestion pipelines;
- indexing and search-index lifecycle;
- vector databases or embedding stores;
- RAG corpus ownership;
- brand/product/news content models;
- publisher content storage;
- publisher/content rights logic;
- advertising campaign data;
- Data Graph business/domain semantics;
- content licensing catalogs;
- site-specific ranking/content-quality algorithms;
- NLWeb UI/application implementation.

Those application/data responsibilities may exist in products outside TRUYN and may be reached through explicit interfaces, but TRUYN itself should only transport, discover, authorize, select, route and verify interoperability.

TRUYN must not need to understand that a payload represents Coca-Cola, a news article, a campaign, a product catalog entry or a publisher right in order to discover a compatible capability or transport an NLWeb interaction.

## Capability semantics

NLWeb compatibility is metadata/profile information, not a replacement for TRUYN capability semantics.

Example conceptually:

```text
OFFER
capability: information.answer
metadata.interoperability.nlweb:
  supported: true
  operations: [ask, who]
  profile: <pinned-profile>
```

The exact schema is a future implementation contract and must not be invented in documentation before code/spec review. In particular, natural-language `who` intent must map into explicit bounded TRUYN discovery constraints rather than becoming opaque authorization metadata.

## Security invariants

NLWeb support must preserve all existing execution-boundary invariants:

- discovery is authorization-aware;
- semantic matching happens within the authorized/visible candidate universe;
- private providers stay undiscoverable to unauthorized requesters;
- `who` output is not authority and cannot widen access;
- protocol metadata never becomes account/tenant/provider/billing authority;
- credentials never traverse TRUYN envelopes as payload data;
- paid-provider execution occurs only after authoritative authorization and billing/entitlement checks;
- retries, polling or bridges cannot duplicate remote application side effects;
- malformed or unsupported NLWeb responses fail closed;
- referenced content is never fetched implicitly from arbitrary URLs;
- provenance/correlation must survive translation where the profile claims a verified round trip.

## Development gates

### NW-0 — Architecture and boundary

- [x] define NLWeb as an external interoperability edge;
- [x] define `who` as a semantic discovery interface over native TRUYN discovery;
- [x] define TRUYN as distributed discovery/selection/execution fabric behind `who`/`ask`;
- [x] keep application/data/indexing/rights/Data Graph semantics outside TRUYN;
- [x] assign public adapter/conformance ownership to TRUYN Open;
- [ ] select and pin the exact upstream NLWeb profile/version for implementation.

### NW-1 — Adapter core

- [ ] add NLWeb client adapter contract;
- [ ] add NLWeb provider/edge adapter contract;
- [ ] add exact profile/version negotiation;
- [ ] normalize bounded request/response/error/correlation semantics.

### NW-2 — Semantic discovery and advertisement

- [ ] discover explicitly eligible NLWeb endpoints;
- [ ] advertise NLWeb compatibility in Agent Descriptor/capability metadata;
- [ ] implement bounded `who` semantic-intent → TRUYN discovery-constraint mapping;
- [ ] implement reference candidate selection over the eligible set;
- [ ] implement health/profile reporting;
- [ ] prove private providers remain hidden.

### NW-3 — `who → selection → ask` composition

- [ ] `who` semantic discovery interoperability against the accepted upstream profile;
- [ ] return authorized/visible candidate sets with correlation;
- [ ] select one or more eligible endpoints without making ranking an authority source;
- [ ] compose selected endpoint into `ask` request/response interoperability;
- [ ] preserve structured response fields and provenance/correlation;
- [ ] enforce the normal TRUYN authority path before dispatch.

### NW-4 — Routing / relay / security

- [ ] route NLWeb-originated requests through normal TRUYN matching;
- [ ] auth/policy passthrough without credential leakage;
- [ ] fail-closed version/semantic negotiation;
- [ ] negative tests prove unauthorized `who` cannot enumerate private candidates;
- [ ] negative tests prove unauthorized `ask` traffic causes zero provider execution.

### NW-5 — Bridge profiles

- [ ] bounded `NLWeb → TRUYN → MCP` profile;
- [ ] evaluate bounded `MCP → TRUYN → NLWeb` profile;
- [ ] evaluate bounded `A2A → TRUYN → NLWeb` profile;
- [ ] document unsupported/lossy mappings explicitly rather than silently translating them.

### NW-6 — External conformance evidence

- [ ] independent NLWeb implementation black-box proof;
- [ ] end-to-end `WHO → TRUYN discovery → selection → ASK → TRUYN execution` proof;
- [ ] adversarial cross-protocol matrix with MCP/A2A/TRUYN;
- [ ] durable evidence for exact source/profile/test vectors;
- [ ] compatibility status promoted from `Planned` only after accepted executable evidence.

## Acceptance boundary

NLWeb compatibility is not accepted merely because an HTTP call to an NLWeb endpoint works.

A first bounded acceptance requires, at minimum:

- exact upstream profile/version pinned;
- `who` semantic intent mapped into bounded TRUYN discovery constraints;
- candidate visibility/authorization filtering proven before return;
- reference selection over only eligible candidates;
- `who → selection → ask` composition proven end-to-end;
- `ask` interoperability proven through normal TRUYN authority/routing;
- zero unauthorized provider enumeration and zero unauthorized provider calls;
- structured response normalization with correlation/provenance checks;
- bridge semantics documented and tested for every claimed direction;
- independent black-box evidence;
- canonical status/roadmap updated to match the actual implementation.

Until then, NLWeb remains a **planned interoperability track**.
