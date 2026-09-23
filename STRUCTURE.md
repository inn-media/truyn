# Repository Structure

TRUYN is a **single evolving public codebase** whose protocol generation, software releases, SDK packages, interoperability profiles and benchmark maturity are versioned independently.

## Source-of-truth hierarchy

1. `spec/protocol/<generation>/` — normative protocol semantics.
2. `proto/<generation>/` — machine-readable draft wire schemas.
3. `docs/architecture/ARCHITECTURE_CONTRACT.md` — architecture ownership and invariants.
4. `docs/architecture/IMPLEMENTATION_STATUS.md` — canonical current factual maturity.
5. `docs/operations/NETWORK_SCALE_STATUS.md` — current D-Series operational state.
6. subsystem architecture / execution contracts.
7. `docs/benchmarks/` — durable measured evidence.
8. `ROADMAP.md` — next gates.
9. `README.md` and `docs/README.md` — summaries.

When current-status prose disagrees with accepted code/evidence, update the prose. Historical benchmark reports remain historical evidence; open PR intent, workflow existence or launch intent is not accepted implementation/evidence by itself.

## Main implementation directories

- `core/` — identity, capabilities, intent, objects, claims, provenance, trust/state/routing/security domain logic.
- `core/security/` — public/reference authorization, provider ownership/access/billing boundaries, grants/revocation seams.
- `network/` — QUIC, authenticated sessions, Kademlia/DHT, routing, relay, NAT/testnet mechanics.
- `runtime/` — provider/relay composition, HTTP/runtime surfaces and Agent Descriptor lifecycle.
- `adapters/mcp/`, `adapters/a2a/`, `adapters/nlweb/`, `adapters/providers/` — interoperability/provider edges.
- `sdk/` — five required first-party clients plus shared conformance/release tooling; Rust is optional.
- `trust/` — Trustability/provenance/receipt/lifecycle components.
- `storage/` — persistent state/objects/index/cache reference surfaces.
- `observability/` — metrics/traces/logging/error-budget instrumentation.
- `benchmarks/`, `tests/`, `scripts/`, `.github/` — executable qualification/evidence/operations support.
- `docs/` — architecture, compatibility, operations and append-only public evidence.

## Public / private ownership

Public `inn-media/truyn` owns open protocol/reference behavior, Node/Relay/SDK/adapters, generic BYOK/owner-isolated provider behavior, conformance, reproducible benchmark semantics and sanitized evidence.

Private `inn-media/truyn-platform` owns managed production authority/control plane, cloud orchestration, commercial entitlement/billing implementation, private topology/identities/quotas/budgets, proprietary managed optimization and raw/private telemetry.

The dependency rule is one-way:

```text
private may consume accepted/versioned public surfaces
public must never depend on private code
```

## Current maturity boundary

As of the 2026-09-23 documentation audit:

- Class C, D-100 and D-200 are accepted; D-200 repeatability is confirmed.
- D-500 has real immutable attempt history but no accepted PASS; latest run `35787480348` ended `cancelled`.
- D-1000 remains open.
- S-Series has moved from design-only into implementation/qualification; no S-Series acceptance PASS is claimed.
- E-Series public validator/recompute code is implemented/qualified; no final E benchmark PASS is claimed.
- five required SDK clients are implemented/conformance-tested; npm/PyPI/Go prereleases are accepted; Maven Central/NuGet publication remain open.
- Agent Descriptor serving/fetch/signature and bounded automatic refresh/re-sign are implemented; complete usable-interface parity remains open.
- A2A/MCP and pinned NLWeb 0.5 have bounded accepted interoperability evidence; stable TRUYN/1/A2A-MCP v1/mainnet remain unclaimed.

Canonical current facts belong in `docs/architecture/IMPLEMENTATION_STATUS.md`.

## License

Repository source, specification and first-party SDK surfaces are licensed under Apache License 2.0 (`Apache-2.0`). Distribution surfaces retain `LICENSE` and `NOTICE`.
