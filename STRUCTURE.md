# Repository Structure

TRUYN is a **single evolving codebase**. Software releases, TRUYN protocol generations, wire schemas, external adapters, SDKs and governance maturity are versioned independently.

```text
Software release      repository tags/releases
Network protocol      TRUYN/1, TRUYN/2, ...
Wire schema           proto/v1, proto/v2, ...
External adapters     A2A / MCP versions independently negotiated
SDK packages          independently versioned within compatibility policy
Governance            G0→G5 maturity under GOVERNANCE.md
```

## Source-of-truth hierarchy

1. `spec/protocol/<generation>/` — normative protocol semantics.
2. `proto/<generation>/` — machine-readable wire schema.
3. `GOVERNANCE.md` + `docs/governance/` — process for changing normative project contracts.
4. `docs/architecture/ARCHITECTURE_CONTRACT.md` — subsystem/source ownership and cross-document invariants.
5. `docs/architecture/IMPLEMENTATION_STATUS.md` — canonical factual maturity/status.
6. subsystem architecture documents — implementation contracts and target boundaries.
7. `docs/benchmarks/` — durable measured evidence.
8. `WHITEPAPER.md` — scientific rationale and research framing.
9. `README.md` — human-facing project summary.
10. `ROADMAP.md` — sequencing and maturity gates.

When current-status documents disagree with accepted code/evidence, the documents must be corrected; stale prose is not an implementation rollback.

## Root documents

- `README.md` — public entry point and current factual summary.
- `MANIFESTO.md` — values/direction.
- `WHITEPAPER.md` — research and engineering rationale.
- `STRUCTURE.md` — repository ownership/versioning model.
- `ROADMAP.md` — current accepted gates and next sequence.
- `GOVERNANCE.md` / `MAINTAINERS.md` — governance contract and factual roles.
- `LICENSE` / `NOTICE` — Apache-2.0 licensing/attribution.
- `SECURITY.md` — security reporting and public security boundary.
- `CONTRIBUTING.md` / `DCO` — contribution process and DCO 1.1.
- `CHANGELOG.md` — historical changes; historical statements are not automatically current status.

## Main implementation directories

- `core/` — identity, capability, intent, objects, claims, provenance, trust/state/routing/security domain logic.
- `core/security/` — implemented provider access/billing/relay security reference boundaries.
- `network/` — QUIC transport, authenticated sessions, Kademlia/DHT, routing, relay, NAT traversal and testnet mechanics.
- `node/` — long-running TRUYN node composition.
- `runtime/` — executable relay/provider runtime composition.
- `cli/` — user-facing commands and BYOK setup/runtime entry points.
- `adapters/` — external AI/model/agent/protocol bridges.
- `adapters/mcp/` — implemented bounded MCP server/client/current-contract surfaces.
- `adapters/a2a/` — **implemented** A2A server and client/provider surfaces. This directory is no longer a reserved future target.
- `adapters/providers/` — provider-specific and imported MCP/A2A provider adapters.
- `sdk/` — first-party SDK program. TypeScript/JavaScript and Python reference clients exist; Go/Java/.NET parity/publication remains later work.
- `gateways/` — HTTP/legacy compatibility bridges.
- `compute/` — compute-near-data/sandbox/execution-policy ownership as it matures.
- `trust/` — Trustability/provenance/receipts/lifecycle components.
- `storage/` — persistent state/objects/index/cache data and migrations.
- `economics/` — settlement-neutral pricing/accounting abstractions; no implicit authorization.
- `config/`, `bootstrap/` — network/runtime profiles and bootstrap configuration.
- `tests/` — unit/integration/network/security/interoperability/SDK conformance tests.
- `benchmarks/` — benchmark code; durable reports live under `docs/benchmarks/`.
- `scripts/` — development, evidence, release and testnet helpers.
- `.github/` — CI/security/temporary bounded operational workflows.

## Interoperability ownership

A2A and MCP are external adapter protocols, not TRUYN/1 primitives.

```text
A2A / MCP client or server
        ↓
adapters/a2a or adapters/mcp
        ↓ version/auth/correlation/integrity normalization
TRUYN node + provider authorization/billing
        ↓
TRUYN network / provider execution
```

Current repository ownership is factual, not aspirational:

- `adapters/a2a/server.js` — A2A facade;
- `adapters/a2a/client.js` — remote A2A client;
- `adapters/a2a/task-store.js` — A2A task correlation/state;
- `adapters/a2a/artifact-integrity.js` — accepted artifact-integrity boundary;
- `adapters/providers/a2a-discovery.js` — explicit remote skill discovery/import;
- `adapters/mcp/server.js` — TRUYN MCP surface;
- `adapters/mcp/client.js` — current MCP remote client;
- `adapters/providers/mcp-discovery.js` — explicit MCP tool discovery/import;
- `tests/interoperability-bidirectional.test.js` — accepted C7 in-repository proof of both cross-protocol directions.

The old wording that A2A is “architecture-only” or that `tests/interoperability/` is merely a future owner is obsolete. Current interoperability tests are ordinary `tests/*.test.js` files and therefore run through the repository test command.

## SDK / developer surface

Current main includes TypeScript/JavaScript and Python first-party reference SDK work. PR `#373` adds the bounded DX-3 surface: stable API-v1 primitives for those clients, authenticated relay event streaming with abortable waits, reference-only object/artifact payloads, conformance markers and developer-site source.

Remote provider-side NEED cancellation and token-delta streaming remain follow-up work. Go/Java/.NET parity and full package/release stability are not yet complete.

## Documentation tree

```text
docs/
├── architecture/     architecture contracts + canonical implementation status
├── benchmarks/       durable sanitized evidence ledger
├── compatibility/    protocol/node/adapter/A2A/MCP/SDK compatibility
├── concepts/         explanatory concepts
├── decisions/        architecture/implementation decisions
├── governance/       RFC/extension/decision process
├── getting-started/  BYOK/MVP/SDK onboarding
├── operations/       node/testnet/billing operations
├── security/         detailed security architecture/runbooks
└── trustability/     trust/claim lifecycle documentation
```

## Public/private boundary

The public repository owns protocol/architecture, generic adapters, SDKs, tests, examples and sanitized reproducible evidence. Credentials, private keys, privileged identities/topology, private origins, customer data, secret-bearing URLs and sensitive live quota/accounting data belong to protected operational systems.

A public A2A Agent Card, MCP endpoint or TRUYN Agent Descriptor may expose only intentionally visible interface/capability information. Reachability never grants use of a private provider.

## Canonical TRUYN/1 vocabulary

Top-level protocol objects remain:

```text
IDENTITY
OFFER
NEED
OBJECT
CLAIM
ATTEST
STATE
DELTA
SUBSCRIBE
COMPUTE
RESULT
TRUST_RECEIPT
REVOKE
```

A2A Agent Cards/Tasks/Artifacts and MCP Tools/Resources are adapter objects, not TRUYN/1 wire primitives. Provider policy is an authorization layer, not a new requester-controlled protocol object.

## Current maturity boundary

Class C and D-100 are accepted; D-1000 remains open. C1–C7 A2A/MCP bounded interoperability is accepted; C8 is open. TypeScript/Python SDK/DX work exists including merged DX-3, while broader SDK parity/stability remains open. Governance is G1 bootstrap Founding Stewardship. Mainnet and stable TRUYN/1 compatibility are not yet claimed.

Canonical current facts belong in `docs/architecture/IMPLEMENTATION_STATUS.md`.
