# TRUYN Open Roadmap

This roadmap is for the public **TRUYN Open** layer. Managed/commercial production implementation is owned by the private **TRUYN Platform** repository `inn-media/truyn-platform`.

Normative protocol semantics live in `spec/`; current factual status lives in `docs/architecture/IMPLEMENTATION_STATUS.md`; measured public evidence lives in `docs/benchmarks/`.

## P0 — Two-Repository Closure — ACTIVE

### O0 — Boundary and task routing

- [x] define `OPEN / PRIVATE_TARGET / SHARED_CONTRACT` ownership;
- [x] make D-200 explicitly OPEN;
- [x] require `OPEN / PRIVATE / BOTH` task routing;
- [x] forbid reverse dependency and private source/path consumption;
- [x] record the current private-target migration exception allowlist.

### O1 — Released public authority kernel

Publish the reusable self-hostable authority/control-plane contract needed by the private managed implementation as a versioned public artifact. It must expose only the open reference/kernel surface required by a managed consumer and must not include proprietary platform behavior.

**DoD:** private code can consume the authority kernel by immutable released coordinate; no Git branch, raw source, sibling path, submodule or vendored repository snapshot is required.

### O2 — Managed implementation migration

After O1:

- move/rebuild managed cloud authority/revocation coordinator in `truyn-platform`;
- move Cosmos/managed-cloud persistence there;
- move managed authority server/admin runtime there;
- migrate managed tests and private operational workflows/evidence;
- retain public snapshot/client/reference/self-hosting primitives here.

**DoD:** corresponding entries disappear from `config/open-core-boundary.json#migrationExceptions` and private tests cover the managed implementation.

### O3 — Zero migration exceptions

- remove final private-target code/workflows from public;
- public CI rejects reintroduction;
- private CI validates immutable public dependency pins and clean-room compatibility;
- docs in both repositories agree on ownership.

**DoD:** `migrationExceptions=[]` and exact-head CI is green in both repositories.

## Network productionization — OPEN

Class C and D-100 accepted history remains public evidence. D-200 and D-1000 are public network-qualification tracks and do not move to TRUYN Platform.

D-200 rule:

- benchmark/network-only work = `OPEN`;
- public contract change caused by D-200 = `BOTH` with private compatibility work;
- proprietary managed routing/ranking/telemetry intelligence = `PRIVATE`.

Strict D-1000 acceptance still requires the canonical target topology and unchanged safety/routing/recovery predicates with durable evidence.

## Protocol / interoperability

`TRUYN/1` remains draft. A2A and MCP remain adapters rather than TRUYN/1 wire dependencies. Stable-v1 is declared only after the public protocol and compatibility contracts meet their stability gates.

## SDK / Developer Release

Implemented public first-party clients:

- TypeScript/JavaScript;
- Python;
- Go;
- Java;
- C#/.NET.

Accepted immutable releases:

- npm `@truyn/sdk@0.1.0-alpha.2`;
- PyPI `truyn-sdk==0.1.0a1`;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`.

Open public release gates: Maven Central, NuGet, remaining Descriptor parity/liveness work, and the reusable authority-kernel artifact required for full two-repository closure.

## Trustability

Public claim/provenance/Trustability primitives, schemas and conformance remain here. A managed global trust registry, proprietary reputation graph, managed revocation governance and network-wide trust intelligence belong to TRUYN Platform.

A private implementation must not redefine the public trust/protocol contract outside public governance.

## Production operations boundary

Generic/self-hosting operational contracts and sanitized benchmark evidence may remain public when they are required to reproduce or operate the open reference layer.

InnMedia-specific managed production deployment, global telemetry backends, private rosters, commercial quotas/cost controls, privileged cloud topology and private operational evidence belong to TRUYN Platform. Legacy production workflows currently in this repository are explicit migration exceptions and are not a precedent for adding more.

## Governance

TRUYN Open remains G1 bootstrap Founding Stewardship while moving toward external maintainers, a multi-organization TSC and neutral stewardship. The private TRUYN Platform is commercially owned/operated by InnMedia, but that ownership does not create private normative authority over the public protocol.

## Stable/mainnet gate

Before stable public mainnet claims: accepted network-scale qualification; stable protocol/interoperability; complete public SDK/release surface; appropriate security/operations evidence for the open network; and governance maturity appropriate to the claim.

Private TRUYN Platform production readiness is a separate commercial/operational gate and must not be used to overstate public protocol maturity—or vice versa.
