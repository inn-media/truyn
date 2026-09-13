# Security Policy — TRUYN Open

TRUYN is security-sensitive infrastructure. Do not publish exploitable vulnerabilities, credentials, private keys, private topology, operational allowlists, incident data, customer data or unremediated production bypasses in public issues.

## Reporting

Use GitHub private vulnerability reporting when available. Security embargoes may delay disclosure but must not become a permanent hidden channel for normative protocol changes.

## Two-repository security boundary

TRUYN now has an explicit codebase split:

- **TRUYN Open** — `inn-media/truyn`, public Apache-2.0 protocol/reference/SDK/conformance layer;
- **TRUYN Platform** — `inn-media/truyn-platform`, private proprietary managed/commercial/operations layer.

The canonical ownership policy is `docs/architecture/OPEN_CORE_BOUNDARY.md` plus `config/open-core-boundary.json`.

Security does not justify collapsing the repositories back together. Public code must never import private code. Private production code must consume public code only through stable public contracts and released/versioned artifacts, never by Git branch, submodule, sibling path, raw GitHub source or wholesale repository snapshot.

A bounded legacy set of managed authority/production files remains in the public tree as an explicit migration exception while the reusable public authority-kernel artifact is separated and released. The exact allowlist may only shrink; it is not permission to add new managed/private implementation here.

## Public security baseline

The public reference implementation preserves these fail-closed invariants:

- production-style relay registration requires explicit enrollment;
- provider dispatch is closed by default;
- provider discovery filters by authorization before returning or dispatching foreign offers;
- requester-controlled `ownerId`, `tenantId`, provider IDs or billing metadata do not create authority;
- provider ownership is bound to authenticated/signed runtime identity;
- private/owner-only providers are hidden from unauthorized discovery;
- denied requests cause zero upstream provider execution;
- HTTP, WebSocket, SDK, MCP, A2A and compatibility paths converge on the same authorization boundary before provider side effects;
- raw upstream AI credentials stay at the provider/user runtime boundary and never belong in TRUYN envelopes or Agent Descriptors;
- `owner-funded` access is private by default; wider access requires explicit policy;
- sponsored/prepaid/subscription execution requires authoritative entitlement/accounting semantics and fails closed when responsibility cannot be resolved;
- Agent Descriptor and SDK metadata are never authorization sources;
- local-development modes must not silently become public-production modes;
- public health/discovery surfaces minimize operational/topology leakage;
- security and protocol evidence is tested with negative/adversarial cases, not only happy-path calls.

## Managed-platform security ownership

TRUYN Platform owns security-sensitive managed implementation that derives value from private/global state or commercial operations:

- managed authority/revocation service lifecycle;
- managed cloud persistence and operator/admin controls;
- global trust/reputation state;
- proprietary routing/ranking intelligence;
- private telemetry/analytics;
- commercial entitlements/billing/enterprise policy;
- private production topology, privileged cloud identities, private quotas/cost ceilings and incident/runbook evidence.

Only sanitized public contracts/evidence cross back into TRUYN Open.

## Open protocol does not mean open billing account

Public source, a public Relay or a public capability name never grants permission to spend another party's provider quota. Normal users Bring Their Own Intelligence / Bring Their Own Provider unless an authoritative policy explicitly grants otherwise.

## Server-side authorization

UI, CLI, SDK, DNS, obscurity, hidden provider IDs, Cloudflare or other perimeter controls are not sufficient provider authorization. Authorization is enforced from authenticated identity plus authoritative server-side policy before provider selection/dispatch and again at the execution host where applicable.

If identity, ownership, tenant, authorization, billing responsibility or required entitlement cannot be resolved, private/chargeable execution must not occur.

## D-200 security boundary

D-200 is OPEN. Public benchmark logic, predicates and sanitized evidence remain here. Managed fleet telemetry, proprietary routing/ranking intelligence or private operational data derived from production use belongs to TRUYN Platform.

A D-200 change that alters a shared public protocol/SDK/Descriptor contract is `BOTH` work and requires a linked private compatibility change; the benchmark itself does not move private.

## Public repository data boundary

This repository may contain protocol semantics, public governance records, generic/reference code, SDKs, schemas/fixtures, conformance, reviewed benchmark methodology and sanitized evidence.

It must not contain unnecessary:

- credentials/private keys/tokens;
- private cloud account/project/subscription/tenant identifiers;
- private origins/backchannels/resource names;
- WIF/service-account/managed-identity topology;
- secret-manager paths/private buckets/containers;
- live privileged allowlists/protected-node IDs;
- private quota/cost/emergency limits;
- raw customer prompts/results/data;
- private incident/operations evidence;
- managed commercial datasets.

Privileged managed material belongs in TRUYN Platform or another appropriate access-controlled operational system.

## Benchmark evidence preservation

`docs/benchmarks/` remains a protected public evidence ledger. Security cleanup uses **redact-not-delete** handling.

If sensitive material is found:

- redact/generalize only the sensitive field;
- preserve methodology, gates, results, limitations, corrections and safe provenance identifiers;
- record the correction;
- do not replace a substantive benchmark with a stub merely because one field was sensitive.

Repository splitting, secret response and history cleanup are not permission to erase valid sanitized evidence.

## History / secret response

Removing a secret from the current tree is not enough: exposed credentials must be revoked/rotated and hosting-side logs/artifacts/caches handled separately. A history rewrite does not replace credential rotation.

If public history must be rewritten for a genuine secret, sanitized benchmark/governance evidence must be restored immediately to the new history.

## Contribution / release security

Every public contribution commit uses DCO 1.1 sign-off. Public SDK/package release tooling must preserve license/notice/provenance and reject credential/private topology leakage. Private TRUYN Platform consumers pin accepted immutable public release coordinates; missing Maven/NuGet releases do not permit source fallback.

## Related documents

- `docs/architecture/OPEN_CORE_BOUNDARY.md`
- `docs/architecture/CROSS_REPO_TASK_ROUTING.md`
- `docs/architecture/ARCHITECTURE_CONTRACT.md`
- `docs/architecture/PROVIDER_OWNERSHIP.md`
- `docs/architecture/AUTHORIZATION_MODEL.md`
- `docs/architecture/RELAY_SECURITY.md`
- `docs/architecture/BILLING_BOUNDARY.md`
- `docs/architecture/BYOK_ARCHITECTURE.md`
- `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `docs/architecture/THREAT_MODEL.md`
- `docs/benchmarks/README.md`
- `spec/protocol/v1/provider-policy.md`
- `spec/protocol/v1/agent-descriptor.md`
