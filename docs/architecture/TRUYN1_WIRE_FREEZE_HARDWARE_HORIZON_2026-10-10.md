# TRUYN/1 Wire Freeze Decision Record — Core, Extensions and Hardware Horizon

**Status:** PROPOSED / review-only; NOT an accepted stable-v1 freeze.  
**Baseline:** public `main@97b317e735709461bf4382705681a36125957731` (2026-10-10).  
**Scope:** P1/P2 vocabulary and envelope shape; forward-compatible design horizon through 2031.  
**Safety:** no runtime, deployed wire, protobuf tag, signature byte domain, acceptance threshold or stable-status mutation in this proposal.

## 1. Observed implementation inventory

| Surface | Observed fact | Contract boundary |
|---|---|---|
| `core/protocol/index.js` | `MVP_TYPES = IDENTITY, OFFER, NEED, RESULT, REVOKE` | Existing signed-JSON core |
| `core/protocol/index.js` | `COMPACT_TYPES = NEED, RESULT, PARTIAL, CHAIN, CONTEXT_PUT, CONTEXT_DELTA` | Distinct compact encoding/lifecycle; not six extra stable top-level JSON core kinds |
| `spec/protocol/v1/core.md` | Core five already described as release-candidate bounded set | Not whole TRUYN/1 stable |
| `spec/protocol/v1/envelope.md` | JSON fields, TCJ1, Ed25519 and required-field rules documented | Exact SDK conformance and cross-language vector qualification still required |
| `proto/v1/envelope.proto` | Numeric generation, IDs, timestamp, signature, `oneof` with 13 object payload alternatives | Development schema, **not** an automatically interchangeable representation of signed JSON |
| `spec/protocol/v1/README.md` | 13 architectural exchange objects and `CAPABILITY` reused descriptor; `CHALLENGE/VERIFY/DISPUTE` composed | Wider future profile |
| `spec/protocol/v1/agent-descriptor.md` | Descriptor separate from OFFER, not a top-level envelope kind | Discovery is not entitlement |

Do **not** silently alter the existing `proto/v1/envelope.proto` field numbers 1–4, 10–22 or 30. Do **not** change the existing canonical JSON signature domain in a “wire cleanup.”

## 2. Proposed immutable Open 1.0 core vocabulary

Exactly **five** top-level exchange kinds: `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE`.

- `IDENTITY`: asserted cryptographic node identity, not proof of account/tenant ownership.
- `OFFER`: signed dynamic availability/capability advertisement, not authorization.
- `NEED`: authenticated intent/request to an eligible provider; payment/entitlement checked separately.
- `RESULT`: correlated terminal outcome; provenance/reference checks preserved.
- `REVOKE`: bounded authorized revocation/cancellation semantics; never an unrestricted global kill command.

`CAPABILITY` is a reusable descriptive record, not top-level message. `PARTIAL` is a compact/streaming lifecycle record and must not be rebranded as a sixth core kind. `CHAIN`, `CONTEXT_PUT`, `CONTEXT_DELTA` are compact semantics, not core JSON top-level kinds. `OBJECT`, `CLAIM`, `ATTEST`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`, `TRUST_RECEIPT` remain **explicitly negotiated extended protocol objects**. `CHALLENGE`, `VERIFY`, `DISPUTE` remain composed behaviors.

Future device-control, telemetry, actuation, firmware and fleet-control records MUST be negotiated extensions or a new protocol generation, not implicitly valid under the five-core-kind receiver.

## 3. Current bounded JSON Envelope schema — freeze candidate

| Field | Required? | Existing type / meaning | Notes |
|---|---|---|---|
| `protocol` | MUST | string exactly `TRUYN/1` | signed, explicit generation |
| `type` | MUST | one of five core kinds | signed |
| `id` | MUST | nonempty string | unique message identity; distinguish logical request ID/idempotency semantics |
| `from` | MUST | nonempty Node ID string | verify derived identity from public key |
| `createdAt` | MUST | RFC3339/ISO-8601 timestamp string | parser validation and freshness/replay are separate checks |
| `publicKey` | MUST (current profile) | nonempty Ed25519 public-key PEM string | key is *not* a trusted provider authority |
| `payload` | MUST | non-null JSON object (not array) | kind-specific validation required |
| `signature` | MUST | Base64 Ed25519 signature | exactly 64 decoded bytes |
| `to` | MAY | nonempty destination Node ID or `null` | current producer emits `null`; when present it is signed |

The unsigned envelope is the entire JSON value without only top-level `signature`. All other present members, including `to:null` and unknown noncritical members, remain signed. Current TCJ1 sorts object keys recursively by UTF-16 code units, preserves array order and UTF-8 strings, forbids nonfinite numbers, emits no insignificant whitespace. Signing domain is Ed25519 over those exact TCJ1 bytes, **no extra prefix**. Do not switch casually to RFC 8785/JCS, CBOR, COSE or a protobuf serialization; those choices require their own versioned cross-language conformance and signature vectors.

Additional desired metadata (e.g. `traceId`, `correlationId`, `expiresAt`, `contentType`, `priority`, `featureFlags`, `compression`) is **not** thereby made mandatory or accepted in this core profile. Introduce via a versioned/negotiated extension, with a closed namespace and explicit parsing/size/type rules. No `ownerId`, `tenantId`, `billingOwner` or `authorizationGranted` field from untrusted sender is authoritative.

## 4. Compatibility and forward evolution rules (proposed)

1. Preserve byte-for-byte signatures on existing valid signed JSON envelopes. Golden vectors for all five SDK languages must include null/missing distinctions, Unicode, number boundaries, unknown optional members, nested key sorting and signature/key mismatches.
2. New optional metadata never silently changes interpretation of an existing field. Unknown **required** semantics MUST fail closed. Peers negotiate generation + required semantic identifiers before use, with a deterministic no-overlap result.
3. No reuse of protobuf field numbers, enum values, type codes, capability namespaces or signed-domain identifiers. Maintain a permanent IANA-style TRUYN registry within `spec/registry/` before introducing new codes.
4. Bound payload size, nesting, cardinality, decompression ratio, reference dereference, time-to-live, replay windows, idempotency scope, retry budgets and clock uncertainty **per profile**. Do not invent global values before constrained-device and internet-network testing.
5. Relay transports (HTTPS/WebSocket/QUIC, etc.) carry semantics but do not alter signatures/authorization; REST, MCP, A2A and NLWeb are adapters/interfaces, not competing wire-level replacements.
6. Any new binary codec must define **semantic equivalence AND its own canonical signing input**. A CBOR or protobuf encoding of a JSON-signed envelope is not automatically signature-equivalent.
7. Devices that cannot implement full key verification, storage or replay protection must use a trusted gateway **with explicit end-device provenance**; gateway possession alone does not grant actuation authority.

## 5. Five-year extension roadmap: capability layers, not a giant envelope

| Extension track | Purpose | Compatibility requirement |
|---|---|---|
| `truyn.stream/v1` | ordered/partial streaming, backpressure, resumable result delivery | bounded sequence, finality and idempotency; does not add core kind |
| `truyn.objects/v1` | artifact references, state/delta and selective retrieval | mandatory digests, explicit dereference, no arbitrary URL fetch |
| `truyn.pubsub/v1` | subscriptions/events | subscriber ACL, replay boundary, retention, fan-out quotas |
| `truyn.security-attest/v1` | attestation, claims, revocation authorities | explicit issuer trust, expiry, anti-rollback, delegation |
| `truyn.device/v1` | constrained nodes, sensors and gateway-assisted nodes | memory/MTU, canonical compact encoding, monotonic anti-replay |
| `truyn.robotics/v1` | robot capability discovery, task-level missions and telemetry | identity per robot/actuator, spatial/time schema, deterministic fallback |
| `truyn.fleet/v1` | multi-robot orchestration and handoffs | tenancy, lease/ownership, conflicting-task arbitration, offline resumption |
| `truyn.realtime/v1` | deadline/QoS contracts | transport-independent requirements; measured bounded-jitter support |
| `truyn.crypto-agility/v1` | algorithm/key rotation and hybrid migration | never silently weaken/replace existing Ed25519 profile |

These are **proposed**, not implemented, not registered stable extensions, and not mainnet prerequisites unless activated as normative supported profiles.

## 6. Hardware/robotics threat & safety boundary

TRUYN is a **coordination and intelligence protocol**, NOT a functional-safety bus, motor-control loop or emergency-stop safety mechanism. Physical emergency-stop, collision avoidance and hard real-time servo control must remain on independently validated local control paths. Internet disconnection, relay compromise, compromised LLM output, clock skew or a malicious peer must not trigger uncontrolled motion. Any robotic task request must pass separate device-local policy, operator/mission authorization, safety supervisor and hardware interlocks; an `OFFER` or signed `NEED` alone grants no ability to actuate.

For future robotics extension, explicitly define/test:
- device identity vs human/operator vs tenant vs robot-controller authority; enrollment, secure boot/firmware measurement where available, key rotation and revocation;
- declared frames/units (SI + explicit reference-frame ID), coordinate transforms, precision, timestamp uncertainty and stale-state rejection;
- monotonically increasing command sequence, request/command deduplication, bounded leases, start/end validity, deadline semantics and no replay of stale motion;
- capability taxonomy (sense, plan, navigate, manipulate, inspect), **separation of advisory task from authorized actuation**;
- qos delivery class, backpressure, fragmentation/MTU, store-and-forward / offline reconciliation, loss and out-of-order delivery;
- edge/cloud partitioning and delegated gateways without leaking owner paid-provider credentials;
- arbitration for conflicting multi-controller instructions, local human override, fail-safe states, local limits and auditable command outcome;
- independent negative tests: forged sender, stale command, cross-tenant robot selection, expired lease, duplicated command, delayed link recovery, malicious AI planner, unsafe unit/frame mismatch;
- independent engineering safety assessment for any claimed safety-critical deployment.

Candidate compatibility bridges (NOT replacements for TRUYN): ROS 2/DDS and DDS-XRCE for resource-constrained robotics nodes; OPC UA / industrial transport profiles when appropriate. DDS-TSN and DDS Security are distinct ecosystem standards. Adoption requires evidence and implementation, not name-dropping.

## 7. Deliverables required to ACCEPT P1/P2 as truly frozen

**P1: vocabulary:**
- Machine-readable allowed-kind registry distinguishing `core`, `compact`, `extended`, `composed` and `descriptor`.
- Test that `MVP_TYPES`, protocol index and core schemas agree; test no accidental elevation of `PARTIAL` or protobuf extended `oneof`.
- Unknown-kind negative tests on every execution-capable ingress.
- Naming/version allocation policy with reserved codes for future extensions, preserving existing identifiers.

**P2: envelope:**
- Golden valid/invalid fixtures covering every required/optional field and type; missing/null/empty variants; unknown optional and required-semantic rejection; duplicates, giant/deep JSON, invalid UTF-8 and nonfinite values.
- Strict JSON parser duplicate-key policy; cross-language identical TCJ1 signed bytes for five first-party SDKs; Ed25519 key validation, exact 64-byte signature decoding and `from` identity binding.
- Real runtime conformance HTTP/WebSocket/MCP/SDK plus existing compact path. Verify rejected envelopes produce **zero provider calls**.
- Replay/expiry/clock-skew decision deliberately assigned P5 rather than mistakenly claimed solved by P2.
- CI, DCO, CodeQL/security on one exact head; requalify after merge. Preserve draft status until all P1–P13 accepted.

## 8. Decisions NOT to make prematurely

Do not add `ACTUATE`, `MOTOR_COMMAND`, `E_STOP`, `PAYMENT`, `MODEL`, `HTTP`, `MCP`, `A2A`, `NLWEB` to core top-level kinds. Do not require a full X.509/PKI chain or fixed transport for small devices. Do not promise hard real-time QoS from cloud/Internet. Do not call TRUYN hardware-ready or safety-certified on this design alone. Do not proclaim draft exited in a documentation-only PR.

## 9. Review questions to close before machine freeze

- For the five core kinds: map the concrete kind-specific fields and runtime acceptance tests, especially OFFER/NEED/RESULT/REVOKE (P6–P9).
- Should TCJ1's current cross-runtime number serialization be restricted to an interoperable safe numeric subset for v1? Prove, don't assume.
- How will gateway-anchored device identity be distinguished from cryptographic end-device identity?
- Which extensions, if any, genuinely need negotiated critical semantics rather than optional fields?
- Which components require bounded canonical binary encoding on MCU class devices, and at what minimum resource envelope?
- What are minimal latency/jitter and loss-tolerance matrices for advisory robot tasks vs non-robot AI work?
- Validate future profile choices against implementer prototypes in at least two languages and one constrained device before ratification.

**Bottom line:** freeze a small, proven semantic core; invest future flexibility in interoperable, separately negotiated extensions, not irreversible additions to the basic Envelope.
