# TRUYN Operational Security

**Status:** public generic runbook. Live topology/secrets remain private.

## Safe defaults

- provider access: `owner-only`;
- public provider execution: off unless explicitly opted in;
- owner-funded provider capacity: private;
- sponsored execution: disabled unless entitlement/store dependencies are present;
- local-development relay: loopback-only and incompatible with public/production markers;
- public diagnostics: minimal;
- production relay origin access: trusted-edge path only, with direct bypass denied.

## Public network switches

Public-network/provider modes require explicit operator intent. Enabling network reachability does not override provider ownership/billing policy. A change that makes a relay public should be reviewed separately from a change that shares a provider.

## Production relay origin-lock pattern

The accepted production relay perimeter is:

```text
Internet
  ↓
Cloudflare
  ↓
Azure Front Door
  ↓  unconditional proof-header sanitize
  ↓  SocketAddr ∈ Cloudflare CIDRs → edge-proof inject
Azure Container Apps
  ↓  ingress restricted to AzureFrontDoor.Backend
runtime origin guard
  ↓
inner loopback relay
```

The Azure Front Door rule set MUST remove any caller-supplied edge proof before conditional injection. A direct caller must never be able to preserve a client-provided proof value through Front Door.

The Cloudflare CIDR set is operational input and changes over time. Updating it is a perimeter change and requires re-running the origin-lock acceptance matrix.

Do not use Azure Front Door `deploymentStatus` by itself as proof that a rule is live on serving edges. The accepted 2026-08-23 gate proved rule convergence through real data-plane markers before switching the origin guard.

## Origin proof lifecycle

The generic reference origin guard supports expiry-bound `x-truyn-origin-token` proof and an active + previous token window.

The accepted Azure production relay uses a deployment-managed edge proof injected only by the trusted Azure Front Door rule path after `SocketAddr` matches Cloudflare. That proof is still transport-only, secret, stripped before the inner relay and never a TRUYN client credential.

Operational rotation/cutover pattern:

1. create the new proof in the protected deployment secret system;
2. update the trusted edge sanitize/inject path so requester-supplied proof is always removed;
3. attach/update the exact production route without removing unrelated rule sets;
4. prove on the real data plane that the unconditional sanitize rule is active;
5. prove through Cloudflare that the Cloudflare-only rule is active;
6. prove a direct Front Door request does **not** receive the Cloudflare-only marker/proof;
7. only then switch the runtime origin guard to require the new proof;
8. prove public HTTP and WebSocket semantics remain healthy;
9. prove direct Front Door HTTP, WebSocket and forged-proof requests return 403;
10. prove direct Container App HTTP and WebSocket remain 403;
11. remove retired proof material after the overlap/cutover is complete;
12. never log proof values or serialize them into public config/evidence.

If proof is suspected compromised, rotate immediately and repeat the full bypass matrix. A proof rotation without direct Front Door and direct Container App negative tests is incomplete.

## Container Apps perimeter

For the accepted Azure deployment, Container Apps ingress is restricted to the `AzureFrontDoor.Backend` service-tag address space.

Operational changes must preserve:

- exact current Azure Front Door backend ranges;
- no broad public fallback rule after cutover;
- direct Container App HTTP = 403;
- direct Container App WebSocket = 403;
- public Cloudflare path remains healthy after restriction updates.

Do not silently delete unknown ingress restrictions. Existing rules must be classified before replacement.

## Protected-provider M2M proof

M2M proof protects specifically enumerated owner-provider identities. It is an additional transport boundary, not provider authorization.

Rotation should preserve the invariant that a protected provider cannot register or use a stolen relay session without the correct current proof. Ordinary non-protected/BYOK nodes must not accidentally inherit owner-provider proof requirements.

## Secrets

Never commit/log:

- private keys or provider API keys;
- origin/M2M proof values;
- entitlement signing private keys or entitlement tokens;
- live privileged allowlists or the exact private automation that manages them;
- private origins/backchannels;
- secret-manager paths when they expose topology;
- customer/incident-sensitive prompts or outputs.

Routine config serialization should not reveal secret token fields.

Public evidence may record the public hostname, tested commit SHA, acceptance result and sanitized control semantics, but not live proof values or private resource identifiers.

## Request abuse

Request size, replay/session expiry, concurrency/backpressure and edge rate controls are defense in depth. They must not turn authorization failure into success when unavailable.

Oversized HTTP requests are closed after 413 so leftover body bytes cannot be interpreted as another request on the same keep-alive connection.

## Billing-security incident

If entitlement/usage accounting becomes unavailable or ambiguous, disable the shared/sponsored path. Do not fall back to free owner-funded execution.

## Evidence / disclosure

Security reports should preserve methodology, tested commit/run identity, negative experiments and limitations while redacting sensitive fields. Benchmark/security evidence is never deleted solely to remove one sensitive field.

The accepted production origin-lock evidence is `../benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md`. Earlier negative origin-bypass evidence remains preserved rather than rewritten away.

## Deployment acceptance

Before calling a deployment production-safe, verify at least:

- expected edge path works for HTTP and WebSocket;
- public health identifies the intended public edge where applicable;
- requester-supplied origin proof is sanitized before any trusted-edge injection;
- trusted-edge proof is issued only on the intended source path;
- direct Front Door/origin bypass is denied for HTTP and WebSocket;
- forged proof does not bypass the direct Front Door path;
- direct Container App/origin access is denied;
- provider-host deny path produces zero adapter/upstream execution;
- proof rotation works without exposing values;
- local-development mode cannot be enabled in production configuration;
- sponsored mode cannot start without valid verifier + durable atomic store;
- operational diagnostics do not leak private topology.

For the production relay tested on 2026-08-23, the origin-lock subset above is deployment-proven. Any material edge/origin topology change reopens that acceptance gate until re-tested.
