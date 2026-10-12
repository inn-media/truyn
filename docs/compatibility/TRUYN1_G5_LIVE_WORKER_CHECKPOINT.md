# G5 isolated live worker — source checkpoint, not live qualification

Status: **SOURCE CANDIDATE / LIVE NOT RUN**. Workstream: issue #990.

This source-only change improves the prepared two-job fixture. It does not install an Azure deployment/controller workflow and does not provision resources, start jobs, change existing workloads or send paid inference.

## Changes

The fixture signs NEED and RESULT with generated test identities, binds the immutable request fingerprint and source SHA/run, confirms a supervised child actually exits via SIGKILL after the durable reservation, checks recovery from the peer worker, rejects changed identity and duplicate work, commits one signed terminal outbox event and verifies ACK after constructing a fresh ledger client. Host identity hashes are reported; different physical machines are **not** inferred from different container names.

The connection-fault path uses a loopback forwarding socket to the real configured Cosmos endpoint. Closing that socket and reopening it tests a real client-link TCP failure, not an Azure VNet partition, regional failover or PITR. No shared network rule is changed. Its upstream origin is fixed, preventing forwarding to a caller-selected destination.

The Dockerfile requires an explicit base image and runs the worker as the unprivileged `node` user. A future separately reviewed deployment must pin the base image digest, use dedicated test database/container and new least-privilege identity, bound replicas/time/throughput, and prove cleanup ownership. The fixture is not runnable with missing G5 test configuration. CI checks syntax, fail-closed configuration and isolated child process liveness; these checks are **not** a live two-host PASS.

## Child liveness regression

The original child awaited a never-resolving promise after sending its durable checkpoint. That promise alone did not keep the Node event loop alive: a local Node 22.16.0 reproduction exited with code 13 before a delayed supervisor could send SIGKILL. A delivered checkpoint alone is therefore not a crash witness.

The child now explicitly references its existing IPC channel before announcing the checkpoint. `tests/g5-worker-child-liveness.test.js` executes the exact `childWork()` body in a separate process with local ledger stubs, waits 150 ms after the checkpoint to expose premature exit, and requires `{code:null, signal:'SIGKILL'}` after the supervisor kills its own child. The regression was observed RED before the fix and GREEN after it. This proves IPC/process liveness only, not the durability of the stubbed ledger, live Azure identity, physical host separation or external effects.

## Execution checkpoint

The attempted publication of the Azure provisioning/cleanup controller was rejected by the tool's safety checks before that controller was committed. No cloud trial started from that operation. No incomplete controller or auto-launch workflow is included in this source checkpoint. The cause is not established as an Azure credential or GitHub repository permission failure.

Prior evidence remains metadata discovery only. The separately merged PR #1063 supports GET of an already known stored Azure Responses ID; that is not safe recreation after loss of the original ID, nor invoice settlement.

## Still required for G5 acceptance

Actual isolated Azure execution; independently observed host separation and crash windows; shared Cosmos data-plane CAS under partition/recovery and restore; full signed relay/transport and five-SDK retries; durable verified provider receipt binding and accounting finality. Provider calls in this fixture remain zero. Opaque external outcomes remain unknown and must not be blindly retried. Issue #990 stays OPEN; no Stable TRUYN/1 or Mainnet admission follows.
