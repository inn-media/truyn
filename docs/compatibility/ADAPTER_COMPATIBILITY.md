# TRUYN Adapter Compatibility

**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol:** `TRUYN/1` draft

Adapter compatibility is independent from TRUYN protocol stability. An adapter may support a declared A2A/MCP/provider profile without changing TRUYN/1 wire semantics.

## Required invariants

Compatible adapters must preserve authenticated TRUYN identity and server-side authority; provider visibility/access/grant/entitlement/billing boundaries; credential locality; explicit external-version handling; deterministic unsupported/error states; correlation integrity; explicit-only artifact/reference materialization; and exactly-once remote side effects where the profile claims them.

## A2A / MCP

The accepted bounded profile includes C1–C8, independent official SDK black-box evidence, **P2-E1 / Sprint E** external referenced artifacts and **P2-E2** generation `a2a-mcp-pre-v1/g1`. P2-E3 in PR `#459` reconciles canonical status documentation.

**Stable A2A/MCP v1 is not declared** because `TRUYN/1` remains draft.

Adapter upgrades do not require a new TRUYN protocol generation unless TRUYN network semantics change, but breaking a promised A2A/MCP generation requires the declared migration/generation process.
