# A2A / MCP P2 Final Acceptance Evidence

**Status:** consolidated P2-E1/P2-E2 acceptance authority and P2-E3 canonical reconciliation record.  
**Evidence date:** 2026-09-05  
**Protocol:** `TRUYN/1` draft  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`  
**Stable A2A/MCP v1 guarantee:** **NOT DECLARED**

This record consolidates the bounded external interoperability and compatibility evidence accepted by P2-E1 and P2-E2. It does not widen the supported A2A/MCP surface, change TRUYN wire semantics, or convert the draft protocol into stable-v1.

## P2-E1 — external referenced artifact interoperability

**Result:** `ACCEPTED / CLOSED`  
**PR:** `#427`

### Exact pre-merge authority

- fresh-base parent: `main@77172160940cc073911149ed41196d5aceca6a7e`
- exact verified head: `8e4bf36da61d15ea303fbf3261f996edd0622e8f`
- exact-head CI: `33956586454` — PASS
- exact-head CodeQL: `33956585400` — PASS across Actions, JavaScript/TypeScript, Python, Go, Java/Kotlin and C#
- unresolved review threads: `0`
- ancestry at merge: `ahead=1`, `behind=0`
- mergeability at merge: `true`

### Merge + exact post-merge authority

- exact merged-main SHA: `a85f9294c115c6d6db9dc90d63491c2e6d1af97f`
- post-merge main CI: `33956750696` — PASS
- post-merge main CodeQL: `33956750451` — PASS across all six configured analyses

### Deterministic external artifact

```text
filename:    interop-proof.bin
media type:  application/octet-stream
size:        29 bytes
sha256:      257b10be1e90139219f3aa9edbbdea24a80ef453cbbc16e840e1c34d0b24abae
content:     "TRUYN Sprint E interop proof\n"
```

Accepted directions:

```text
MCP client
→ TRUYN
→ independent official A2A server
→ referenced URL file
→ explicit resolver
→ C6 SHA-256 + size verification
→ TRUYN RESULT
→ MCP
```

and:

```text
A2A client
→ TRUYN
→ independent official MCP server
→ standard resource_link
→ explicit resources/read resolver
→ C6 SHA-256 + size verification
→ TRUYN
→ A2A Artifact
```

External SDK pins remain exact:

```text
@a2a-js/sdk                    1.0.1
@modelcontextprotocol/server   2.0.0
```

P2-E1 preserves explicit-only materialization, no implicit arbitrary URL fetching, filename/MIME/size/digest preservation, authoritative TRUYN provenance, exactly-once valid remote execution, fail-closed corrupt digest/size handling, zero reference materialization when the resolver is absent, and clean fixture shutdown `{ code: 0, signal: null }`.

Durable detailed authority: `A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md`.

## P2-E2 — bounded pre-v1 compatibility promise

**Result:** `ACCEPTED / CLOSED`  
**PR:** `#432`  
**Compatibility generation:** `a2a-mcp-pre-v1/g1`

### Accepted version profile

- TRUYN: `TRUYN/1` draft
- A2A: JSON-RPC `1.0`
- MCP import/provider: `2026-07-28`
- MCP facade/server: `2026-07-28`
- bounded legacy inbound MCP facade: `2025-11-25`, `2025-06-18`

### Exact pre-merge authority

- exact base: `main@ea6bb010891019b8a24c94feb31c672579b91913`
- exact verified head: `0624058077078e5a56a4caba2bb47b223030e4a0`
- exact-head CI: `33959082248` — PASS
  - DCO PASS
  - Go / Java / .NET compile PASS
  - five-language executable SDK conformance PASS
  - SDK package build/verification PASS
  - full `npm test` PASS
  - `git diff --check` PASS
- exact-head CodeQL: `33959079091` — 6/6 PASS
- unresolved review threads: `0`
- ancestry at merge: `ahead=1`, `behind=0`
- mergeability at merge: `true`

### Merge + exact post-merge authority

- exact merged-main SHA: `6f64c3dc6333044126916d3dd0a118e3cf8220d4`
- post-merge main CI: `33959237543` — PASS
- post-merge main CodeQL: `33959237875` — 6/6 PASS

### Accepted negotiation contract

- supported declared version + supported required semantics → execute;
- declared legacy version on a direction where explicitly supported → execute;
- unsupported required version → deterministic fail;
- missing required version → deterministic fail;
- unknown optional semantic → may be ignored without changing authority;
- unknown required semantic → fail closed.

Generation `g1` does not permit silent changes to correlation semantics, artifact-integrity semantics, authorization boundaries, provider-ownership authority, billing authority, or exactly-once remote execution semantics.

Durable policy authority: `A2A_MCP_STABILITY.md`.  
Machine-readable authority: `../../adapters/compatibility/a2a-mcp.js`.  
Executable authority: `../../tests/a2a-mcp-compatibility-promise.test.js`.

## Combined accepted P2 surface

With P2-E1 and P2-E2 closed, the repository may accurately claim all of the following for the bounded declared profile:

- C1–C8 interoperability/security evidence remains accepted;
- independent official A2A and MCP black-box interoperability exists in both directions;
- one deterministic external referenced binary artifact is carried bidirectionally with explicit materialization and exact SHA-256/size verification;
- compatibility generation `a2a-mcp-pre-v1/g1` is declared and executable;
- version negotiation is explicit and fail closed for required unsupported semantics;
- artifact, correlation, authorization, provider-ownership, billing and exactly-once invariants remain part of the compatibility promise.

## Explicit non-claims

P2 closure does **not** claim:

- stable A2A/MCP v1 compatibility;
- stable `TRUYN/1`;
- ecosystem-wide certification across all A2A/MCP implementations;
- every optional A2A streaming/push/extension surface;
- arbitrary MCP resources/prompts/apps/subscriptions;
- generalized `MCP resources → TRUYN OBJECT/STATE` import/publication semantics;
- arbitrary remote URL fetching;
- authority derived from external requester/provider/tenant/billing metadata.

The correct public statement is:

> TRUYN has accepted bounded bidirectional external A2A/MCP interoperability with integrity-verified referenced artifacts and a CI-enforced bounded pre-v1 compatibility promise (`a2a-mcp-pre-v1/g1`). Stable A2A/MCP v1 compatibility is not yet declared because `TRUYN/1` remains draft.

## P2-E3 documentation reconciliation gate

P2-E3 is the canonical reconciliation step that makes the public/status documents agree with the accepted P2-E1 and P2-E2 evidence. Its exact PR-head and post-merge workflow authority is recorded in PR `#459`, avoiding a self-referential evidence file whose contents would change the SHA it attempts to record.

Canonical reconciliation scope:

- `README.md`
- `ROADMAP.md`
- `docs/architecture/A2A_MCP_INTEROPERABILITY.md`
- `docs/architecture/IMPLEMENTATION_STATUS.md`
- `docs/compatibility/A2A_MCP_COMPATIBILITY.md`

The reconciliation preserves the distinction between **bounded pre-v1 compatibility accepted** and **stable-v1 not declared**.
