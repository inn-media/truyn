# TRUYN — The Intelligence Network

**TRUYN Open** — the public Apache-2.0 protocol, SDK, Node/Relay reference implementation and conformance layer of TRUYN.

> **The Internet was built to move data. TRUYN is being built to move intelligence.**

TRUYN is a trust-aware network layer for AI agents, machines and autonomous systems: capability discovery, authorization-aware routing, signed requests/results, content-addressed state, provenance, contextual Trustability and heterogeneous AI/provider interoperability.

[Manifesto](MANIFESTO.md) · [Whitepaper](WHITEPAPER.md) · [Open/Private Boundary](docs/architecture/OPEN_CORE_BOUNDARY.md) · [Architecture](docs/architecture/ARCHITECTURE_CONTRACT.md) · [Status](docs/architecture/IMPLEMENTATION_STATUS.md) · [Roadmap](ROADMAP.md) · [SDK/DX](docs/architecture/SDK_DEVELOPER_EXPERIENCE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md)

## Two repositories, one architecture

TRUYN is no longer treated as one codebase.

### TRUYN Open — this repository

`inn-media/truyn` owns the independently implementable/interoperable layer:

- `TRUYN/1` protocol and schemas;
- cryptographic identity, envelopes, object/provenance primitives;
- Node/Relay reference implementation and CLI;
- self-hostable provider-policy/BYOK safety behavior;
- A2A/MCP/public adapter contracts;
- first-party SDKs and Agent Descriptor;
- conformance and public benchmark methodology/evidence;
- D-200 and public network qualification.

### TRUYN Platform — private managed layer

`inn-media/truyn-platform` owns proprietary managed/commercial implementation:

- managed control plane and global trust registry;
- managed authority/revocation and cloud persistence;
- reputation graph and managed routing/ranking intelligence;
- private telemetry/analytics;
- marketplace, licensing, billing and enterprise policy;
- private production operations.

The dependency rule is strict:

```text
TRUYN Open
    │
    │ released/versioned artifact or stable public contract
    ▼
TRUYN Platform
```

Public code never imports private code. Private production code does not consume public source by branch, submodule, raw URL or sibling path.

See `config/open-core-boundary.json` and `docs/architecture/CROSS_REPO_TASK_ROUTING.md`.

## Split status

**Closure baseline:** public `main@67d46b706805cc149b2a34049d49fa76b8b41da4`.

The repository boundary and task-routing model are now explicit. A bounded legacy set of managed implementation still physically exists here while the reusable public authority-kernel artifact is being separated and released. Those files are `PRIVATE_TARGET` migration exceptions, not a renewed claim that managed platform code belongs in TRUYN Open.

Current exceptions include the managed production-authority coordinator, Cosmos checkpoint adapter, managed authority server, mixed managed-authority tests and legacy production-operations workflows. The exact allowlist is machine-readable and may only shrink.

The self-hostable/local authority kernel, provider authorization/BYOK primitives, snapshot schema and open Relay client remain public by design.

## Current open-layer maturity

| Area | Public status |
|---|---|
| Signed identity / envelopes | implemented and CI-covered |
| QUIC / sessions / Kademlia / Relay | implemented; wider scale qualification continues |
| Class C WAN | accepted |
| Class D-100 | accepted |
| D-200 | **OPEN/public benchmark**; remains in this repository |
| D-1000 | open until an accepted strict campaign PASS exists |
| A2A/MCP | bounded interoperability profile accepted; stable v1 not declared |
| Five first-party SDKs | implemented/conformance-covered |
| npm | `@truyn/sdk@0.1.0-alpha.2` accepted immutable public release |
| PyPI | `truyn-sdk==0.1.0a1` accepted immutable public release |
| Go | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1` accepted immutable public release |
| Maven / NuGet | publication still open |
| Agent Descriptor | bounded valid-profile support implemented |
| Governance | G1 bootstrap Founding Stewardship |
| Stable TRUYN/1 / mainnet | not declared |

For current detail, use [Implementation Status](docs/architecture/IMPLEMENTATION_STATUS.md). Historical benchmark evidence remains under `docs/benchmarks/` and follows redact-not-delete preservation.

## D-200 rule

D-200 remains public. Benchmark scripts, predicates, network behavior and sanitized evidence stay here.

- D-200-only change → public PR only.
- D-200 causes a protocol/SDK/Descriptor shared-contract change → `BOTH`, with a linked private compatibility PR.
- proprietary managed routing/ranking or private fleet intelligence → TRUYN Platform.

## SDK / developer release

Accepted immutable public coordinates available to private consumers and third parties today:

- npm: `@truyn/sdk@0.1.0-alpha.2`;
- PyPI: `truyn-sdk==0.1.0a1`;
- Go: `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`.

Maven Central and NuGet are not treated as released dependencies until their publication gates pass. There is no source fallback.

## Quick local verification

```bash
npm install --ignore-scripts --no-audit --no-fund
npm test
```

## Documentation order

1. `spec/protocol/v1/` — normative TRUYN/1 semantics;
2. `docs/architecture/OPEN_CORE_BOUNDARY.md` — repository ownership;
3. `docs/architecture/ARCHITECTURE_CONTRACT.md` — architecture invariants;
4. `docs/architecture/IMPLEMENTATION_STATUS.md` — current factual maturity;
5. `docs/architecture/CROSS_REPO_TASK_ROUTING.md` — OPEN/PRIVATE/BOTH routing;
6. `docs/benchmarks/` — durable measured evidence;
7. `ROADMAP.md` — next gates.

## License

This public repository remains licensed under the **Apache License 2.0 (`Apache-2.0`)**. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The separate proprietary TRUYN Platform repository does not narrow, revoke or replace the Apache-2.0 rights granted here.
