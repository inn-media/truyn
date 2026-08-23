# TRUYN Security Documentation

This directory is the detailed security documentation layer. Root [`SECURITY.md`](../../SECURITY.md) remains the public security policy/reporting entry point.

## Documents

- [Security Architecture Status](SECURITY_ARCHITECTURE_STATUS.md) — what is implemented, deployment-proven and still environment-specific.
- [Operational Security](OPERATIONAL_SECURITY.md) — safe runtime/edge/provider proof handling, perimeter acceptance and incident rules.
- [Production Azure Origin Lock evidence](../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md) — accepted production relay Cloudflare → Azure Front Door → Container Apps → origin-guard bypass-denial proof.

Related architecture:

- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/AUTHORIZATION_MODEL.md`
- `../architecture/BILLING_BOUNDARY.md`
- `../architecture/RELAY_SECURITY.md`
- `../architecture/THREAT_MODEL.md`
- `../architecture/PUBLIC_PRIVATE_BOUNDARY.md`

## Security maturity rule

A security control can be:

- defined;
- implemented;
- regression/CI proven;
- deployment-proven;
- productionized.

Reference code for an origin guard does not prove that a real deployment denies direct-origin bypass. Conversely, the accepted 2026-08-23 production relay origin-lock gate is a deployment-proven claim for that tested deployment, not a universal property of all TRUYN installations.

A signed entitlement verifier does not prove that a production issuer/store exists. Security documentation must preserve these distinctions.

## Current production relay edge status

The tested production relay now has an accepted origin-lock chain:

```text
Cloudflare
  ↓
Azure Front Door SocketAddr sanitize/inject proof
  ↓
Container Apps AzureFrontDoor.Backend-only ingress
  ↓
runtime origin guard
  ↓
inner relay
```

The accepted gate proves direct Azure Front Door HTTP/WebSocket and spoofed-proof bypass attempts return 403 while the Cloudflare public path remains healthy. See `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md`.

## Core invariant

```text
open protocol / public reachability
!=
permission to consume another party's paid intelligence capacity
```

Security is fail-closed at both routing and provider-host execution boundaries.
