# A2A C5 Async Task Lifecycle

**Scope:** bounded A2A `1.0` long-running task lifecycle for the TRUYN A2A client/provider edge.

C5 extends the C4 A2A client/provider adapter with an explicit polling execution mode while preserving the existing blocking default. It does not claim the later C6 artifact-integrity, C7 bidirectional bridge, or C8 complete security/evidence gates.

## Contract

The C5 polling path is:

```text
TRUYN NEED / imported A2A capability
        ↓
A2A SendMessage(returnImmediately=true) — exactly once
        ↓
server-issued Task { id, contextId, status }
        ↓
bounded GetTask(id) polling
        ↓
terminal / interrupted Task state
        ↓
COMPLETED Artifact → existing C4 TRUYN RESULT mapping
```

The default `taskExecutionMode` remains `blocking`. Operators explicitly select `polling` when the remote A2A task should return immediately and be tracked through `GetTask`.

## C5 guarantees

- polling mode sends `SendMessage` exactly once and never falls back by re-dispatching the same work;
- `returnImmediately:true` is used only for explicit polling mode;
- the client follows the server-issued task ID through bounded `GetTask` polling;
- a `GetTask` response with a different task ID fails closed;
- a non-empty task context ID may not change during polling;
- unknown task states fail closed rather than being interpreted as success;
- `INPUT_REQUIRED` and `AUTH_REQUIRED` remain explicit interrupted outcomes;
- failed, rejected and canceled tasks remain explicit failures;
- polling is bounded by `taskTimeoutMs` and `pollIntervalMs`;
- dynamic A2A transport credentials are refreshed for every request;
- lifecycle metadata records execution mode and poll count;
- C4 blocking behavior remains the default for compatibility.

## Repository evidence

`tests/a2a-async-lifecycle.test.js` proves the protocol-facing lifecycle contract:

- `SUBMITTED/WORKING → COMPLETED` progression;
- exactly one `SendMessage` with repeated `GetTask` polling;
- A2A version and dynamic auth continuity;
- task-ID substitution rejection;
- context-ID drift rejection;
- explicit `INPUT_REQUIRED` / `AUTH_REQUIRED` handling;
- bounded timeout without duplicate execution.

`tests/a2a-async-integration.test.js` proves the real composed path through the existing C3 server facade and TRUYN runtime:

```text
A2A C5 client/importer
  → C3 A2A server facade
  → TRUYN NEED
  → delayed real provider host execution
  → TRUYN RESULT
  → C3 Task state
  → repeated GetTask
  → COMPLETED result
```

The integration proof asserts exactly one provider execution.

## Explicitly not closed by C5

C5 does **not** claim:

- A2A streaming or push-notification lifecycle support;
- cancellation equivalence;
- continuation after `INPUT_REQUIRED` / `AUTH_REQUIRED`;
- generalized text/JSON/file integrity or digest-preserving artifact translation — **C6**;
- A2A→TRUYN→MCP and MCP→TRUYN→A2A bidirectional bridge proof — **C7**;
- the complete cross-protocol negative-security matrix and final interoperability evidence gate — **C8**.

Those remain separate acceptance slices.
