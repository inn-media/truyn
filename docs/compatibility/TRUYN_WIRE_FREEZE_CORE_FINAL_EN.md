# TRUYN/1 Final Wire Freeze Architecture — English CORE Reference

**Status:** APPROVED SOURCE-DERIVED DESIGN REFERENCE / NO NEW WIRE ADMISSION / NOT STABLE V1.
**English edition:** October 13, 2026. **Source approval:** October 11, 2026.
**Original source SHA-256:** `591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121`.

This English technical reference faithfully preserves the frozen architecture, semantic identifiers, obligations and full machine registry. It is a new English edition, **not byte-identical to the original-language source**. The original source digest remains provenance; this document has its own independent Git blob and content digest.

## Repositories and authority

- `inn-media/truyn` owns public normative protocol, Node/Relay, first-party SDKs, conformance and public benchmark evidence.
- `inn-media/truyn-platform` owns proprietary managed authority, tenant, metering, billing, topology and operations. It consumes only accepted immutable public artifacts/contracts.
- A semantic CORE registry record is **not** a physical signed Envelope type, execution entitlement or requirement that pre-existing alpha peers implement new handlers.
- Existing signed JSON Envelope kinds remain **IDENTITY, OFFER, NEED, RESULT, REVOKE**; do not expand `MVP_TYPES`.
- Decimal eight-digit registry CODE values and Short aliases are reserved for documentation/telemetry until separately negotiated encoding. Do not insert them into current signed envelopes, QUIC methods, session frames, compact frames or HTTP responses.
- No change to historical signatures, TCJ1, Ed25519, Node ID, accepted alpha artifacts, provider authorization, wire errors or frozen network regression thresholds.

## Complete CORE taxonomy

A: SESSION; B: CONTROL; C: ENVELOPE and COMMITMENT; D: COMPACT; E: OUTCOME; F: TELEMETRY; G: DATA; H: TRUST; I: COMPUTE. None of these classes is deleted or demoted by the five-kind bounded wire transport. Only builds explicitly claiming a future full profile must meet its full qualified conformance; older published profiles keep their documented supported-surface matrix.

### Stable distinctions

- SESSION registry WELCOME/A20 maps to existing authenticated-session `kind:"ACCEPT"`. Never rename that wire literal. COMMITMENT ACCEPT/C73 has separate meaning.
- STATUS/C75, STATE/G20, OUTCOME/E00 and HEARTBEAT/F40 describe distinct constructs.
- SYNC/B60, domain DELTA/G30 and existing CONTEXT_DELTA/D60 are not interchangeable.
- The existing QUIC DHT methods `dht.ping`, `dht.find-node`, `peer.announce`, `dht.store`, `dht.find-value` remain unchanged. DHT RF3/minAcks2 stays in force.
- Compact frame fields `{t,i,s}` and aliases `N/R/T/C/P/D` remain unchanged. PARTIAL is a compact lifecycle record, not a sixth signed top-level Envelope kind.
- CAPABILITY is an OFFER/NEED descriptor, OBJECT a verified content-addressed reference, and CLAIM/ATTEST/PROOF structured trust objects or compositions; none automatically becomes a new Envelope type.
- Session negotiation must keep legacy HELLO fields and signed bytes intact. Required semantics use deterministic authenticated opt-in negotiation and fail closed if unsupported.
- Provider discovery/Agent Descriptor and OFFER do not grant runtime authorization. Owner, tenant, entitlement, quota and provider eligibility remain authoritative server-side decisions.

## Envelope and canonicalization

The bounded JSON Envelope has required `protocol`, `type`, `id`, `from`, `createdAt`, `publicKey`, object `payload` and `signature`. Optional `to` remains optional on wire even if current writers emit `to:null`. A single optional `ext` dictionary is admitted only under negotiated `truyn.envelope.ext/1`.

Sign Ed25519 over UTF-8 `TCJ1(unsignedEnvelope)` with **only the top-level signature removed**; there is no additional domain prefix or alternative fallback. Recursively sort JSON object keys by UTF-16 code unit, preserve array order, emit Unicode/emoji literally when valid UTF-8, escape only JSON-required characters, and use finite ECMAScript shortest round-trippable number serialization (including negative zero and exponent boundaries). Preserve signed unknown optional fields rather than reconstructing a lossy DTO. The I-JSON compatibility constraints must not retroactively reinterpret verified historical finite-number signatures.

### Optional ext/1 contract

`ext` is an authenticated signed optional object, default-off: at most 16 ASCII keys and 1024 canonical bytes. Keys are bounded ASCII identifiers; values are bounded ASCII strings except `crit` (an array of distinct in-object key names). Registered fields are `traceId`, `expiresAt`, `priority`, `contentType`, `crit`. Verify signature first; only then validate the negotiated semantics. Unknown critical keys fail `version_mismatch`. Expired envelopes fail `deadline_exceeded` before dispatch, observing the established clock tolerance; `critical` is a policy-limited hint and may be lowered to `normal`. Unsupported content profile fails `unimplemented`. Legacy peers must not be assumed to enforce `expiresAt` or `crit`. Compression remains transport-only.

Rollout: passive understanding, authenticated advertisement, sender-side opt-in emission, and finally explicit `requiredSemantics` only for peers known to support it. To roll back, stop emitting ext without changing the legacy reader. Preserve existing accepted envelope bytes and never re-sign old fixtures.

## Error, lifecycle and authority boundaries

Registry OUTCOME is a typed semantic mapping onto the existing stable error vocabulary; legacy `TRUYN_*` and interface-specific error forms remain valid until separately qualified compatible projection. Reserve `unavailable` where not admitted; do not silently switch exposed error values. A logical NEED must not create duplicate provider effects, regardless of relay restart or replica failover; durable reservation, unique terminal commit, provider-side idempotency and reconciliation are independent qualification gates. Duplicate settlement/accounting is forbidden. `PARTIAL` sequences stay monotonic; late PARTIAL/RESULT after terminal REVOKE are rejected. Existing NEED and OFFER revocation namespaces remain unchanged; future key/grant/subscription/lease/contract/order targets require separate negotiated schemas.

Enforce authentic identity, server-side owner/tenant policy, entitlement and limits before dispatch, and provider-side recheck at execution. The presence of `ext`, payment proof, descriptor, OFFER or routing `to` never grants authority. All ingress transports must converge on that boundary.

## Full 80-entry immutable CORE registry

The table below is generated directly from the frozen machine registry `spec/registry/truyn-core-v1.json`; field spelling, eight-decimal-digit CODE and Short value are preserved. A row being listed does **not** announce wire admission.

| CODE | Short | Name | Class | Current form | Admission | Existing wire projection |
|---|---|---|---|---|---|---|
| `00000000` | `—` | `UNSPECIFIED` | reserved | `reserved` | `reject_when_code_encoded` | — |
| `10000000` | `A00` | `SESSION` | A | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `11000000` | `A1` | `HELLO` | A | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `12000000` | `A2` | `WELCOME` | A | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `13000000` | `A3` | `VERSION` | A | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `20000000` | `B00` | `CONTROL` | B | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `21000000` | `B1` | `PING` | B | `quic_control_method` | `existing_distinct_wire` | `dht.ping` |
| `22000000` | `B2` | `FIND_NODE` | B | `quic_control_method` | `existing_distinct_wire` | `dht.find-node` |
| `23000000` | `B3` | `ANNOUNCE` | B | `quic_control_method` | `existing_distinct_wire` | `peer.announce` |
| `24000000` | `B4` | `STORE` | B | `quic_control_method` | `existing_distinct_wire` | `dht.store` |
| `25000000` | `B5` | `FIND_VALUE` | B | `quic_control_method` | `existing_distinct_wire` | `dht.find-value` |
| `26000000` | `B6` | `SYNC` | B | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `27000000` | `B7` | `ADVERTISE` | B | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `28000000` | `B8` | `DISCOVER` | B | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `30000000` | `C00` | `ENVELOPE` | C | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `31000000` | `C1` | `IDENTITY` | C | `signed_envelope_v1` | `baseline` | — |
| `32000000` | `C2` | `OFFER` | C | `signed_envelope_v1` | `baseline` | — |
| `33000000` | `C3` | `NEED` | C | `signed_envelope_v1` | `baseline` | — |
| `34000000` | `C4` | `RESULT` | C | `signed_envelope_v1` | `baseline` | — |
| `35000000` | `C5` | `REVOKE` | C | `signed_envelope_v1` | `baseline` | — |
| `36000000` | `C6` | `CAPABILITY` | C | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `37000000` | `C7` | `COMMITMENT` | C | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `37100000` | `C71` | `CONTRACT` | C | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `37200000` | `C72` | `ORDER` | C | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `37300000` | `C73` | `ACCEPT` | C | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `37400000` | `C74` | `REJECT` | C | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `37500000` | `C75` | `STATUS` | C | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `40000000` | `D00` | `COMPACT` | D | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `41000000` | `D1` | `C_NEED` | D | `compact_runtime` | `existing_distinct_wire` | compact `N` |
| `42000000` | `D2` | `C_RESULT` | D | `compact_runtime` | `existing_distinct_wire` | compact `R` |
| `43000000` | `D3` | `PARTIAL` | D | `compact_runtime` | `existing_distinct_wire` | compact `T` |
| `44000000` | `D4` | `CHAIN` | D | `compact_runtime` | `existing_distinct_wire` | compact `C` |
| `45000000` | `D5` | `CONTEXT_PUT` | D | `compact_runtime` | `existing_distinct_wire` | compact `P` |
| `46000000` | `D6` | `CONTEXT_DELTA` | D | `compact_runtime` | `existing_distinct_wire` | compact `D` |
| `50000000` | `E00` | `OUTCOME` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `51000000` | `E1` | `SUCCESS` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `51100000` | `E11` | `completed` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `51200000` | `E12` | `queued` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `51300000` | `E13` | `idempotent` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `51400000` | `E14` | `degraded` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52000000` | `E2` | `ERROR` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52100000` | `E21` | `REQUEST` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52110000` | `E211` | `invalid_argument` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52120000` | `E212` | `not_found` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52130000` | `E213` | `already_exists` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52200000` | `E22` | `ACCESS` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52210000` | `E221` | `unauthenticated` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52220000` | `E222` | `permission_denied` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52300000` | `E23` | `COMPAT` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52310000` | `E231` | `version_mismatch` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52320000` | `E232` | `unimplemented` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52400000` | `E24` | `TEMPORARY` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52410000` | `E241` | `resource_exhausted` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52420000` | `E242` | `unavailable` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52500000` | `E25` | `UNKNOWN_OUTCOME` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52510000` | `E251` | `deadline_exceeded` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52520000` | `E252` | `transport_error` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52530000` | `E253` | `internal` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52600000` | `E26` | `TERMINAL` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52610000` | `E261` | `invalid_response` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `52620000` | `E262` | `cancelled` | E | `outcome_semantics` | `role_scoped_or_opt_in` | — |
| `60000000` | `F00` | `TELEMETRY` | F | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `61000000` | `F1` | `METRICS` | F | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `62000000` | `F2` | `HEALTH` | F | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `63000000` | `F3` | `TRACE` | F | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `64000000` | `F4` | `HEARTBEAT` | F | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `70000000` | `G00` | `DATA` | G | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `71000000` | `G1` | `OBJECT` | G | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `72000000` | `G2` | `STATE` | G | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `73000000` | `G3` | `DELTA` | G | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `74000000` | `G4` | `SUBSCRIBE` | G | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |
| `80000000` | `H00` | `TRUST` | H | `semantic_family_or_surface` | `role_scoped_or_opt_in` | — |
| `81000000` | `H1` | `CLAIM` | H | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `82000000` | `H2` | `ATTEST` | H | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `83000000` | `H3` | `TRUST_RECEIPT` | H | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `84000000` | `H4` | `CHALLENGE` | H | `composed_behavior` | `role_scoped_or_opt_in` | — |
| `85000000` | `H5` | `VERIFY` | H | `composed_behavior` | `role_scoped_or_opt_in` | — |
| `86000000` | `H6` | `DISPUTE` | H | `composed_behavior` | `role_scoped_or_opt_in` | — |
| `87000000` | `H7` | `PROOF` | H | `embedded_object_or_descriptor` | `role_scoped_or_opt_in` | — |
| `90000000` | `I00` | `COMPUTE` | I | `reserved_unadmitted_semantic` | `role_scoped_or_opt_in` | — |

## Implementation and stability sequence

1. Read-only inventories of public and private exact main commits, active workflows/campaign locks, existing wire signatures and released SDK coordinates.
2. Normative proposal/RFC class C review before changing any frozen wire behavior. Preserve all 80 registry CODE/Short/name triples.
3. Independent TCJ1 and signed-envelope vector conformance in JS/TS, Python, Go, Java and .NET; protect old signed bytes.
4. Default-off ext understanding and negotiated emission; full legacy and hostile-input matrix across relay, HTTP, QUIC and five SDKs.
5. Durable multi-replica replay/authority and terminal exactly-once gates, with D-series regression at unchanged thresholds for network changes.
6. One exact SHA with DCO, CodeQL, security, complete CI, immutable old/new published-SDK interoperability; then independent post-merge main checks.
7. Publish five immutable 1.0.0 SDK packages with provenance only after release admission; private runtime consumes version/digest-pinned artifacts, never raw public source.
8. Stable Protocol is distinct from managed-service production cutover and Mainnet governance. P13-OPS, prolonged network SLO, security canary, A-SOAK and Production Trust Authority remain independent operational prerequisites.

**No stable version, provider expenditure, private deployment or Mainnet admission is claimed by this English documentation.**

## Source-fidelity review and approved-vs-executable Short aliases

The full source-table semantic parity is maintained in [CORE source fidelity (80/80)](TRUYN_WIRE_FREEZE_CORE_SOURCE_PARITY_EN.md) and the [Class C semantic review](TRUYN1_CLASS_C_WIRE_SOURCE_SEMANTIC_REVIEW.md). This page uses unchanged **executable JSON registry Short aliases**. The approved original design used a different documentary Short naming scheme for 41 entries (for example A10 vs frozen registry A1). This is explicitly OPEN for governance interpretation. Do not infer a registry mutation, backward-incompatible rename, or normative approval from this English source edition.

The original's detailed physical-form, field, TCJ1, ext, error/authority and release-admission rules are incorporated here and audited by section in the Class C review. Historical source bytes remain pinned to their original provenance; these English references have independent hashes.
