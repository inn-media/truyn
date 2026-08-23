# TRUYN Public Edge Domains

Status: public hostname architecture for the current PoC/production relay and future service separation.

This document records **intentionally public DNS/service names and their logical roles only**. It deliberately does not publish live cloud resource names, private origins, edge account identifiers, privileged route configuration, service tokens or internal topology.

## Canonical public relay

- `relay.truyn.org` — canonical public TRUYN relay hostname for the current deployment.

Public reachability of the relay does **not** imply public access to private or owner-funded AI providers. Provider execution remains subject to the provider ownership/authorization architecture.

The current production relay public path is deployment-proven as:

```text
Internet
  ↓
Cloudflare
  ↓
Azure Front Door
  ↓
Azure Container Apps relay ingress
  ↓
runtime origin guard
  ↓
inner TRUYN relay
```

The accepted direct-bypass evidence is `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md`.

## Reserved public HTTPS surfaces

The following names are reserved as public compatibility/control surfaces:

- `api.truyn.org` — future public HTTP API surface.
- `discovery.truyn.org` — future HTTP discovery/bootstrap compatibility surface; this does not redefine native TRUYN discovery transport.
- `gateway.truyn.org` — future HTTP/REST/webhook compatibility gateway.
- `mcp.truyn.org` — future MCP interoperability surface.
- `trust.truyn.org` — future Trustability HTTP service surface.
- `status.truyn.org` — future public status/health surface.

Reservation of a hostname does not mean the corresponding service is implemented, active or authorized to reach private providers.

## Service ownership boundary

Each public hostname should have an independently owned logical service/backend when that service is implemented. Temporary PoC route reuse is an infrastructure detail and MUST NOT become a permanent architecture rule.

The architecture separates:

```text
public protocol / compatibility surfaces
              ↓
authentication + authorization boundary
              ↓
private owner control plane
private provider backchannels
```

The public API/MCP/gateway surface must never be treated as an alternate path around provider authorization.

Any future public hostname that reaches the protected production relay/origin class must either inherit an equivalent trusted-edge perimeter or prove its own equivalent direct-bypass denial. A new hostname or route must not silently become an origin bypass path.

## Native network transport boundary

Future native `testnet`/`mainnet` transport and bootstrap infrastructure may use protocols different from HTTP. Public HTTPS compatibility names do not redefine the native TRUYN transport contract.

## Edge and origin security

Public edge infrastructure should provide TLS and may provide WAF/rate limiting/abuse controls. Private/control-plane services may additionally use machine-to-machine access policies.

For the current production relay, direct-origin bypass protection is now deployment-proven. The accepted edge/origin control is:

1. Cloudflare is the intended public proxy edge;
2. Azure Front Door unconditionally removes caller-supplied origin proof;
3. Azure Front Door injects trusted origin proof only when its direct `SocketAddr` belongs to the current Cloudflare CIDR set;
4. Azure Container Apps ingress is restricted to the current `AzureFrontDoor.Backend` address space;
5. the runtime origin guard requires the trusted edge proof before inner-relay data-plane access;
6. direct Azure Front Door HTTP/WebSocket, forged-proof direct Front Door probes and direct Container App HTTP/WebSocket are denied with 403 in the accepted gate.

This origin-authentication boundary is not dependent on Azure WAF. WAF/rate limiting are separate abuse-control concerns.

Azure Front Door control-plane `deploymentStatus` is not used as the sole readiness proof. Edge rule convergence must be demonstrated on the serving data plane before origin-guard cutover.

Exact origin hostnames, edge application/resource IDs, proof values, firewall/rule contents beyond stable public invariants, account/zone IDs and privileged automation remain private operational data.

Edge controls are defense in depth. The provider authorization decision remains mandatory at the TRUYN execution boundary even if edge controls are misconfigured.

Material changes to Cloudflare, Front Door routes/rules, Cloudflare CIDRs, Container Apps ingress, origin proof or origin topology invalidate the current deployment equivalence until the direct-bypass acceptance matrix is re-run.

## Public/private source-of-truth rule

This file is **not** the source of truth for live cloud resources. Live deployment identifiers, private origins, route/backend IDs and security-control configuration belong to protected operational configuration/systems.

Public infrastructure-as-code and workflows should use generic/stable abstractions or placeholders where practical and must not rely on secrecy of architecture for security.

Completed privileged one-shot origin-lock enforcement/proof executors are removed from the current public tree after acceptance. Durable public evidence and stable architecture/security invariants remain instead.

See:

- `RELAY_SECURITY.md`
- `PROVIDER_OWNERSHIP.md`
- `PUBLIC_PRIVATE_BOUNDARY.md`
- `../security/SECURITY_ARCHITECTURE_STATUS.md`
- `../security/OPERATIONAL_SECURITY.md`
- `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md`
