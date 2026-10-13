# G5 QUIC replay and admission-window qualification

Issue [#990](https://github.com/inn-media/truyn/issues/990). Source qualification candidate; no stable TRUYN/1 declaration or production deployment.

The authenticated direct QUIC path previously called the envelope handler again for a repeated signed NEED ID. The receiver now reserves the logical ID before invoking that handler. Its default bounded process guard rejects duplicate IDs across concurrent streams, connections, re-signed payloads and foreign signers. A configured `lifecycleLedger` uses the existing atomic SQLite/Cosmos reservation shared with HTTP and compact. Storage failure, capacity exhaustion or ambiguous completion never permits another handler invocation.

`TruynNetworkNode({ lifecycleLedger })` forwards the adapter to QUIC. The legacy at-least-once `workInboxPath` cannot be used with it, because automatic pending-work recovery would bypass durable no-redispatch. A bare QUIC handler's return value does not mark a NEED completed or settle usage. Durable terminal/result/outbox and provider receipt reconciliation are separate lifecycle operations.

The frozen receiver policy is in `spec/protocol/v1/lifecycle.md`: signed first NEED admission accepts at most 300000 ms of age or 30000 ms of future skew; boundaries are inclusive. Signature verification remains independent of age. Compact has no signed timestamp and keeps authenticated-session admission plus permanent ID consumption. No replay key expires merely because that first-admission window closes.

## Required evidence on one source SHA

- `tests/g5-quic-need-replay.test.js`: actual authenticated QUIC duplicate/concurrent/reconnect/capacity/foreign-ID/recipient/window tests; independent SQLite connections and reopen; QUIC/HTTP/compact namespace sharing; actual child-process SIGKILL before and after a counted local effect; async Cosmos adapter against a deterministic modeled store and partition/heal.
- `tests/g5-need-acceptance-window.test.js`: exact boundaries, old-signature verification, live HTTP rejection before reservation, and HTTP/compact concurrent admission.
- `sdk/conformance/lifecycle-peer/run-lifecycle.mjs`: all five native published/source SDK pairs use durable SQLite and add window, replica replay and reopened-ledger replay cases. Window tests consume the original SDK-signed envelope; no JavaScript substitute signer is used. This harness does not claim a native QUIC API in SDKs that do not expose one.
- Existing full qualification, DCO, security, all hosted CodeQL analyzers, five-SDK release/conformance, immutable predecessor interop and Class-D non-regression remain mandatory. Requalify the actual merged main before closing source acceptance.

## Separate live gate

The earlier isolated Azure trial [38372077644](https://github.com/inn-media/azure-control-plane/actions/runs/38372077644), controller SHA `c6bfc306a56815929e29c0232ff41a2e87842bbe`, ended in FAILURE: Cosmos creation exceeded the controller's 1800-second subprocess limit before two-host fault injection. Artifact `11801893172` was uploaded; its ZIP digest reported by Actions is `18a930faf98bab914d8602557c556bf329cd35a400ec7042daf6e6c01eb3f3fb`. Cleanup step returned zero; that alone is not independent proof that deletion completed.

This is not a passed cloud crash/partition/PITR trial. Actual cloud rerun, network deny/heal, restore against the latest replay state, provider-effect/receipt reconciliation and final same-source evidence are still required for G5. Local no-redispatch proof also cannot guarantee completion after a crash before the first effect. Keep #990 OPEN until its complete acceptance contract is independently established.
