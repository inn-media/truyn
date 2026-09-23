# Storage

Local persistence for node identity metadata, claims, content-addressed objects, mutable state, trust evidence/receipts and cache indexes.

Storage schema versions are independent of TRUYN protocol generation. Migrations must preserve logical identity and provide rollback/recovery checkpoints when possible.

## Where the code is today

This directory currently holds **design ownership notes only**. Implemented persistence lives in:

| Concern | Implementation |
|---|---|
| Durable mutable state | `network/state/persistent-state.js`, `core/security/durable-json-store.js` |
| Claims | `core/claims/index.js` |
| Node identity | `core/identity/index.js` |
| Semantic index / cache | `core/context/semantic-index-store.js`, `core/context/sharded-semantic-index-store.js` |
| Inbox / admission durability | `network/admission/durable-inbox.js` |

Storage schema migrations have no code yet; see [`docs/architecture/PLANNED_MODULES.md`](../docs/architecture/PLANNED_MODULES.md).
