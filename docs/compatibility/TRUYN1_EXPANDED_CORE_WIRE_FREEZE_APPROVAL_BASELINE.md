# TRUYN/1 Expanded CORE Wire Freeze — Approval Baseline

**Status:** APPROVED DESIGN INPUT / IMPLEMENTATION NOT QUALIFIED / NO PRODUCTION ADMISSION  
**Date:** 2026-10-11  
**Public baseline:** `3384001baf4cc757adc7cc55efd8f241c77e06de`  
**Private baseline:** `727ec5ba39aea51644c6132ed149614e1cd7b74e`

## Authoritative source manifest

The user-approved uploaded files, which must be preserved byte-exact and consulted before modifying implementation:

| Source | SHA-256 |
| --- | --- |
| `TRUYN_WIRE_FREEZE_CORE_FINAL(1).md` | `591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121` |
| `TRUYN_WIRE_FREEZE_EXTENSIONS_FINAL(1).md` | `c345631992e3e96f84e67dcf48a85c15281f5912ae1bfd131c5f904b9da46e72` |
| Approved task instruction `Вставленный текст(3).txt` | `cbe7d876890ba5abc67fcb5c8d2589d14aa9b20258139ac39702e08c35b27871` |

This document is an **implementation boundary and pointer**, not a replacement for either approved source. No stable-v1, mainnet, conformance, deployment or benchmark claim is made here.

## Non-negotiable architectural resolution

1. Preserve the **entire extended CORE registry A–I**, including SESSION, CONTROL, ENVELOPE, COMMITMENT, COMPACT, OUTCOME, TELEMETRY, DATA, TRUST and COMPUTE, with original eight-digit **decimal registry codes** and Short aliases. Registry entries are not automatically separate wire `type` values; category headers and composed semantic objects do not become physical messages.
2. Preserve existing bounded signed JSON `MVP_TYPES` exactly: `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE`. Do **not** expand them from registry additions, nor require legacy peers to support new optional semantics.
3. Preserve Ed25519 signatures over UTF-8 TCJ1 unsigned JSON with **no additional domain prefix**. Preserve identity derivation, existing signed fields, optional `to`, full present-field signing coverage, existing `kind:"ACCEPT"` session wire format (registry semantic name WELCOME), QUIC/DHT methods, `{t,i,s}` compact letters, relay/contexts paths, HTTP/MCP/A2A/NLWeb/REST interfaces, historical signed state and released SDK artifacts.
4. `ext` is **optional signed Envelope metadata** with `truyn.envelope.ext/1` semantics admitted only by authenticated explicit negotiation. Legacy absence must behave identically to before. `traceId`, `expiresAt`, `priority`, `contentType`, `crit` do not independently give authority; unknown critical semantics must fail closed in the negotiated profile. Compression is transport-only.
5. Normalize SDK TCJ1 writers/verifiers against shared byte-exact golden vectors; **never** add alternative canonicalization fallback or silently re-sign historical evidence. Test JS/TS, Python, Go, Java and .NET independently, including old-to-new and new-to-old peer combinations.
6. Treat additional EXTENSION/PROFILE candidates as opt-in only, default OFF, with per-feature admission and conformance; COMPOSED uses existing supported shapes. Device control remains subject to local independent safety systems and authenticated operator/provider authorization. Payment proof never implies entitlement or provider authority.
7. Keep historical D/S/T/E/N/H/A run evidence immutable. Inspect active tasks/PRs, resource locks, exact SHA and consumer dependencies before any material code or deployment change; use isolated staging/canary and reversible rollback. Do not force unrelated active campaigns to restart.

## Existing parallel PR

Public draft PR [#962](https://github.com/inn-media/truyn/pull/962) proposes a bounded five-type core and hardware horizon. Its **physical five-kind** inventory is compatible with this freeze, but its naming must not be interpreted as deleting or downgrading the full A–I semantic CORE. Avoid duplicate edits and merge conflicts; compare exact main and this PR before further changes. Draft #962 is **not** accepted production evidence.

## Gate ledger

| Gate | Required evidence | State at creation |
| --- | --- | --- |
| G0 | Read-only live public/private SHA, active jobs, baseline and dependency audit | OPEN |
| G1 | Approved complete A–I registry, semantic/physical/role mappings and machine-readable codes | OPEN |
| G2 | Current signed-envelope and TCJ1 canonical bytes preserved | OPEN |
| G3 | Five SDK golden + negative cases, legacy released package interop | OPEN |
| G4 | Negotiated optional `ext` with legacy pass-through and security negatives | OPEN |
| G5 | Lifecycle, identity/authority, replay, exactly-once and transport adapters | OPEN |
| G6 | Public/private consumer pins, digest-bound release and isolation | OPEN |
| G7 | Exact-head CI/DCO/security, merge and exact merged SHA requalification | OPEN |
| G8 | Production canary, SLO/operations and independent mainnet assurance | SEPARATE ADMISSION |

Never upgrade an OPEN status merely because this design file is merged.

## Work order

Read-only inventory → normative spec/registry reconciliation → machine-readable golden fixtures → SDK repairs on exact source → default-off negotiation implementation → old/new transport and authority regression → independently qualified public release → private consumer pin/staging → separate rollout approval. Repository updates and full documentation sanitation follow this ordering; historical evidence stays append-only/redact-not-delete.

## 2026-10-11 candidate lifecycle implementation checkpoint

This is additive progress tracking; it does **not** edit or override the approved source manifest or original G5=OPEN classification. A separate task-scoped branch adds the bounded direct lifecycle state machine at `spec/protocol/v1/lifecycle.md` and a reference relay-epoch replay guard with targeted negatives. Since durable cross-restart, multi-replica idempotency and provider-side exactly-once are not proven, G5 stays **OPEN** pending exact-head/post-merge conformance and independent qualification. No Mainnet or private deployment is implied.
