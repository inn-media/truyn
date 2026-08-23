# TRUYN Provider and Relay Threat Model

**Status:** approved target threat model. Mitigation maturity is reported separately; the current production relay has deployment-proven protection for the T6 direct-origin bypass scenarios described below, while other deployments must prove equivalent controls independently.

## Assets to protect

The provider-security architecture protects:

- provider credentials and private keys;
- provider-owner quota and paid inference capacity;
- cloud/runtime identities;
- private provider availability;
- tenant isolation;
- signed TRUYN identity and provenance;
- billing/accounting integrity;
- internal topology and operational metadata where disclosure is unnecessary;
- trusted-edge/origin boundaries that prevent direct access from bypassing transport policy.

## Adversary model

Assume a network participant may:

- register a valid independent TRUYN identity;
- know public protocol details and source code;
- know or guess a private provider ID;
- send arbitrary signed protocol payloads;
- modify or replace the official client;
- call legacy/compatibility endpoints directly;
- replay old requests;
- enumerate discovery surfaces;
- lie about owner/tenant/billing fields;
- attempt high-rate or high-cost workloads;
- coordinate multiple identities;
- inspect public repository history and generic deployment examples;
- resolve or otherwise learn a public cloud edge/origin endpoint and attempt to contact it directly;
- forge ordinary proxy headers or copy a visible/requester-controlled edge-proof header value.

Security MUST NOT depend on the attacker being unaware of the protocol, provider-ID format, public edge hostname or generic deployment architecture.

## Primary threats

### T1 — Foreign consumption of owner-funded AI
A foreign requester discovers or guesses an operator-owned provider and causes a paid upstream call.

**Required mitigation:** server-side provider ownership authorization before dispatch; default deny.

### T2 — Authorization attribute forgery
A requester claims `ownerId`, `tenantId`, billing mode or privileged role in its payload.

**Required mitigation:** derive authoritative authorization attributes from authenticated context/provisioning state, not requester-controlled fields.

### T3 — Legacy-route bypass
A new secure path is deployed while an older HTTP/WebSocket/MCP route can still invoke a provider without the same checks.

**Required mitigation:** all execution-capable transports converge on one authorization layer.

### T4 — Discovery leakage
A foreign requester enumerates private provider metadata, internal URLs or operational identifiers.

**Required mitigation:** authorization-aware discovery plus minimal public metadata.

### T5 — Credential exfiltration
Provider API keys or cloud credentials are placed in protocol envelopes, logs, public artifacts or relay state.

**Required mitigation:** credentials remain local/provider-runtime secrets and are never required as TRUYN routing payloads.

### T6 — Relay/origin bypass
An attacker reaches an origin or provider invocation surface directly and bypasses intended edge policy.

**Required mitigation:** authenticated provider backchannel where applicable, origin network restriction, trusted-edge proof that cannot be supplied authoritatively by the requester, and server-side authorization at the execution boundary.

For the current production relay, the accepted defense-in-depth chain is:

```text
Cloudflare
  ↓
Azure Front Door
  ↓  delete requester-supplied proof
  ↓  SocketAddr ∈ Cloudflare CIDRs → inject trusted proof
Azure Container Apps
  ↓  AzureFrontDoor.Backend-only ingress
runtime origin guard
  ↓
inner loopback relay
```

The accepted production gate proves the following T6 variants are denied:

- direct Azure Front Door HTTP;
- direct Azure Front Door HTTP with forged edge proof;
- direct Azure Front Door WebSocket;
- direct Azure Front Door WebSocket with forged edge proof;
- direct Container App HTTP;
- direct Container App WebSocket.

The public Cloudflare path remains available for the tested HTTP/WebSocket semantics. Evidence: `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md`.

The trusted-edge proof is transport authentication only. Passing T6 does not grant provider authorization, billing entitlement or Trustability.

### T7 — Quota exhaustion / cost abuse
An authorized or partially authorized actor generates excessive valid work.

**Required mitigation:** quotas, rate/resource limits, cost attribution, concurrency limits and operational kill switches.

### T8 — Fail-open dependency behavior
Authorization, tenant resolution, billing attribution or quota service fails and the relay proceeds anyway.

**Required mitigation:** fail closed for chargeable/private execution.

### T9 — Repository disclosure
Public documentation or examples reveal unnecessary production topology, cloud identities, limits or secret paths.

**Required mitigation:** public/private documentation boundary and operational-data review.

### T10 — Edge-proof forgery / proxy confusion
A requester injects a header that looks like trusted edge proof or exploits confusion between client-origin IP and the direct socket peer seen by the trusted edge.

**Required mitigation:** sanitize requester proof unconditionally before any trusted injection; base the accepted production edge condition on the direct `SocketAddr` observed by Azure Front Door; inject proof only after the Cloudflare CIDR condition succeeds; strip proof before the inner relay.

A proof header supplied by the requester must never survive as an authoritative proof value.

### T11 — False edge-convergence assumption
Control-plane configuration reports success or ambiguous deployment status while the serving edge has not actually applied the expected rule behavior.

**Required mitigation:** before origin-guard cutover, prove the rule behavior on the real data plane. The accepted production gate uses non-secret response markers to distinguish unconditional sanitize from Cloudflare-only rule execution. Azure Front Door `deploymentStatus` alone is not an acceptance signal.

## Security acceptance matrix

The provider-security implementation is not complete until tests demonstrate at minimum:

| Scenario | Expected result |
|---|---|
| anonymous requester → owner-private provider | denied; zero upstream calls |
| registered foreign node → owner-private provider | denied; zero upstream calls |
| foreign node supplies private provider ID directly | denied |
| foreign node forges owner/tenant fields | denied |
| legacy execution route attempts same private provider | denied by same central policy |
| user → own BYOK provider | allowed when valid |
| explicitly authorized shared provider | allowed within policy/quota |
| trusted owner workflow → owner-private provider | allowed within private policy |
| public request through accepted Cloudflare edge path | may reach normal TRUYN auth/policy processing; does not imply provider authorization |
| direct Azure Front Door HTTP/WS | denied before inner-relay data-plane access |
| direct Azure Front Door with forged trusted-edge proof | denied |
| direct Container App HTTP/WS | denied |

## Deployment evidence boundary

The 2026-08-23 production relay result closes the tested T6/T10/T11 origin-bypass matrix for that deployment. It does not mean every TRUYN operator automatically inherits the same cloud perimeter.

Any material change to Cloudflare, Front Door route/rule sets, Cloudflare CIDRs, Container Apps ingress, proof handling or origin topology requires re-running the bypass matrix before the deployment-proven claim is carried forward.

## Out of scope for this document

This file does not publish real privileged identities, exact live allowlists, private origins, proof values, quotas, billing limits or incident-response credentials. Those are operational/private data.
