# Physical AI interoperability architecture (planned)

**Status: PLANNED / not implemented or hardware-qualified.** This document defines roadmap and ownership, not a new normative TRUYN/1 wire object and not an accepted safety claim.

## Product principle
**A robot need not know which vendor provides intelligence. It must discover an eligible capability, obtain authorization to use it, and exchange cryptographically verifiable results.** Capability-first selection is distinct from permission to command an actuator.

## Open reference architecture
Physical device/application -> ROS 2 / MQTT / Device adapters -> TRUYN Node/SDK -> signed OFFER/NEED/RESULT -> policy-authorized discovery/dispatch -> eligible AI/robot node. Responses carry correlation, signed provider identity, result verification, provenance and bounded artifacts. Physical actuation is always behind a *local* safety controller.

TRUYN is **not** a motor controller, safety PLC, hard-real-time motion bus, robotics operating system or replacement for ROS 2. No cloud/relay roundtrip may be part of an emergency-stop, collision avoidance, stabilization or other safety-critical real-time loop.

## Planned publicly implementable connectors
| Bridge | Public adapter contract | Boundaries |
|---|---|---|
| ROS 2 Bridge | Explicit allowlisted ROS 2 topics (read-only by default), services and actions; goal/result/feedback/cancel mapping | QoS-aware correlation, bounded payloads, ROS names/types not authority |
| MQTT Bridge | Authenticated MQTT 5 (compatible subset documented), typed topics to capabilities/events, QoS/reconnect mapping | Broker ACL plus TRUYN ACL; no wildcard actuation, dedup across redelivery |
| Device Adapter | Portable driver/plugin contract for edge Linux/gateways and supported hardware integrations | Device capabilities/status/constraints only; no arbitrary shell, bus, CAN, GPIO or actuator passthrough |
| Simulation Bridge | ROS 2 simulator/test-fixture mapping | Test without hardware; repeatable fault injection |

Shared adapter conformance must exercise discover->authorize->dispatch->verified-result, tenant isolation, unauthenticated/unauthorized deny, replay, expiry, dropped connection, duplicated MQTT delivery, cancellation races, stale telemetry and artifact bounds. Neither MQTT broker credentials nor robot control credentials travel in TRUYN envelopes.

## Physical capability metadata (extension, not core-protocol fork)
Advertise semantic capabilities such as `vision.object.detect`, `inspection.perform`, `robot.pick.request` in existing OFFER/Agent Descriptor extension metadata. Version schemas, transport profile, input/output units and coordinate frames, safety class, spatial envelope, location/data-residency constraint, device readiness, freshness, approval requirement and evidence policy. Claims by an untrusted participant never grant authorization. Dynamic availability belongs to OFFER; stable descriptions to Descriptor.

## Autonomous-operation safety gates
1. **Identity/permission:** authenticate physical requester, device/provider and authorized tenant/grant for each action; deny by default and audit.
2. **Intent validation:** schema/units/frame validation, limits on workspace/speed/force, bounded task TTL, deny stale sensor data.
3. **Local execution gate:** locally enforce policy and human approval where appropriate; a remote RESULT is advice, not executable authority.
4. **Replay/idempotency:** signed correlation, action lease, deduplication across reconnect/retry; cancellation cannot be assumed to undo physical side effects.
5. **Fail safe:** independent local watchdog and E-stop, no motion when network or authorization is unknown; safe halt on timeouts.
6. **Independent evidence:** negative misuse cases, simulation, hardware-in-the-loop, physical test logs, safety review; no production or certification claim from software CI alone.

## Version boundary
**V1 / first mainnet:** capability discovery, authorization, signed results, *offboard* ROS 2/MQTT/Device bridge integrations for bounded non-safety-critical tasks; can integrate an existing robot controller but TRUYN does not operate an Edge Controller product.
**V2 / post-mainnet:** managed/on-device Edge Controller product and advanced local orchestration/offline behaviors, with dedicated hardware qualification. The Edge Controller is explicitly excluded from V1 first-mainnet acceptance.
Physical AI adapters and safety reference gates are additional roadmap deliverables, **not retroactive prerequisites for already accepted D/S/H evidence**, and not a claim that existing TRUYN/1 or stable mainnet is ready.

## Open/private boundary
**OPEN:** public bridge contracts, reference connectors, capability extension schemas, SDK entrypoints, conformance, simulator harness and local safety reference/policy enforcement examples.
**PRIVATE:** managed device fleet/tenant registry, commercial policy/ranking, audited device enrollment, managed incident/telemetry operations, billing and enterprise fleet controls. Private consumes only accepted released public interfaces; no private production secrets or hardware identities in Open.
