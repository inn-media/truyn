# TRUYN/1 Final Non-Core Architecture — English Extension, Profile and Composition Reference

**Status:** APPROVED SOURCE-DERIVED DESIGN REFERENCE / EXPERIMENTAL ONLY / NO WIRE ADMISSION.
**English edition:** October 13, 2026. **Original source approval:** October 11, 2026.
**Original source SHA-256:** `c345631992e3e96f84e67dcf48a85c15281f5912ae1bfd131c5f904b9da46e72`.

This is a new English technical edition of the approved design and complete classification inventory, not a byte-identical copy of the original-language source. Retain the original digest as provenance and assign new digests to all derived English documentation.

## Classification and compatibility

- **CORE:** the full immutable public A–I semantic registry. Being a CORE entry does not make a physical Envelope type.
- **EXTENSION:** a proposed optional, versioned logical operation or semantic that may justify a new wire form only after independent wire admission and authenticated negotiation.
- **PROFILE:** a proposed optional industry-specific semantics, schema or transport framing. Robotics/industrial profiles cannot manufacture physical-safety guarantees.
- **COMPOSED:** a supported combination of existing CORE methods, capability names, structured fields and payload schemas, with no separate top-level type.
- Unknown physical types never execute. Unknown negotiated *required* semantics fail `version_mismatch`; unsupported optional capabilities fail `unimplemented`. A descriptor/advertisement is not execution authorization.
- No listed candidate automatically becomes a new signed Envelope `type`, QUIC `method` or compact frame letter. The existing five signed kinds and compact `N/R/T/C/P/D` are frozen.
- A new wire type is justified only after proving a distinct pre-payload transport behavior, independently coordinated lifecycle, protocol-enforced authorization requirement or high-throughput framing that cannot be realized safely by the existing bounded profile.

## Fourteen opt-in candidates

All candidates below remain **Experimental, feature flag OFF, not supported by default, not part of MVP_TYPES**.

| Proposed semantic | Class | Domain | Required safety/compatibility boundary |
|---|---|---|---|
| DISCONNECT | EXTENSION | Connectivity | Advisory graceful drain; preserve existing QUIC retire/in-flight behavior and timeouts |
| PAUSE | EXTENSION | Task lifecycle | Requester-scoped pause; deadlines/budget remain unchanged without separately authorized signed amendment |
| RESUME | EXTENSION | Task lifecycle | Resume only a previously authorized task in its accepted lifecycle |
| DELEGATE | EXTENSION | Agent collaboration | Scoped least-privilege grants, provenance and requester consent where required |
| HANDOFF | EXTENSION | Agent collaboration | Atomic acceptance and fencing; prior executor remains responsible until acceptance |
| RETRIEVE | EXTENSION | Data | Explicit content-addressed retrieval with digest, size and independent access enforcement; no implicit fetching |
| DELETE | EXTENSION | Data | Authorized deletion at a holder only; do not erase immutable benchmark/security evidence |
| EVENT | EXTENSION | Streaming | Opt-in delivery profile; no claimed at-least-once delivery without durable sequence/ack/replay conformance |
| LEASE | EXTENSION | Resource rights | Domain-scoped fenced resource lease, distinct from DHT TTL or private/cloud control leases |
| BID | EXTENSION | Economics | Bound price quote; never infer payment entitlement, execution authorization or settlement |
| TIME_SYNC | PROFILE | Real-Time | Signed freshness still enforced locally; clock uncertainty is advisory, not an authentication bypass |
| SENSOR_DATA | PROFILE | IoT / Real-Time | Separate authenticated sample batching; do not reuse occupied compact identifiers |
| SAFE_STOP | PROFILE | Robotics / Industry | Authorized best-effort remote request, **not** a guaranteed emergency stop; independent local safety interlocks |
| ALARM | PROFILE | Industry | Versioned alarm state, authorized acknowledgment and replay-safe transitions |

### Candidate semantics and non-goals

**DISCONNECT:** an authenticated sender requests a bounded session drain rather than an abrupt connection close. A possible payload contains `reason`, `drainMs`, `retryAfterMs`. It neither extends existing campaign timeouts nor replaces the accepted `retire` mechanism. Handling work beyond the drain interval remains separately specified.

**PAUSE / RESUME:** operations refer to an accepted `requestId` and are controlled by the original requester. The executor may reject unsupported pause attempts. A paused worker may still issue lifecycle heartbeats, but pausing does not silently postpone the deadline or authorize more cost.

**DELEGATE:** a provider may propose a subtask to another agent using scoped, cryptographically verifiable grant/provenance material. The delegate receives no more privilege than its delegator. The delegator remains responsible for the original NEED, unless a separate qualified handoff changes that obligation.

**HANDOFF:** proposal fields include `requestId`, `to`, `contextRef`, `reason`. Responsibility transfers only after authenticated atomic acceptance and stale-owner fencing; otherwise the prior executor retains it. Avoid double effect execution and preserve original requester consent.

**RETRIEVE:** explicit CID/size/range retrieval from an authorized holder; verify digest and byte size. Existing verified HTTP/context reads continue to work. No blind URL resolution, implicit fetch or cross-tenant retrieval.

**DELETE:** a request to an authorized single data holder to remove data it may erase. This cannot promise deletion of all content-addressed copies. Protected or append-only records require lawful redaction/access revocation and tamper-evident tombstones rather than evidence destruction.

**EVENT:** topic/source/sequence/time/data or a verified reference. Subscription delivery requires an independently specified durability/offset/acknowledgment and replay contract; until then compose event-like output from already accepted state/partial/result facilities where possible.

**LEASE:** application resource rights with lease ID, resource, holder, interval, terms and fencing. This does not alter the DHT lease, Azure lease or any managed entitlement; renewal/expiration semantics remain domain-specific and unauthorized release fails closed.

**BID:** an optional provider quote against a NEED/ORDER with explicit price/unit/validity/terms. A bid is not a receipt, does not prove transfer of money and does not authorize access to the provider.

**TIME_SYNC:** estimated offset/uncertainty via time-mark exchange; not NTP/PTP replacement, no cryptographic freshness waiver.

**SENSOR_DATA:** proposed authenticated batched sensor samples with timestamps, units, quality and source. Requires independent signed framing/size limits; not a backdoor new compact `t` alias.

**SAFE_STOP:** controlled-stop request with bounded scope/category/reason/issue time. It must check authorization when received, is at best a network advisory, and cannot substitute local independent emergency-stop circuitry, interlocks or device safety qualification. Never promise hard real time or never-drop over WAN.

**ALARM:** idempotent industry alarm lifecycle (active, acknowledged, cleared) with policy-bound operator actions, versioning and source provenance. An EVENT/STATE composition may carry alarms before a dedicated profile is admitted.

## Governance and admission requirements

Each separately promoted candidate requires its own versioned `semanticId`, public schema, legacy mapping, supported roles, issuer/provider authority, mutual negotiation, failure taxonomy, transport binding, idempotency/terminal semantics, limits, observable/redacted evidence, exact-head five-SDK conformance, old/new interop, migration and rollback. The proposal naming convention is `truyn.ext.<feature>/1` or `truyn.profile.<domain>/1`. Optional profile support is never inferred from an unauthenticated ADVERTISE value alone. Feature flags default to FALSE.

A negotiated experiment does **not** itself imply Stable TRUYN/1, stable managed service, Mainnet, owner-funded access, hard real-time physical safety or payment entitlement. Do not expand `MVP_TYPES` for the convenience of implementing a proposal.

## Composition catalogue (111 identifiers; no separate physical wire type)

The following names retain the source classification by domain. Their implementations depend on the concrete capabilities, schemas and protocols the participating peer **actually supports**. Names alone do not create live operations or production guarantees.

### A. Identity, Discovery and Connectivity

`RESOLVE`, `ROUTE`.

### B. Intelligence, Tasks and Agent Collaboration

`PROGRESS`, `PLAN`, `EXECUTE`, `CONSENSUS`, `VOTE`, `EVALUATE`, `FEEDBACK`, `CONSTRAINT`, `SCHEDULE`.

### C. Data, Knowledge, Memory and Context

`QUERY`, `SEARCH`, `INDEX`, `MERGE`, `MEMORY`, `KNOWLEDGE`, `PROVENANCE`.

### D. Trust, Security, Authorization and Verification

`GRANT`, `AUTHORIZE`, `POLICY`, `CREDENTIAL`, `KEY_ROTATE`, `KEY_REVOKE`, `AUDIT`, `IDENTITY_BIND`, `DELEGATION_REVOKE`, `SECURITY_ALERT`.

### E. Events, Streaming and Real-Time

`UNSUBSCRIBE`, `STREAM_OPEN`, `STREAM_DATA`, `STREAM_CLOSE`, `RETRY`, `FLOW_CONTROL`, `PRIORITY`, `DEADLINE`, `BATCH`, `MULTICAST`, `BROADCAST`.

### F. Devices, Hardware and IoT

`DEVICE_REGISTER`, `DEVICE_DESCRIPTOR`, `DEVICE_HEALTH`, `DEVICE_COMMAND`, `DEVICE_CONFIG`, `FIRMWARE_INFO`, `FIRMWARE_UPDATE`, `BOOT_ATTEST`, `POWER_STATUS`, `DEVICE_REBOOT`, `DEVICE_SLEEP`, `DEVICE_WAKE`, `DEVICE_RECOVER`.

### G. Robotics and Autonomous Machines

`ROBOT_CAPABILITY`, `MISSION`, `NAVIGATE`, `POSE`, `VELOCITY`, `TRAJECTORY`, `MAP`, `LOCALIZE`, `PERCEPTION`, `DETECTION`, `TRACK`, `MANIPULATE`, `CONTROL_MODE`, `SAFETY_STATE`, `COLLISION_RISK`, `ZONE_RESERVE`, `ZONE_RELEASE`, `FLEET_ASSIGN`, `FLEET_COORDINATE`, `DOCK`, `HUMAN_OVERRIDE`.

### H. Industrial Systems and Digital Twins

`ASSET_REGISTER`, `ASSET_STATE`, `DIGITAL_TWIN`, `TWIN_SYNC`, `PROCESS_STATE`, `PROCESS_COMMAND`, `SETPOINT`, `CALIBRATE`, `FAULT_REPORT`, `QUALITY_REPORT`, `SIMULATE`, `PREDICT_FAILURE`, `WORK_ORDER`.

### I. Distributed Computing and Network Operations

`RESOURCE_ALLOCATE`, `RESOURCE_RELEASE`, `DEPLOY`, `UNDEPLOY`, `MIGRATE`, `CHECKPOINT`, `RESTORE`, `FAILOVER`, `REPLICATE`, `CAPACITY`, `LOG`.

### J. Economics, Transactions and Settlement

`PRICE_QUOTE`, `USAGE`, `INVOICE`, `PAYMENT_INTENT`, `PAYMENT_AUTH`, `SETTLEMENT_PROOF`, `REFUND`, `ESCROW`, `SERVICE_LEVEL`.

### K. Governance, Compatibility and Protocol Evolution

`SCHEMA`, `DEPRECATE`, `UPGRADE_NOTICE`, `COMPATIBILITY_REPORT`, `CONFORMANCE_PROOF`.

## Important interoperability resolutions

- `SUBSCRIBE` remains CORE; `EVENT` is not silently promoted. Existing result/state/partial mechanisms can compose limited delivery without falsely promising durability.
- Existing HTTP GET and context CID routes remain; `RETRIEVE` is a separate optional logical interface and never grants access to a private holder.
- Current session `kind:"ACCEPT"` is unchanged and distinct from future commercial COMMITMENT acceptance.
- Existing active QUIC retire, connection recovery, accepted D-series deadlines and exact network reliability thresholds remain unchanged.
- Key/grant/subscription/lease/contract/order revocations are **future negotiated targetKind schemas**, not supported merely because their names appear in source architecture.
- Device/robotics/process operations must be authenticated NEED operations with server/provider policy, and local physical safety must remain independent.
- Payment, escrow, settlement metadata and commercial bids grant no provider ownership or execution authority. User/provider credentials never transit through the public relay.

## Cross-repository integration and rollout

Public TRUYN owns versioned candidate registries, schemas, SDK tests and wire conformance. Private Platform owns managed identity, entitlements, authoritative spend controls, private staging and consumer release pins. The private repository may depend only on a released, versioned public artifact or qualified immutable public contract and must not embed source from an unpublished branch.

For each feature: review proposal → publish independent versioned experimental schema with default OFF → validate explicit authenticated negotiation → run native five-SDK and mixed old/new matrices → verify security, zero unauthorized calls, durable replay and legacy semantics → independently qualify exact HEAD and merged main → isolated shadow/canary → preserve a rollback path that stops emitting the extension while readers remain compatible. Never rewrite frozen historic D/S/T/E/N/H/A evidence or retroactively declare PASS.

**This English technical reference is not a claim that the 14 candidates or 111 compositions have been deployed or admitted to the TRUYN/1 physical wire.**

## Complete detailed source translation: compositions and Class C review

The original approved design's complete 111-row composition catalogue with independently translated **purpose, form, and method for every entry** is preserved in [111-entry COMPOSED source parity](TRUYN_WIRE_FREEZE_COMPOSED_SOURCE_PARITY_EN.md). The 15 conflict resolutions, all 14 candidate-specific open questions, the cross-repository boundary and admission checks are reconciled in the [Class C source-semantic review](TRUYN1_CLASS_C_WIRE_SOURCE_SEMANTIC_REVIEW.md).

These are English technical editions of the approved proposal, not proof that an optional extension/profile has been admitted, implemented, released or deployed. The public/managed source split and the five current signed Envelope kinds remain unchanged.
