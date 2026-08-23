# TRUYN Production Azure Origin Lock — 2026-08-23

**Status:** ACCEPTED / PASS  
**Tested source commit:** `9b419e7d11baf6ec0d17e7075238e3d758ef16e4`  
**Terminal status context:** `truyn/origin-lock-live-v22` = `success`

## Claim

For the tested production relay deployment, direct bypass of the intended public edge path is closed for the tested HTTP and WebSocket data-plane paths.

The accepted path is:

```text
Internet
  ↓
Cloudflare
  ↓
Azure Front Door
  ↓
Azure Container Apps ingress
  ↓
runtime origin guard
  ↓
inner TRUYN relay
```

This report is deployment evidence for the tested production relay. It is not a claim that every future TRUYN deployment inherits the same perimeter automatically.

## Enforced layers

### 1. Cloudflare public edge

The public relay hostname remains reachable through Cloudflare. The acceptance gate required `/health` to return HTTP 200 through the public path with a `CF-Ray` response header.

Normal public HTTP registration semantics and the tested WebSocket semantics were required to remain unchanged during the cutover.

### 2. Azure Front Door socket-bound origin proof

The production Front Door route is associated with a dedicated rule set that treats the direct TCP peer observed by Azure Front Door as the trust input.

The rule sequence is fail-closed:

1. unconditionally delete any requester-supplied deployment-managed origin-proof header;
2. only when `SocketAddr` matches the current Cloudflare CIDR set, overwrite that header with deployment-managed proof;
3. split Cloudflare CIDRs across multiple equivalent rules where necessary to remain within Azure rule-condition value limits;
4. never accept a requester-provided proof value as authoritative.

This means a direct caller to Azure Front Door cannot preserve or forge the proof header: the unconditional sanitize rule removes it before conditional injection.

The final gate deliberately did not rely on Azure Front Door `deploymentStatus` as proof of edge convergence. Current Azure Front Door resources can report `provisioningState=Succeeded` while `deploymentStatus` remains `NotStarted`. Instead, the accepted gate used real data-plane response markers to prove that both the unconditional sanitize rule and the Cloudflare-only `SocketAddr` rule were active on the serving edge before the runtime origin guard was switched.

### 3. Container Apps network restriction

The relay Container App ingress is restricted to current `AzureFrontDoor.Backend` service-tag address ranges.

Direct Container App HTTP and WebSocket probes are therefore denied before they can become a supported bypass path.

### 4. Runtime origin guard

The public-facing relay process is wrapped by the fail-closed runtime origin guard. The inner TRUYN relay binds to loopback and is reached only after the outer guard validates the expected edge proof.

The proof is transport-only and is removed before forwarding to the inner relay.

## Accepted negative/positive matrix

The terminal PASS required all of the following simultaneously:

| Probe | Accepted result |
|---|---:|
| public Cloudflare `/health` | `200` + `CF-Ray` |
| public Cloudflare HTTP semantics | preserved |
| public Cloudflare WebSocket semantics | preserved |
| direct Azure Front Door HTTP | `403` |
| direct Azure Front Door HTTP with forged edge proof | `403` |
| direct Azure Front Door WebSocket | `403` |
| direct Azure Front Door WebSocket with forged edge proof | `403` |
| direct Container App HTTP | `403` |
| direct Container App WebSocket | `403` |

The accepted terminal status on the tested commit was:

```text
truyn/origin-lock-live-v22 = success
```

## Security properties established

For the tested deployment:

- direct Container App origin access is not a supported bypass path;
- direct Azure Front Door access cannot obtain the Cloudflare-bound origin proof;
- presenting a forged/stolen proof header directly to Azure Front Door does not bypass the sanitize/inject sequence;
- HTTP and WebSocket paths are covered by the same perimeter expectation;
- public Cloudflare reachability remains functional after enforcement;
- runtime origin proof remains an edge-to-origin transport control, not a TRUYN client credential.

## Important implementation note

The final accepted production control is **not a WAF-policy dependency**. Earlier experiments evaluated a Cloudflare-only WAF `SocketAddr` allowlist, but Azure WAF policy creation encountered subscription/API validation constraints. The accepted design uses native Azure Front Door Rule Set `SocketAddr` matching plus sanitize/inject proof, backed by Container Apps `AzureFrontDoor.Backend` ingress restriction and the runtime origin guard.

The security objective is unchanged: only traffic that actually traverses the trusted Cloudflare → Azure Front Door path receives valid origin proof.

## Relationship to earlier evidence

`ORIGIN_BYPASS_SECURITY_EVALUATION_2026-08-16.md` is intentionally preserved as negative historical evidence. It recorded the earlier state in which production direct-origin denial had not yet been proven. This report supersedes that document only for the **current tested production origin-lock status**; it does not erase the earlier experiments or their limitations.

## Operational rule

Any material change to the public edge provider, Front Door route/rule set, Cloudflare CIDRs, Container Apps ingress restrictions, origin-guard header/proof handling, or relay origin topology invalidates the assumption of continued equivalence until the same positive/negative data-plane matrix is re-run.

`AZURE_ORIGIN_LOCK = ACTIVE` is therefore an evidence-backed deployment state, not a protocol-level default.
