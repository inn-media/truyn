# TRUYN NLWeb Interoperability Architecture

**Status:** Planned / roadmap architecture; no NLWeb compatibility claim is currently accepted.  
**Snapshot:** 2026-09-16  
**Protocol:** `TRUYN/1` draft  
**Pinned NLWeb protocol profile:** `0.5`  
**Pinned upstream source:** `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`

NLWeb is an external natural-language web interoperability edge around TRUYN. It is not a replacement for TRUYN transport, identity, authority, routing, provenance or Trustability, and it is not a new `TRUYN/1` wire dependency.

## Pinned upstream model

Open 1.0 NLWeb implementation work is bounded to NLWeb protocol profile **0.5** as represented by exact upstream source commit **`nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`**. That profile defines the `Ask` and `Who` protocol surfaces used by this track. Later upstream changes are not implicitly accepted: adopting another version or source commit requires an explicit compatibility change plus executable requalification.

This pin is a compatibility coordinate, not an implementation or conformance claim. Until executable conformance evidence exists, this repository must continue to describe NLWeb support as **planned**.

## Authority boundary

NLWeb `who` may influence what capability is being sought. It must never decide who the requester is, which tenant owns an endpoint, whether the requester is authorized, or who pays for execution. Semantic matching happens only inside the already authorized/visible candidate universe. Protocol metadata is non-authoritative.

## Public/open implementation scope

The NLWeb interoperability program belongs in TRUYN Open and includes bounded client/provider adapters, authorization-aware discovery, `ask` interoperability, `who` semantic discovery, routing/relay, health/profile advertisement, bridges where semantics can be preserved, and executable conformance/adversarial tests.

## Security invariants

- discovery is authorization-aware;
- private providers stay undiscoverable to unauthorized requesters;
- `who` output cannot widen access;
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
- [x] keep application/data/indexing/rights semantics outside TRUYN;
- [x] assign public adapter/conformance ownership to TRUYN Open;
- [x] pin NLWeb protocol profile `0.5` to exact upstream `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`.

### NW-1 — Adapter core

- [ ] add NLWeb client adapter contract;
- [ ] add NLWeb provider/edge adapter contract;
- [ ] add exact profile/version negotiation;
- [ ] normalize bounded request/response/error/correlation semantics.

## Acceptance boundary

The profile pin alone does not establish NLWeb compatibility. Acceptance still requires bounded discovery mapping, authorization filtering, `who → selection → ask` end-to-end behavior, zero unauthorized enumeration/execution, structured correlation/provenance preservation, bridge evidence for every claimed direction, independent black-box evidence, and canonical status reconciliation.
