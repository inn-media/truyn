# Repository Structure

TRUYN is a **single evolving codebase**. Software releases, protocol generations, wire schemas, external adapters, SDKs and governance maturity are versioned independently.

## Source-of-truth hierarchy

1. `spec/protocol/<generation>/` — normative protocol semantics.
2. `proto/<generation>/` — machine-readable wire schema.
3. `GOVERNANCE.md` + `docs/governance/` — normative change process.
4. `docs/architecture/ARCHITECTURE_CONTRACT.md` — architecture ownership/invariants.
5. `docs/architecture/IMPLEMENTATION_STATUS.md` — canonical factual maturity/status.
6. subsystem architecture documents.
7. `docs/benchmarks/` — durable measured evidence.
8. `README.md` — public summary.
9. `ROADMAP.md` — sequencing and next gates.

When current-status prose disagrees with accepted code/evidence, update the prose. Open PR intent is not accepted implementation.

## Main implementation directories

- `core/` — identity, capability, intent, objects, claims, provenance, trust/state/routing/security domain logic.
- `core/security/` — Account/Tenant authority, provider access/billing, grants, entitlements, accounting, revocation and managed authority checkpoint/composition.
- `network/` — QUIC, authenticated sessions, Kademlia/DHT, routing, relay, NAT traversal and testnet mechanics.
- `runtime/` — provider/relay composition plus managed authority service/client/readiness surfaces.
- `adapters/mcp/`, `adapters/a2a/`, `adapters/providers/` — external protocol/provider edges.
- `sdk/` — five-language first-party Developer Release clients.
- `trust/` — Trustability/provenance/receipts/lifecycle components.
- `storage/` — persistent state/objects/index/cache.
- `observability/` — metrics/traces/logging/error-budget instrumentation.
- `tests/`, `benchmarks/`, `scripts/`, `.github/` — executable conformance/evidence/operations support.

## Authority ownership

PR `#425` owns the bounded Account → Organization → Tenant hierarchy. PR `#433` owns the durable single-filesystem Production Authority; PR `#456` owns correctness repairs. PR `#457` adds accepted managed authority repository/runtime support: Cosmos checkpointing over managed identity/AAD, monotonic revision/digest/ETag fencing, authority role/API, monotonic relay snapshot cache and fail-closed readiness.

`#457` does not prove a provisioned/live multi-region authority deployment, production migration/cutover, continuous backup or restore acceptance. Those remain deployment gates.

## Interoperability ownership

A2A and MCP are adapters, not TRUYN/1 primitives. Accepted bounded evidence includes C1–C8, independent official A2A/MCP black-box proofs, P2-E1/Sprint E referenced-artifact interoperability, P2-E2 `a2a-mcp-pre-v1/g1` compatibility and P2-E3 canonical documentation reconciliation.

**Stable A2A/MCP v1 is not declared** because `TRUYN/1` remains draft.

## SDK / developer surface

All five required first-party SDKs — TypeScript/JavaScript, Python, Go, Java and C#/.NET — implement the bounded relay-client contract and participate in executable conformance. PyPI and Go public alphas are accepted. npm alpha.1 is immutable historical evidence whose required clean-room ESM import failed; the distinct alpha.2 packaging repair is merged in `#448` and remains public-registry-evidence gated. Maven Central and NuGet remain open.

## Current maturity boundary

Class C and D-100 are accepted; D-1000 remains open. Production operations contracts exist but live 28-day/telemetry/pager/restore evidence remains open. Durable authority plus managed runtime support are implemented, while live managed deployment/multi-region/recovery/propagation evidence remains open. Production Trust Authority remains open in PR `#438`. Governance remains G1 bootstrap Founding Stewardship. Mainnet and stable `TRUYN/1` are not claimed.

Canonical current facts belong in `docs/architecture/IMPLEMENTATION_STATUS.md`.

## License

Repository source, specification and first-party SDK surfaces are licensed under the **Apache License 2.0 (`Apache-2.0`)**. Distribution surfaces must retain the required `LICENSE` and `NOTICE` material.
