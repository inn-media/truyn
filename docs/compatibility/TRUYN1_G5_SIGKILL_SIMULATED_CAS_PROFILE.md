# G5 multi-process SIGKILL and partition simulation

**Status: executable test fixture, not live Azure qualification.** Issue #990 remains OPEN.

The `tests/g5-cosmos-cross-process-sigkill.test.js` suite launches **two independent OS Node.js relay processes**, not just two relay objects in one test process. Both communicate by HTTP with the same deterministic Cosmos-compatible ETag/CAS model running in the test parent process.

The covered windows include:

- Signed NEED admission committed before a real `SIGKILL` of the original relay; provider and requester reconnect to the second relay, whose local request state is empty.
- Network partition of the surviving relay from shared CAS causes fail-closed 503, followed by heal and immutable signed terminal RESULT/CAS.
- A same-ID signed retry cannot re-reserve the NEED after a failed host; the requester can recover exactly one signed RESULT from the durable outbox and explicitly ACK it.
- An external-effect **intent record** survives process loss and cross-worker recovery. Conflicting requester identity fails closed. The fixture counts only mock effects/intents, **not real paid provider calls**.

These tests DO NOT exercise live Azure Cosmos consistency/failover, managed identity/RBAC, real network split across independent cloud hosts, Cosmos point-in-time restore, vendor charging behavior, provider receipt idempotency or billing finality. The production claim remains `G5 OPEN` until the independent live crash/partition/reconciliation acceptance matrix is recorded and exact-main postmerge qualification is green.

Run only in a disposable local/CI environment. The test worker listens on a loopback port and uses a local HTTP mock; it neither provisions Azure infrastructure nor sends paid inference requests.
