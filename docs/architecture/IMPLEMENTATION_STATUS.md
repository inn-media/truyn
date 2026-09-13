# TRUYN Open Implementation Status

**Status:** canonical public-layer factual index.  
**Two-repository closure baseline:** `main@67d46b706805cc149b2a34049d49fa76b8b41da4`  
**Protocol:** `TRUYN/1` draft  
**Private counterpart:** `inn-media/truyn-platform` / TRUYN Platform

This document distinguishes public/open implementation, private managed ownership, temporary migration exceptions and live-production evidence.

## Canonical matrix

| Subsystem | Current factual state | Ownership / next boundary |
|---|---|---|
| Signed identity / envelopes | implemented / CI-proven | OPEN |
| QUIC / authenticated sessions / Kademlia | implemented / CI-proven | OPEN |
| Class C WAN | accepted / PASS history | OPEN |
| Class D-100 | accepted / PASS history | OPEN |
| D-200 | public network qualification | OPEN; stays in this repo |
| Class D-1000 | open until strict accepted PASS | OPEN |
| Semantic/distributed retrieval | bounded implementation/evidence | OPEN primitives/evidence; managed intelligence PRIVATE |
| Claim/provenance/Trustability primitives | bounded implementation | OPEN |
| Global trust registry/reputation graph | managed platform concern | PRIVATE |
| Account/Organization/Tenant reference semantics | implemented | OPEN self-hostable/reference kernel |
| Durable local authority/reference control plane | implemented | OPEN |
| Managed cloud authority coordinator | implemented legacy code still physically here | PRIVATE_TARGET migration exception |
| Cosmos managed authority checkpoint adapter | implemented legacy code still physically here | PRIVATE_TARGET migration exception |
| Managed authority server/admin runtime | implemented legacy code still physically here | PRIVATE_TARGET migration exception |
| Managed commercial accounting/reconciliation | private managed-plane responsibility | PRIVATE; reference billing semantics remain OPEN |
| Legacy production workflows | physically present / bounded allowlist | PRIVATE_TARGET migration exception |
| A2A/MCP bounded profile | accepted public interoperability surface | OPEN |
| Five first-party SDK clients | implemented / conformance-proven | OPEN |
| npm alpha.2 | accepted immutable release | OPEN released artifact |
| PyPI alpha | accepted immutable release | OPEN released artifact |
| Go alpha | accepted immutable release | OPEN released artifact |
| Maven Central / NuGet | open | no source fallback |
| Agent Descriptor | bounded valid-profile implemented | OPEN |
| Private telemetry/analytics/marketplace/billing/enterprise | private platform | PRIVATE |
| Governance | G1 bootstrap Founding Stewardship | OPEN protocol governance |
| Stable TRUYN/1/mainnet | not declared | public maturity gate |

## Two-repository closure state

The architectural split is now explicit, but physical migration is **not yet complete**.

Completed foundation:

- public/private/shared-contract ownership defined;
- D-200 declared OPEN;
- `OPEN / PRIVATE / BOTH` task routing defined;
- reverse dependency forbidden;
- private consumer pins accepted immutable npm/PyPI/Go SDK releases;
- clean-room private compatibility checks exist;
- current public private-target migration exceptions are an exact machine-readable allowlist.

Open migration gate:

> Publish a reusable versioned public authority-kernel artifact before the private managed authority consumes that kernel.

Without that artifact, deleting the public managed coordinator and rebuilding it private would either force forbidden Git/path/raw-source coupling or require copying the open security subtree into the private repository. Neither is accepted as closure.

After the artifact exists, the managed coordinator, Cosmos persistence, managed server/admin runtime, managed tests and private production workflows move/rebuild in TRUYN Platform; the exception list must then shrink to zero.

## Authority boundary

Public/open authority semantics include local/self-hostable account/tenant/provider authorization, grants, entitlement/accounting rules, revocation primitives, reference billing policy and snapshot/client contracts.

Private managed ownership includes globally operated authority/revocation state, cloud checkpoint persistence, managed administration, commercial reconciliation, private operational topology and global trust/routing data.

The fact that a current legacy implementation is still physically present in this repository during migration does not change its target ownership.

## Public dependency/release boundary

Accepted immutable released coordinates:

- npm `@truyn/sdk@0.1.0-alpha.2`;
- PyPI `truyn-sdk==0.1.0a1`;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`.

Maven Central and NuGet remain unpublished/open. TRUYN Platform may not replace missing releases with a public branch checkout, raw GitHub source, submodule, sibling filesystem path or vendored repo snapshot.

## D-200 boundary

D-200 scripts, benchmark implementation, predicates and sanitized evidence remain public. A D-200-related change becomes `BOTH` only when it alters a shared public contract consumed by TRUYN Platform.

## Evidence and documentation hygiene

Published benchmark evidence remains protected under redact-not-delete handling. Repository split/sanitization is not permission to delete valid benchmark evidence.

Open PR intent is not accepted implementation. Managed private production claims and public protocol maturity claims remain separate.
