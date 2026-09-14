# TRUYN/1 Security

**Status:** release-candidate security contract for the bounded Open 1.0 core profile where stated below; broader security targets remain pre-stable until their dedicated acceptance gates pass.

TRUYN assumes hostile or faulty peers can exist and that a participant may use a custom client, know the public source code, know or guess provider identifiers, replay requests, forge requester-controlled policy fields and directly call compatibility routes.

## Core requirements

TRUYN/1 security includes:

- authenticated encrypted transport where available;
- canonical signed messages;
- replay/expiry checks;
- explicit key/credential revocation;
- provenance preservation;
- Sybil/collusion-aware trust policy;
- rate/resource limits;
- sandboxing for compute execution;
- privacy/egress controls;
- signed software updates and rollback-capable migrations;
- provider ownership and tenant isolation;
- authorization-aware discovery;
- billing/entitlement resolution before chargeable execution;
- fail-closed provider dispatch;
- credential locality for BYOK providers;
- convergence of every execution-capable transport on equivalent provider-policy enforcement.

## Timestamp, freshness and replay contract

The signed `createdAt` value MUST be a parseable RFC 3339 / ISO-8601 timestamp. An unparseable timestamp is invalid.

The bounded Open 1.0 core does not impose one universal maximum age on every message type: an OFFER can have its own validity period, a NEED can have a deadline, and a RESULT remains bound to the lifetime/terminal state of its correlated request. Receivers MUST apply the type-specific lifetime before any side effect.

The initial `IDENTITY` registration path has an explicit interoperable freshness profile already enforced by the public relay:

- the registration MUST NOT be more than **5 minutes** old when received;
- the registration MUST NOT be more than **30 seconds** in the receiver's future;
- an accepted registration message `id` is a replay token for that freshness window;
- the same registration `id` MUST NOT be accepted again while its replay marker is live;
- a stale, future, or replayed registration MUST cause zero provider/work execution and MUST NOT create a second authenticated session from the replayed message.

For other side-effecting core messages, the signed `id` and type-specific correlation state form the replay/idempotency key. A receiver MUST either reject an already-consumed message/correlation or return the already committed idempotent outcome; it MUST NOT repeat the provider-side side effect. RESULT, cancellation and streaming terminal-state rules further constrain replay by their own normative contracts.

No separate unsigned requester-controlled nonce grants authority. Where a transport handshake defines a nonce (for example an authenticated session HELLO), that nonce is transport/session replay material and MUST remain bound to the signed handshake contract rather than becoming provider/account authority.

Replay caches are bounded operational state. Resource exhaustion of a mandatory replay cache MUST fail closed for the affected acceptance path rather than silently disabling replay protection.

## Identity is not authorization

A valid signature proves control of a TRUYN identity. It does not grant that identity permission to use every provider visible on the network.

Cryptographic identity, provider authorization and claim truth are separate concerns.

## Provider execution boundary

Before a private or chargeable provider is invoked, an implementation MUST resolve an authoritative requester identity/tenant, provider policy and billing/entitlement decision.

Requester-supplied owner/tenant/billing claims MUST NOT become authoritative solely because they are signed by the requester.

A missing or ambiguous mandatory policy decision MUST fail closed.

See `provider-policy.md`.

## Public relay boundary

Public relay reachability permits protocol participation only. It MUST NOT be interpreted as entitlement to owner-private AI/provider capacity.

A relay SHOULD avoid disclosing private provider metadata to unauthorized requesters. Execution authorization remains required even if a provider ID is known through logs, history or another channel.

## Credentials

Raw upstream provider credentials, cloud client secrets, service-account private material and private TRUYN keys MUST NOT be required inside normal `OFFER`, `NEED`, `RESULT` or discovery payloads.

BYOK/provider credentials SHOULD remain in the local/provider runtime secret boundary.

## Legacy/alternate transports

HTTP, WebSocket, MCP, SDK, relay fast paths and future native transports MUST NOT define independent execution shortcuts that bypass provider authorization.

## Resource and cost abuse

Authorization is necessary but not sufficient for abuse resistance. Implementations SHOULD additionally enforce replay protection, request-size limits, concurrency/rate limits and explicit quotas/entitlements for chargeable/shared providers.

Operational limits are policy data and need not be published in the public protocol specification except where, as with the bounded registration freshness window above, an interoperable acceptance rule is intentionally frozen.

## Trustability distinction

Cryptographic identity proves control/attribution, not truth. Remote attestation can strengthen integrity evidence but also does not prove factual correctness. Trustability is a claim/decision property and does not override provider authorization.

## Revocation priority

Security-critical revocations and compromised-key information should receive high propagation priority.

## Acceptance condition

A provider-security implementation is incomplete until negative tests prove that anonymous/foreign requesters, known private provider IDs, forged owner/tenant fields, replayed/stale acceptance messages and legacy routes cannot cause unauthorized or duplicate upstream provider calls.
