# G5 async relay + shared ledger candidate

**Status: test-only / not admitted to production.** This stacked patch follows PR #1010 and leaves #990 OPEN.

The existing HTTP/compact/legacy relay now awaits the multi-host ledger's read/reserve/transition/outbox mutation before any direct NEED dispatch, terminal RESULT or REVOKE delivery, and requester ACK. WebSocket RESULT processing is awaited inside its authenticated handler. OFFER matching checks persistent withdrawal. Local SQLite behavior remains supported. The same storage adapter methods can be synchronous or asynchronous.

For each new direct NEED the relay passes authenticated requester node ID as `scope` and a hash binding the selected OFFER policy with the requested policy as `policyDigest`. This is **not** yet a production tenant/authority-policy proof. The existing authority control plane still requires explicit integration.

Signed PARTIAL now commits its frame and monotonically increasing sequence in the same Cosmos CAS record before live delivery. On backpressure, the signed event remains in the durable outbox until requester ACK rather than rolling back accepted work. The earlier local-only SQLite retry/rollback contract is not advertised as cross-host exactly-once.

## Qualification boundaries

- Deterministic Cosmos REST/ETag simulation under two independently registered relay servers and actual TRUYN client signed messages.
- One accepted NEED among concurrent legacy HTTP and compact HTTP, with the other rejected before provider dispatch.
- Cross-relay partial recovery / ACK, terminal cancellation CAS, and unavailable shared backend returning 503 before dispatch.
- No cloud calls, no costs, no production modification, no third-party side-effect receipt finality.
- Relay node registrations, socket routing and OFFER announcements remain local to each relay replica; cross-host placement and session migration are not yet production-qualified.
- A live split/failover, crash-after-remote-effect, fully durable global registration, provider-supported idempotency/receipt reconciliation and every G5 exact-SHA gate are **still required** before closing issue #990.

## Admission evidence rule

A deterministic two-relay in-process integration test only proves the signed request and shared REST/ETag adapter behavior under the mocked failure schedule. Real G5 qualification must additionally include separate-host recovery after SIGKILL, regional writer failover, split/heal, immutable signed outbox and ACK continuity, authenticated session re-registration and actual external provider effect/usage receipts. No test-only `SUCCESS` result authorizes enabling public dispatch in a production relay.
