# TRUYN/1 Expanded CORE Registry (A–I)

**Status:** approved architectural classification; normative wire admission remains gated by per-surface conformance and accepted exact-SHA implementation evidence.

`truyn-core-v1.json` is the machine-readable list of all **80 source registry rows**: one reserved zero and 79 A–I records. It retains the exact eight-decimal-digit CODEs, names and class membership of the approved extended CORE. It does NOT introduce integer CODE fields onto the wire. Registry values are immutable identifiers, not protobuf enum assignments. Keep existing protobuf tags unchanged.

## Layer separation

1. **Registry:** name and immutable decimal CODE for taxonomy; does not imply executable wire type.
2. **Baseline signed JSON:** only `IDENTITY | OFFER | NEED | RESULT | REVOKE`; current `core/protocol/index.js` `MVP_TYPES` remains unchanged.
3. **Distinct physical surfaces:** session HELLO/WELCOME (existing signed `kind:"ACCEPT"` for WELCOME); QUIC/DHT RPC; compact `{t,i,s}`; HTTP endpoints; local/embedded trusted objects and composed behavior.
4. **New admission:** explicit versioned schema and authenticated negotiated semantic support; default disabled. Required unsupported semantic → `version_mismatch` before side effects; optional unsupported behavior → `unimplemented`. Optionality does not bypass provider policy.
5. **Implementation reality:** registered objects (including commercial commitments, state, trust, compute, heartbeat) are still CORE even if their physical wire admission is not implemented. Do not claim they are current signed `type` values.

## Immutable mappings

Session `WELCOME/A20` names existing session `kind:"ACCEPT"`, and does not conflict with future commercial `ACCEPT/C73`. `STATUS/C75` is order/commitment status; `STATE/G20` is versioned data; `OUTCOME/E00` is operation result. `SYNC/B60` does not replace context DELTA or versioned STATE DELTA. Compact letters remain `N/R/T/C/P/D`; `t=D` cannot be reassigned. Legacy JSON envelope optional `to` remains optional. All present non-signature fields remain inside TCJ1/Ed25519 signed bytes. Unknown noncritical fields already signed are not stripped or reserialized.

## Envelope extension

`ext` may be **optionally** emitted in a separately admitted `truyn.envelope.ext/1` profile. The `ext` value participates in the existing TCJ1 signature. No legacy sender is required to emit it and no legacy recipient may be assumed to enforce its lifetime or critical fields. `traceId`, `expiresAt`, `priority`, `contentType`, and `crit` semantics require verified negotiated support. Signed metadata grants neither tenant/provider authorization nor billing entitlement. Compression remains transport-scoped.

## Conformance and promotion requirements

Required qualification for any successor protocol release, beyond the bounded PR #975 PASS: Unicode/UTF-16 key sorting, escaping, ECMAScript numeric forms, nested fields, signed unknown members, optional `to`, valid and tampered `ext`, identity/key mismatch, nonce/replay, expiration, provider denial and exactly-once lifecycle. All legacy/new sender/receiver combinations, affected HTTP/QUIC/compact/SDK/native adapters and private managed consumer must pass. Never switch to multi-canonicalization verification fallback. Accepted historic D/S/T/E/N/H/A evidence is immutable and scoped to its original exact SHA; current code needs its own qualification.

See [approved baseline](../../docs/compatibility/TRUYN1_EXPANDED_CORE_WIRE_FREEZE_APPROVAL_BASELINE.md) and the separate approved architecture source documents before implementing.
