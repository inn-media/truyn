# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical bounded interoperability architecture synchronized through C8, P2-E1/Sprint E, P2-E2 `a2a-mcp-pre-v1/g1` and P2-E3 reconciliation.  
**Snapshot:** 2026-09-05  
**Synchronized source:** `main@95b98ce6890bf13755062d4e71af48d7a572bff1`  
**Protocol:** `TRUYN/1` draft  
**Stable A2A/MCP v1:** **not declared**

A2A and MCP are external adapter edges around TRUYN. They do not redefine TRUYN identity, provider ownership, authorization, billing, settlement, provenance or Trustability.

## Accepted bounded profile

| Gate | State |
|---|---|
| C1–C7 implementation/composition | **ACCEPTED** |
| Sprint C independent official A2A SDK | **ACCEPTED** |
| Sprint D independent official MCP SDK | **ACCEPTED** |
| C8 adversarial cross-protocol matrix | **ACCEPTED — PR #423** |
| P2-E1 / Sprint E referenced artifact | **ACCEPTED — PR #427** |
| P2-E2 `a2a-mcp-pre-v1/g1` | **ACCEPTED — PR #432** |
| P2-E3 canonical docs reconciliation | **ACCEPTED / merged — PR #459** |
| Stable A2A/MCP v1 | **NOT DECLARED** |

## Artifact integrity — P2-E1 / Sprint E

The accepted external referenced-artifact profile uses:

```text
filename:   interop-proof.bin
mediaType:  application/octet-stream
size:       29 bytes
sha256:     257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
```

Both directions require explicit materialization, exact SHA-256/size verification, bounded content, authoritative TRUYN provenance and no implicit arbitrary URL fetch. Missing resolver or corrupt integrity fails closed; valid remote application execution remains exactly once.

Sprint E does not create generalized `MCP resources → TRUYN OBJECT/STATE` semantics.

## Security / authority invariants

- unauthorized discovery hides private/ineligible providers;
- unauthorized requests cause zero remote provider execution;
- A2A/MCP requester/owner/tenant/billing metadata cannot substitute TRUYN authority;
- transport credentials remain adapter-local;
- correlation mismatch/replay fails closed;
- polling/retry/fallback cannot duplicate remote application side effects;
- invalid artifacts/malformed external responses cannot become success;
- settlement metadata cannot bypass provider/billing authority.

## P2-E2 compatibility generation

Generation `a2a-mcp-pre-v1/g1` declares explicit supported profiles, fail-closed version/required-semantic negotiation, migration/deprecation rules and immutable correlation, integrity, authorization, provider-owner, billing and exactly-once semantics inside the generation.

This is deliberately pre-v1. **Stable A2A/MCP v1 is not declared.** `TRUYN/1` remains draft.

## P2-E3 reconciliation

PR `#459` reconciles the canonical status documents and adds a regression test preventing a return to superseded P2-E1/P2-E2 open-gate wording or accidental stable-v1 claims.

See `../compatibility/A2A_MCP_COMPATIBILITY.md`, `../compatibility/A2A_MCP_STABILITY.md`, `../compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`, `../compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md` and `IMPLEMENTATION_STATUS.md`.
