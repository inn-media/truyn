# TRUYN/1 non-CORE — complete 111-entry COMPOSED source parity

**Status:** SOURCE TRANSLATION CONFORMANCE / EXPERIMENTAL PROPOSAL ONLY.

This English report contains a faithful name-by-name translation of the **111** COMPOSED rows of the approved original non-CORE architecture. It preserves their form classifications, descriptions and method-level composition contracts. Exact tokens and protocol identifiers are not renamed.

**Original-language reference SHA-256:** `c345631992e3e96f84e67dcf48a85c15281f5912ae1bfd131c5f904b9da46e72`.
**Companion:** [English non-CORE technical edition](TRUYN_WIRE_FREEZE_EXTENSIONS_FINAL_EN.md). The source's 10 EXTENSION and 4 PROFILE definitions are in that edition; this file restores the complete detailed COMPOSED table which the previous English summary omitted.

**Scope distinction:** A composition may only call CORE wire forms that the specific peer has already implemented and negotiated. If underlying STATE/DELTA/SUBSCRIBE/COMPUTE or EVENT/RETRIEVE is a future draft, the composition remains *target design, not currently deployed*. Security-sensitive actuation requires authenticated operator/provider rights and independent hardware safety. Settlement or payment proof does not grant execution authority.

## COMPOSED-by-domain source parity

| Source grouping | Message | Source form translated | Purpose translated | Composition method and limits translated |
|---|---|---|---|---|
| A | `RESOLVE` | Scenario | Resolve an identifier to current reachable endpoints | Router queries signed peer record truyn-peer-record-v1 through FIND_NODE / FIND_VALUE B20/B50 before sending |
| A | `ROUTE` | Scenario | Transfer routing information | Use FIND_NODE B20 responses; new independent Kademlia route advertisements are unnecessary and risk route poisoning |
| B | `PROGRESS` | Attribute | Report task completion percentage or estimated progress | progress and eta fields in HEARTBEAT F40 |
| B | `PLAN` | Object | Describe an agent-produced action plan | A planning NEED returns RESULT and the plan is referenced by OBJECT digest |
| B | `EXECUTE` | Operation | Request execution of an approved plan | NEED references approved plan digest and ATTEST or PROOF of authorization |
| B | `CONSENSUS` | Scenario | Coordinate multiple participants' agreement on a result | Send NEED to participants then collect signed VOTE representations and apply the quorum decision rule |
| B | `VOTE` | Object | Represent one participant's vote | ATTEST H20 or CLAIM with a voting field |
| B | `EVALUATE` | Scenario | Evaluate the quality of a RESULT | VERIFY H50-like NEED to evaluator followed by ATTEST about RESULT quality |
| B | `FEEDBACK` | Object | Report performance feedback | Signed CLAIM about execution, a reputation input; includes REPUTATION_EVENT |
| B | `CONSTRAINT` | Attribute | Express hard constraints on requested work | Existing NEED.policy constraint semantics in need.md |
| B | `SCHEDULE` | Attribute | Schedule deferred or recurrent execution | NEED.policy.notBefore and recurrence; recurrent results use SUBSCRIBE and EVENT if admitted |
| C | `QUERY` | Operation | Request information or structured knowledge | NEED with a query capability, returning RESULT |
| C | `SEARCH` | Operation | Search distributed information sources | Search-capability NEED to one or more providers, with candidate providers from DISCOVER B80 |
| C | `INDEX` | Scenario | Register searchable data | STORE B40 DHT index record, or OFFER / ADVERTISE |
| C | `MERGE` | Data | Merge domain-state changes | DELTA G30 referencing multiple base states |
| C | `MEMORY` | Data | Publish or retrieve agent memory | Context of type memory through CONTEXT_PUT D50 / CONTEXT_DELTA D60 plus optional RETRIEVE |
| C | `KNOWLEDGE` | Object | Publish structured knowledge | CLAIM with subject/predicate/value, or STATE / OBJECT |
| C | `PROVENANCE` | Attribute | Explain data or RESULT origins | References and fields in CLAIM, RESULT and OBJECT core/provenance; not a distinct Envelope type |
| D | `GRANT` | Object | Issue a scoped authorization | Signed delegated-authority certificate in payload, e.g. core/trust/source-owner-pki.js; includes DELEGATION_GRANT |
| D | `AUTHORIZE` | Operation | Request an authorization decision | Provider policy evaluated before execution; explicit authority-service request is a NEED |
| D | `POLICY` | Object | Publish or update a policy | Signed policy OBJECT by ID or digest plus an EVENT announcing the change |
| D | `CREDENTIAL` | Object | Refer to a verifiable credential without disclosing secrets | PROOF H70 or OBJECT reference to the credential |
| D | `KEY_ROTATE` | Attribute | Rotate cryptographic identity keys | IDENTITY C10 rotation section where old key signs new; identity.md requires explicit signed rotation |
| D | `KEY_REVOKE` | Attribute | Revoke a cryptographic key | REVOKE C50 with targetKind key under an admitted schema; code already uses TRUYN_IDENTITY_REVOKED |
| D | `AUDIT` | Object | Produce a verifiable audit record | Entry in core/trust/transparency-log.js with proof of inclusion |
| D | `IDENTITY_BIND` | Object | Bind a physical device, agent or service to a node identity | Signed source-owner certificate in IDENTITY or ADVERTISE |
| D | `DELEGATION_REVOKE` | Attribute | Withdraw delegated authorization | REVOKE C50 with targetKind grant only under an admitted schema |
| D | `SECURITY_ALERT` | Data | Announce a security incident | Security-category EVENT requesting critical priority under negotiated ext and local policy |
| E | `UNSUBSCRIBE` | Attribute | Cancel an existing subscription | REVOKE C50 with targetKind subscription under future admitted schema |
| E | `STREAM_OPEN` | Scenario | Start a streaming operation | NEED invoking a streaming capability per partial.md |
| E | `STREAM_DATA` | Scenario | Deliver a streaming chunk | PARTIAL D30; media streams use QUIC; sensor streams use SENSOR_DATA profile |
| E | `STREAM_CLOSE` | Scenario | Finish or cancel a stream | Terminal RESULT C40 or requester-owned REVOKE |
| E | `RETRY` | Transport | Request a retransmission | QUIC handles transport retransmission; requester decides application retry via OUTCOME.retryable and safe idempotency |
| E | `FLOW_CONTROL` | Transport | Control a sender's streaming rate | Existing QUIC transport flow-control features |
| E | `PRIORITY` | Attribute | Set requested delivery priority | NEED.policy.priority and RPC lanes critical/control/background |
| E | `DEADLINE` | Attribute | Bound the lifetime or completion deadline | NEED.policy.deadline; Envelope reception lifetime via createdAt and admission window |
| E | `BATCH` | Transport | Group several signed messages | Transport container packs multiple signed envelopes in one frame, verifying each independently |
| E | `MULTICAST` | Scenario | Deliver to a specific subscribed group | EVENT published to a topic that the group subscribes to |
| E | `BROADCAST` | Scenario | Distribute within an authorized scope | EVENT to scoped topic with amplification protection |
| F | `DEVICE_REGISTER` | Scenario | Register equipment on the network | IDENTITY registration, IDENTITY_BIND owner certificate and ADVERTISE descriptor |
| F | `DEVICE_DESCRIPTOR` | Attribute | Describe hardware interfaces and capabilities | Hardware information subsection of ADVERTISE B70 |
| F | `DEVICE_HEALTH` | Status | Report diagnostic health of equipment | HEALTH F20 with self-diagnostic results |
| F | `DEVICE_COMMAND` | Operation | Request an authorized bounded device action | NEED with device.* capability and authorization, RESULT outcome; includes ACTUATE |
| F | `DEVICE_CONFIG` | Status | Manage equipment configuration | Desired/actual STATE with DELTA; updates via NEED device.config; includes SENSOR_CONFIG |
| F | `FIRMWARE_INFO` | Attribute | Describe installed firmware | Descriptor ADVERTISE field or device STATE value |
| F | `FIRMWARE_UPDATE` | Operation | Authorize a device firmware upgrade | NEED device.firmware.update, OBJECT image digest, signature PROOF and GRANT; STATUS and HEARTBEAT progress |
| F | `BOOT_ATTEST` | Scenario | Attest boot-state integrity | CLAIM about boot measurements and hardware-key PROOF, evaluated by verifier ATTEST |
| F | `POWER_STATUS` | Status | Report device battery or mains status | STATE or SENSOR_DATA using power schema |
| F | `DEVICE_REBOOT` | Operation | Request an authorized device restart | NEED device.reboot with provider-side authorization |
| F | `DEVICE_SLEEP` | Operation | Enter power-saving mode | NEED device.power.sleep; relay or gateway buffers traffic while endpoint sleeps |
| F | `DEVICE_WAKE` | Operation | Wake a sleeping device | NEED routed to relay or gateway that wakes equipment |
| F | `DEVICE_RECOVER` | Operation | Request an authorized safe recovery procedure | NEED device.recover under authorization |
| G | `ROBOT_CAPABILITY` | Attribute | Describe robot sensing, actuation, grasp and navigation abilities | CAPABILITY C60 with robot.* names in ADVERTISE |
| G | `MISSION` | Operation | Assign a high-level robotic mission | NEED robot.mission with goals, constraints and zones, CORE ACCEPT/REJECT, STATUS, HEARTBEAT, RESULT, REVOKE; optional PAUSE/RESUME |
| G | `NAVIGATE` | Operation | Request robot travel to a destination | NEED robot.navigate |
| G | `POSE` | Data | Represent position and orientation in physical coordinates | Structured pose schema with position, orientation, frame and time in SENSOR_DATA or STATE; includes POSITION |
| G | `VELOCITY` | Data | Represent speed and movement heading | Schema in SENSOR_DATA or STATE |
| G | `TRAJECTORY` | Data | Represent a planned movement trajectory | Structured schema; large trajectories referenced via OBJECT |
| G | `MAP` | Object | Store a spatial map | Content-addressed map OBJECT plus DELTA for updates |
| G | `LOCALIZE` | Operation | Estimate physical position on a map | NEED robot.localize returning RESULT with POSE |
| G | `PERCEPTION` | Data | Report environmental understanding | Schema in EVENT or STATE; large media referenced through OBJECT |
| G | `DETECTION` | Data | Describe a detected object, person or obstacle | EVENT carrying class, position and confidence; includes OBSTACLE |
| G | `TRACK` | Data | Track motion or identity of an observed object | STATE or EVENT track schema, streamed using SUBSCRIBE |
| G | `MANIPULATE` | Operation | Perform a physical manipulation | NEED robot.manipulate.*; includes GRASP and RELEASE |
| G | `CONTROL_MODE` | Operation | Request a permitted robot control-mode change | NEED robot.control_mode plus STATE of current mode |
| G | `SAFETY_STATE` | Status | Describe current independent local safety status | STATE or EVENT safety schema with requested critical priority; includes INTERLOCK_STATE |
| G | `COLLISION_RISK` | Data | Warn about possible collision | Safety-category EVENT requesting critical priority under negotiated ext and local policy |
| G | `ZONE_RESERVE` | Scenario | Reserve a bounded physical zone | LEASE for geometry, ownership and time interval |
| G | `ZONE_RELEASE` | Attribute | Release a physical zone | LEASE release via REVOKE targetKind lease only with negotiated schema; otherwise local lease API |
| G | `FLEET_ASSIGN` | Scenario | Assign a mission to another robot | DELEGATE or manager-issued NEED |
| G | `FLEET_COORDINATE` | Scenario | Coordinate multiple autonomous robots | EVENT and STATE with zone LEASE and CONSENSUS |
| G | `DOCK` | Operation | Request arrival at a charging/docking station | NEED robot.dock and station LEASE |
| G | `HUMAN_OVERRIDE` | Status | Indicate authority shifted to local operator | STATE or EVENT indicating local operator control, critical hint; reject remote commands while active |
| H | `ASSET_REGISTER` | Object | Register an industrial asset | Asset recorded as STATE/OBJECT; networked asset also uses IDENTITY_BIND |
| H | `ASSET_STATE` | Status | Describe the current physical equipment state | STATE G20 with asset as subject; includes DEVICE_STATUS |
| H | `DIGITAL_TWIN` | Object | Describe a digital representation of a physical asset | Model OBJECT plus evolving STATE |
| H | `TWIN_SYNC` | Scenario | Reconcile physical asset and its digital twin | SYNC B60 or DELTA plus SUBSCRIBE when supported |
| H | `PROCESS_STATE` | Status | Describe industrial process state | STATE with process schema |
| H | `PROCESS_COMMAND` | Operation | Perform an authorized industrial operation | NEED process.* with authorization and safety interlocks |
| H | `SETPOINT` | Operation | Change an authorized control target | NEED process.setpoint with bounds, ramp-rate restrictions and confirmation |
| H | `CALIBRATE` | Operation | Request equipment calibration | NEED device.calibrate |
| H | `FAULT_REPORT` | Data | Describe a device or process fault | Fault-category EVENT and STATE; may raise ALARM; includes DEVICE_FAULT |
| H | `QUALITY_REPORT` | Object | Record industrial quality inspection results | RESULT or report OBJECT plus CLAIM/ATTEST |
| H | `SIMULATE` | Operation | Run a simulation against a supported model | NEED or COMPUTE I00 with simulation capability |
| H | `PREDICT_FAILURE` | Operation | Predict an equipment failure horizon | Predictive NEED returns RESULT or CLAIM with likelihood and horizon |
| H | `WORK_ORDER` | Scenario | Represent a maintenance or industrial work task | NEED/DELEGATE with STATUS; distinct from commercial ORDER C72; includes MAINTENANCE |
| I | `RESOURCE_ALLOCATE` | Scenario | Allocate computational resources | LEASE for computing resource |
| I | `RESOURCE_RELEASE` | Attribute | Release computing resources | REVOKE targetKind lease only with negotiated schema or local lease API |
| I | `DEPLOY` | Operation | Deploy a software artifact | NEED runtime.deploy with artifact digest OBJECT and explicit provider authorization under compute.md |
| I | `UNDEPLOY` | Operation | Remove a deployed component | NEED runtime.undeploy or deployment REVOKE |
| I | `MIGRATE` | Scenario | Move a task or process between hosts | CHECKPOINT, HANDOFF and RESTORE sequence |
| I | `CHECKPOINT` | Operation | Persist intermediate task state | NEED task.checkpoint returns RESULT containing state OBJECT |
| I | `RESTORE` | Operation | Resume from an approved checkpoint | NEED referencing a checkpoint OBJECT |
| I | `FAILOVER` | Scenario | Move work to an alternate node | Router reselects provider followed by HANDOFF |
| I | `REPLICATE` | Scenario | Copy a data object to another holder | RETRIEVE from holder then store with new one; DHT uses STORE RF3 |
| I | `CAPACITY` | Attribute | Advertise available executor capacity | OFFER.metadata availability or ADVERTISE |
| I | `LOG` | Data | Publish structured diagnostics | Event type log or TRACE F30 |
| J | `PRICE_QUOTE` | Attribute | State or request a commercial price | Price in OFFER.metadata, budget in NEED.policy; per-request quote uses BID |
| J | `USAGE` | Attribute | Describe consumed resources | RESULT.metadata.usage; includes METER |
| J | `INVOICE` | Object | Reference a payable invoice | External settlement adapter object, represented in TRUYN by digest or reference |
| J | `PAYMENT_INTENT` | Object | Declare intention to pay | Payment adapter object e.g. x402/AP2; opaque TRUYN reference |
| J | `PAYMENT_AUTH` | Object | Provide verifiable payment authorization | AP2 mandate as PROOF, not provider execution authorization |
| J | `SETTLEMENT_PROOF` | Object | Prove settlement of an obligation | PROOF H70 with settlement category |
| J | `REFUND` | Operation | Request returning previously settled funds | Settlement adapter action plus commercial ORDER STATUS C75 |
| J | `ESCROW` | Attribute | Describe conditional payment holding terms | CONTRACT C71 condition enforced by payment adapter |
| J | `SERVICE_LEVEL` | Attribute | Express a service-level commitment | SLA conditions in CONTRACT or OFFER.metadata |
| K | `SCHEMA` | Object | Retrieve or announce a data schema | Schema OBJECT by digest, linked from CAPABILITY; access through RETRIEVE |
| K | `DEPRECATE` | Attribute | Publish planned feature retirement | Flag in ADVERTISE/VERSION with EVENT |
| K | `UPGRADE_NOTICE` | Data | Announce a new protocol/application version | EVENT and refreshed ADVERTISE; DISCONNECT before optional restart |
| K | `COMPATIBILITY_REPORT` | Object | Report cross-version behavior | RESULT or report OBJECT with ATTEST |
| K | `CONFORMANCE_PROOF` | Object | Provide signed compliance evidence | ATTEST or PROOF of conformance with signed report OBJECT |

## Completeness and conformance declaration

- Original source `COMPOSED` rows: **111**; English rows: **111**; matched identifiers: **111**.
- Classification and composition form preserved: **111/111**.
- Row purposes and how-to-compose instructions translated individually: **111/111** (editorial source-to-English review). This is *source-text coverage*, not an implemented feature test.
- `EXTENSION`: 10 (not promoted); `PROFILE`: 4 (not promoted).
- Identifiers carrying an implementation proposal never imply a new physical Envelope type, session frame, QUIC method or compact letter.
- Historical signatures, trust receipts, source IDs and original approved hashes remain unchanged. This file is a new English derivative with its own blob/digest.

The source's optional categories, alternate terminology and examples must not silently override the immutable public A–I CORE registry. New wire admission requires its own Class C decision and independently accepted five-SDK conformance.
