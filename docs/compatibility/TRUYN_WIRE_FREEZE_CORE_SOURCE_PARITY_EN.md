# TRUYN/1 CORE — 80-entry source fidelity and semantic review

**Status:** TRANSLATION REVIEW / NOT A WIRE CHANGE. English-only companion to [CORE English edition](TRUYN_WIRE_FREEZE_CORE_FINAL_EN.md).

## Scope and provenance

The 80 source rows were compared by immutable eight-digit CODE and name with the actual unchanged machine registry `spec/registry/truyn-core-v1.json`. This review does not normalize or overwrite source-authored Short aliases. They differ from executable registry Short values in 41 entries. That is an **unresolved documentary compatibility discrepancy** requiring a separate Class C interpretation/decision; neither spelling changes today's wire.

- Original approved source SHA-256: `591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121`.
- Source-approved code/name rows found: **80/80**.
- Executable registry CODE/name matches: **80/80**.
- Source vs executable Short mismatch: **41/80** (including `HELLO A10` vs `A1`, `WELCOME A20` vs `A2`, `C_NEED D10` vs `D1`).
- Source descriptions, advertised current wire paths and maturity descriptions are translated below. Source-authored aliases and registry aliases are **both shown unchanged**.
- No registry modification, no signed-byte change, no new default handler, no stable release claim.

## Complete semantic row parity

| Decimal CODE | Source Short | Frozen JSON Short | Name | Source meaning — English | Physical form today / source proposal — English | Source implementation maturity — English |
|---|---|---|---|---|---|---|
| `00000000` | `—` | `—` | `UNSPECIFIED` | Reserved code; reject when a numeric code is present | Reserved, not carried | Reserved |
| `10000000` | `A00` | `A00` | `SESSION` | Authenticated peer session over QUIC, TLS, ALPN and relay registration | QUIC TLS ALPN truyn/1 and /v1/register | Existing |
| `11000000` | `A10` | `A1` | `HELLO` | Start an authenticated truyn-peer-session-v1 session | Signed session-hello kind HELLO | Existing |
| `12000000` | `A20` | `A2` | `WELCOME` | Respond to HELLO and issue sessionId; registry name, not a wire rename | Signed session-hello kind ACCEPT | Existing; registry alias proposal |
| `13000000` | `A30` | `A3` | `VERSION` | Negotiate versions and required semantics; existing helper is not wired into HELLO | No physical wire; negotiation helper | Proposed integration |
| `20000000` | `B00` | `B00` | `CONTROL` | Control RPC, DHT functions and discovery | kind control | Existing |
| `21000000` | `B10` | `B1` | `PING` | Probe whether a remote contact is alive | dht.ping | Existing |
| `22000000` | `B20` | `B2` | `FIND_NODE` | Find k nearest peers for a target nodeId | dht.find-node | Existing |
| `23000000` | `B30` | `B3` | `ANNOUNCE` | Publish a signed peer record with reachability | peer.announce | Existing |
| `24000000` | `B40` | `B4` | `STORE` | Store a DHT record while retaining RF3/minAcks2 | dht.store | Existing |
| `25000000` | `B50` | `B5` | `FIND_VALUE` | Read a value through DHT | dht.find-value | Existing |
| `26000000` | `B60` | `B6` | `SYNC` | State synchronization or anti-entropy | No physical wire | Proposed |
| `27000000` | `B70` | `B7` | `ADVERTISE` | Public signed agent descriptor announcing protocols and interfaces, not an OFFER or authorization | GET /.well-known/truyn-agent.json | Existing descriptor; draft semantic profile |
| `28000000` | `B80` | `B8` | `DISCOVER` | Find possible participants by capability, never an authorization decision | Relay /v1/offers and verifier-DHT | Partially existing; draft |
| `30000000` | `C00` | `C00` | `ENVELOPE` | Signed application message envelope | kind envelope and relay /v1/* | Existing release candidate |
| `31000000` | `C10` | `C1` | `IDENTITY` | Cryptographic Ed25519 node identity | /v1/register | Existing release candidate |
| `32000000` | `C20` | `C2` | `OFFER` | Provider-advertised capability and execution conditions | /v1/offers | Existing release candidate |
| `33000000` | `C30` | `C3` | `NEED` | Request work or invoke a provider capability | QUIC P2P and /v1/needs | Existing release candidate |
| `34000000` | `C40` | `C4` | `RESULT` | Terminal outcome of an accepted NEED | QUIC response and /v1/results | Existing release candidate |
| `35000000` | `C50` | `C5` | `REVOKE` | Requester-owned NEED cancellation or provider-owned OFFER withdrawal | /v1/revoke | Existing release candidate |
| `36000000` | `C60` | `C6` | `CAPABILITY` | Description of a service capability inside OFFER or NEED, not an independent message | capability field in OFFER and NEED | Existing field; draft standalone spec |
| `37000000` | `C70` | `C7` | `COMMITMENT` | Semantic family of obligations and commerce, not execution entitlement | No physical wire | Proposed family |
| `37100000` | `C71` | `C71` | `CONTRACT` | Agreement terms accepted by authorized parties; not proof of payment or provider rights | No physical wire | Proposed |
| `37200000` | `C72` | `C72` | `ORDER` | Specific commercial order under OFFER or CONTRACT; not proof of payment or provider rights | No physical wire; terms currently in OFFER/NEED metadata | Proposed |
| `37300000` | `C73` | `C73` | `ACCEPT` | Signed acceptance of a commercial commitment, distinct from session ACCEPT | No commitment wire | Proposed |
| `37400000` | `C74` | `C74` | `REJECT` | Refusal of commercial commitment with reason in E2xx family | No commitment wire | Proposed |
| `37500000` | `C75` | `C75` | `STATUS` | Current status of an OFFER or ORDER, distinct from STATE/OUTCOME | No commitment wire | Proposed |
| `40000000` | `D00` | `D00` | `COMPACT` | Compact fast-path transport using signed t/i/s fields | /v1/fast/* and {t,i,s} | Existing |
| `41000000` | `D10` | `D1` | `C_NEED` | Compact NEED stage | t=N and /v1/fast/needs | Existing |
| `42000000` | `D20` | `D2` | `C_RESULT` | Compact RESULT stage | t=R and /v1/fast/results | Existing |
| `43000000` | `D30` | `D3` | `PARTIAL` | Ordered partial or streaming result record, not a sixth top-level Envelope type | t=T and /v1/fast/partials | Existing release candidate |
| `44000000` | `D40` | `D4` | `CHAIN` | Chained execution stages | t=C and /v1/fast/chains | Existing |
| `45000000` | `D50` | `D5` | `CONTEXT_PUT` | Store a context document | t=P and /v1/contexts | Existing |
| `46000000` | `D60` | `D6` | `CONTEXT_DELTA` | Update context transport data, separate from domain DELTA | t=D and /v1/contexts/<cid>/delta | Existing |
| `50000000` | `E00` | `E00` | `OUTCOME` | Normalized result of a protocol operation, including success and error forms | ok and error fields | Existing; normalization proposal |
| `51000000` | `E10` | `E1` | `SUCCESS` | Successful operation, with subtype in outcome where supported | ok:true | Existing |
| `51100000` | `E11` | `E11` | `completed` | Completed operation with final result | ok:true with result | Existing |
| `51200000` | `E12` | `E12` | `queued` | Accepted into queue without commercial commitment | ok:true, needId, provider | Existing behavior without a separate token |
| `51300000` | `E13` | `E13` | `idempotent` | Replay of an already applied operation | REVOKE idempotent:true | Existing behavior without separate token |
| `51400000` | `E14` | `E14` | `degraded` | Successful operation with caveats or reduced functionality | No separate current token | Proposed |
| `52000000` | `E20` | `E2` | `ERROR` | Error category directing caller behavior | ok:false with error token | Existing; align meanings with errors.md |
| `52100000` | `E21` | `E21` | `REQUEST` | Invalid request error family; do not retry blindly | Not a separate wire message | Proposed family |
| `52110000` | `E211` | `E211` | `invalid_argument` | Request violates accepted input contract | TRUYN_RELAY_INVALID_ENVELOPE, invalid_json | Existing release candidate |
| `52120000` | `E212` | `E212` | `not_found` | No matching peer, resource, or message | TRUYN_PEER_NOT_FOUND, TRUYN_RELAY_MESSAGE_NOT_FOUND, not_found | Proposed semantic projection |
| `52130000` | `E213` | `E213` | `already_exists` | Logical id already reserved by another request | duplicate_request and duplicate_chain, HTTP 409 | Proposed semantic projection |
| `52200000` | `E22` | `E22` | `ACCESS` | Access failure family; fail closed, do not retry | Not a separate wire message | Proposed family |
| `52210000` | `E221` | `E221` | `unauthenticated` | Principal absent, expired or revoked | TRUYN_RELAY_UNAUTHORIZED, TRUYN_IDENTITY_REVOKED, quic_session_required | Existing release candidate |
| `52220000` | `E222` | `E222` | `permission_denied` | Authenticated requester lacks permission | TRUYN_TESTNET_OPERATOR_DENIED | Existing release candidate |
| `52300000` | `E23` | `E23` | `COMPAT` | Compatibility failure family; do not retry by downgrading silently | Not a separate wire message | Proposed family |
| `52310000` | `E231` | `E231` | `version_mismatch` | No compatible version or required semantic set | Negotiation helper; not in HELLO | Existing release candidate |
| `52320000` | `E232` | `E232` | `unimplemented` | Operation or physical type unsupported by receiver | TRUYN_NO_ENVELOPE_HANDLER, TRUYN_TESTNET_FAULT_CONTROL_DISABLED | Existing release candidate |
| `52400000` | `E24` | `E24` | `TEMPORARY` | Temporary failure; bounded backoff only if replay policy permits | Not a separate wire message | Proposed family |
| `52410000` | `E241` | `E241` | `resource_exhausted` | Capacity overload or full queue with admission shedding | TRUYN_BUSY, TRUYN_BACKPRESSURE | Proposed semantic projection |
| `52420000` | `E242` | `E242` | `unavailable` | Node, relay or DHT write quorum unavailable | TRUYN_RELAY_UNAVAILABLE, TRUYN_RELAY_SHUTDOWN, TRUYN_DHT_WRITE_QUORUM | Proposed/reserved mapping |
| `52500000` | `E25` | `E25` | `UNKNOWN_OUTCOME` | Operation may already have executed; retry only when safely idempotent | Not a separate wire message | Proposed family |
| `52510000` | `E251` | `E251` | `deadline_exceeded` | Timed out or exceeded accepted deadline | TRUYN_ROUTE_DEADLINE_EXCEEDED, TRUYN_P2P_CONNECT_TIMEOUT, TRUYN_DHT_RPC_TIMEOUT, TRUYN_RELAY_TIMEOUT | Existing release candidate |
| `52520000` | `E252` | `E252` | `transport_error` | Transport or session failed before authoritative response | TRUYN_P2P_DISPATCH_FAILED, TRUYN_P2P_DIRECT_FAILED, TRUYN_P2P_CONNECTION_SUPERSEDED | Existing release candidate |
| `52530000` | `E253` | `E253` | `internal` | Internal node or executor failure | testnet_control_error:* | Proposed semantic projection |
| `52600000` | `E26` | `E26` | `TERMINAL` | Terminal failure without a valid result; do not replay | Not a separate wire message | Proposed family |
| `52610000` | `E261` | `E261` | `invalid_response` | Peer output malformed, untrusted or signed incorrectly | TRUYN_RELAY_INVALID_RESPONSE | Existing release candidate |
| `52620000` | `E262` | `E262` | `cancelled` | Requester cancelled a NEED through REVOKE | cancelled | Existing release candidate |
| `60000000` | `F00` | `F00` | `TELEMETRY` | Metrics and node operational health | No dedicated wire message | Proposed family |
| `61000000` | `F10` | `F1` | `METRICS` | Node statistics and performance counters | Locally /status only | Proposed wire support |
| `62000000` | `F20` | `F2` | `HEALTH` | Node readiness/health status | Locally /dht/readiness only | Proposed wire support |
| `63000000` | `F30` | `F3` | `TRACE` | Traceability of a request or chain | No separate TRACE; relay CHAIN trace exists | Proposed |
| `64000000` | `F40` | `F4` | `HEARTBEAT` | Progress liveness indication for long-running work | No current frame; t=H only proposed | Proposed |
| `70000000` | `G00` | `G00` | `DATA` | Structured data, objects and mutable state semantics | No single physical DATA message | Proposed family |
| `71000000` | `G10` | `G1` | `OBJECT` | Immutable content-addressed object with hash identity | Hash reference in payload | Existing reference/integrity RC |
| `72000000` | `G20` | `G2` | `STATE` | Versioned mutable domain data, distinct from STATUS | No current wire | Draft schema |
| `73000000` | `G30` | `G3` | `DELTA` | Change to STATE, distinct from CONTEXT_DELTA | No current wire | Draft schema |
| `74000000` | `G40` | `G4` | `SUBSCRIBE` | Subscribe to state changes | No current wire | Draft schema |
| `80000000` | `H00` | `H00` | `TRUST` | Claims, attestations and verification | Inside existing NEED/RESULT objects | Proposed family |
| `81000000` | `H10` | `H1` | `CLAIM` | Signed assertion about a subject | NEED.payload.input.claim (truyn-claim-v1) | Existing code; draft spec |
| `82000000` | `H20` | `H2` | `ATTEST` | Signed verifier judgment | RESULT.payload.output.attestation (truyn-attest-v1) | Existing code; draft spec |
| `83000000` | `H30` | `H3` | `TRUST_RECEIPT` | Trust-summary receipt v1/v2, currently local | Local truyn-trust-receipt-v1/v2 | Existing code; draft spec |
| `84000000` | `H40` | `H4` | `CHALLENGE` | Initiate verification of a claim | NEED with claim and optional challenge | Composed scenario, not separate type |
| `85000000` | `H50` | `H5` | `VERIFY` | Execute verifier assessment | RESULT with ATTEST | Composed scenario, not separate type |
| `86000000` | `H60` | `H6` | `DISPUTE` | Challenge an assertion and trigger extra verification | ATTEST contradict judgment (conceptual DISPUTES) | Composed scenario, not separate type |
| `87000000` | `H70` | `H7` | `PROOF` | Verifiable evidence: hash, signature, receipt | evidence in CLAIM or ATTEST | Existing field; proposed standalone semantic |
| `90000000` | `I00` | `I00` | `COMPUTE` | Computing near referenced data under approved provider capability | No new type; draft NEED capability | Proposed draft profile |

## The unresolved Short naming conflict

The approved original table uses documentary aliases `A10`, `A20`, `A30`, `B10` etc. for numeric codes, whereas `spec/registry/truyn-core-v1.json` is the existing machine registry with `A1`, `A2`, `A3`, `B1`, etc. The identities are not conflated. The machine CORE registry's 80 original CODE/Short/name triples must not be edited to fit the source text; the approved source text is historical design provenance and must also not be silently edited. A compatible explicit alias mapping is a possible *future* normative proposal, not part of this PR.

All other CORE rules remain those of the approved original: registry membership does not imply new Envelope.type or execution authority; legacy five signed types, compact aliases, WELCOME versus session ACCEPT, error taxonomy, immutable original signatures, opt-in ext and release gating remain unchanged. The source is a design proposal; the actual stable protocol and mainnet are separately unadmitted.

### Qualification status

This document certifies row-by-row **translation/source mapping coverage**, not successful wire tests or completion of the Class C RFC period. Semantic source-vs-registry alias mismatch remains an OPEN governance issue.
