# TRUYN Security Architecture Status

**Snapshot:** 2026-08-23.

## Implemented and regression-proven reference controls

| Control | Status |
|---|---|
| signed provider ownership binding | implemented |
| private/owner-only default provider policy | implemented at relay and low-level provider/runtime |
| authorization-aware discovery/dispatch | implemented |
| provider-signed requester allowlists | implemented |
| provider-host second authorization check | implemented |
| owner-funded public-execution denial | implemented |
| BYOK private provider boundary | implemented |
| public-provider explicit opt-in | implemented |
| local-development vs public/production hard conflict | implemented |
| bounded HTTP/WebSocket input | implemented |
| oversized HTTP 413 + connection close | implemented |
| minimal public health disclosure | implemented |
| origin guard | implemented reference control |
| expiry-bound origin proof + active/previous rotation window | implemented reference control |
| Cloudflare-compatible proof-injecting edge proxy | implemented reference control |
| Azure Front Door SocketAddr sanitize/inject proof pattern | implemented and deployment-proven on the production relay |
| Container Apps `AzureFrontDoor.Backend` ingress restriction | deployment-proven on the production relay |
| direct Azure Front Door HTTP/WebSocket bypass denial | deployment-proven on the production relay |
| forged edge-proof denial at direct Azure Front Door | deployment-proven on the production relay |
| protected-provider M2M guard | implemented reference control |
| transport proof stripping before inner relay | implemented |
| sponsored signed entitlement verification boundary | implemented interface/policy |
| durable atomic sponsored usage-store requirement | enforced as activation prerequisite |
| benchmark redact-not-delete guard | implemented repository policy/tests |

## Production relay origin-lock status

The current tested production relay has a deployment-proven origin perimeter.

Accepted architecture:

```text
Internet
  ↓
Cloudflare
  ↓
Azure Front Door
  ↓  SocketAddr-bound sanitize/inject rule set
Azure Container Apps ingress
  ↓  AzureFrontDoor.Backend-only network restriction
runtime origin guard
  ↓
inner loopback TRUYN relay
```

The accepted live gate is recorded in `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md` on tested source commit `9b419e7d11baf6ec0d17e7075238e3d758ef16e4`, terminal context `truyn/origin-lock-live-v22 = success`.

The gate simultaneously proved:

- public Cloudflare `/health` = 200 with `CF-Ray`;
- public HTTP and WebSocket semantics preserved;
- direct Azure Front Door HTTP = 403;
- direct Azure Front Door HTTP with forged edge proof = 403;
- direct Azure Front Door WebSocket = 403;
- direct Azure Front Door WebSocket with forged edge proof = 403;
- direct Container App HTTP = 403;
- direct Container App WebSocket = 403.

Azure Front Door `deploymentStatus` is not treated as sufficient evidence of edge convergence. The accepted gate used real data-plane markers to prove that the unconditional sanitize rule and the Cloudflare-only `SocketAddr` rule were active before switching the runtime origin guard.

## Deployment-specific / not globally proven

The production relay result above is a bounded deployment claim, not a universal property of every TRUYN installation.

The repository does **not** by itself prove:

- every future or third-party production origin is unreachable except through its intended trusted edge;
- live edge/M2M proof issuance and rotation remain correct after every infrastructure change;
- cloud IAM/firewall/tunnel policy is correct in every environment;
- a production durable sponsored usage store is deployed;
- a production entitlement issuer/revocation control plane exists;
- rich account/org tenant identity is enforced everywhere;
- large open-network Sybil/eclipse/collusion resistance;
- stable mainnet incident/SLO operations.

Any material change to the production public edge, Front Door route/rule set, Cloudflare CIDRs, Container Apps ingress policy, origin-proof handling or origin topology requires re-running the origin-lock acceptance matrix before the deployment-proven status is carried forward.

## Security decision order

```text
transport/session authenticity
        ↓
provider ownership / visibility authorization
        ↓
billing responsibility / entitlement
        ↓
request constraints / routing
        ↓
provider-host authorization + billing
        ↓
execution
```

Failure at a mandatory security/billing stage means no chargeable/private execution.

## Evidence rule

Security acceptance should prefer executable negative tests:

```text
unauthorized actor
        ↓
request rejected
        ↓
provider event count = 0
        ↓
adapter execution count = 0
        ↓
upstream chargeable call = 0
```

For deployment controls, also prove that bypass traffic cannot reach the protected inner surface. For edge propagation, prefer real data-plane behavior over control-plane status fields that may not represent serving-edge convergence.
