# TRUYN NLWeb Interoperability Architecture

**Status:** Bounded NLWeb 0.5 interoperability profile implemented and executable-evidence proven; broader/stable NLWeb compatibility is not claimed.  
**Snapshot:** 2026-09-20  
**Protocol:** `TRUYN/1` draft  
**Pinned NLWeb protocol profile:** `0.5`  
**Pinned upstream source:** `nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`

NLWeb is an external natural-language web interoperability edge around TRUYN. It is not a replacement for TRUYN transport, identity, authority, routing, provenance or Trustability, and it is not a new `TRUYN/1` wire dependency.

## Accepted bounded profile

Open 1.0 NLWeb interoperability is bounded to protocol profile **0.5** at exact upstream source **`nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197`**. The accepted public implementation covers bounded Ask/Who normalization, exact profile negotiation, authorization-aware semantic discovery, eligible reference selection, `who → selection → ask` composition through normal TRUYN authority/dispatch, structured correlation/provenance preservation, and the explicitly tested bridge mappings.

Independent external black-box evidence for S89 is GitHub Actions run **`35487917472`**, attempt 1, terminal **SUCCESS**, against exact qualified SUT **`a28cba182b9cddde34bc34894180d14cfa166d2b`**. The evidence harness used only public code plus the pinned upstream NLWeb source; evidence PR #667 was closed without merge.

This is a bounded interoperability acceptance, not a declaration of stable NLWeb v1, not adoption of later upstream NLWeb revisions, and not a claim that TRUYN owns NLWeb application/data semantics. Any different upstream version/profile requires an explicit compatibility change and executable requalification.

## Authority boundary

NLWeb `who` may influence what capability is being sought. It must never decide who the requester is, which tenant owns an endpoint, whether the requester is authorized, or who pays for execution. Semantic matching happens only inside the already authorized/visible candidate universe. Protocol metadata is non-authoritative.

## Public/open implementation scope

The accepted bounded surface belongs in TRUYN Open and includes client/provider adapters, authorization-aware discovery, `ask` interoperability, `who` semantic discovery, routing/relay integration, health/profile advertisement, explicit bridges where semantics are preserved, and executable conformance/adversarial tests.

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
- provenance/correlation survives translation for the accepted verified round trip.

## Development gates

### NW-0 — Architecture and boundary
- [x] external interoperability edge and public ownership boundary;
- [x] `who` defined as semantic discovery over native TRUYN discovery;
- [x] application/data/indexing/rights semantics remain outside TRUYN;
- [x] exact NLWeb 0.5 upstream pin.

### NW-1 — Adapter core
- [x] bounded client/provider adapter contracts;
- [x] exact profile/version negotiation;
- [x] bounded request/response/error/correlation normalization.

### NW-2 — Semantic discovery/advertisement
- [x] authorization-aware eligible discovery and bounded profile/capability handling;
- [x] deterministic public/reference selection remains available without private code.

### NW-3 — WHO → selection → ASK
- [x] authorized candidate selection;
- [x] execution only through canonical TRUYN authority/dispatch;
- [x] structured correlation/provenance preservation.

### NW-4 — Routing/relay/security
- [x] fail-closed unsupported-profile behavior;
- [x] adversarial private-provider invisibility and unauthorized-execution protections.

### NW-5 — Bridge profiles
- [x] claimed bounded NLWeb/TRUYN/MCP/A2A mappings are executable-tested;
- [x] unsupported/lossy mappings remain explicit failures/non-claims.

### NW-6 — External conformance
- [x] independent pinned-profile NLWeb 0.5 black-box, run `35487917472`, SUCCESS;
- [x] bounded end-to-end WHO → eligible selection → ASK evidence without private code.

## Acceptance boundary

The accepted claim is deliberately narrow: **TRUYN Open implements and has executable evidence for the bounded pinned NLWeb 0.5 interoperability profile described above.** Stable NLWeb compatibility, later upstream profiles, crawling/ingestion, indexing/vector search, RAG corpus ownership, publisher/content-rights logic, advertising/campaign data and Data Graph business semantics are not claimed by this profile.
