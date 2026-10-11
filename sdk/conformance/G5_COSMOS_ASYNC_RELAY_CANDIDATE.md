# G5 Cosmos async relay candidate conformance (issue #990)

**Candidate only, no production admission or G5 PASS.**

Five candidate SDKs retain the published signed envelope and compact wire formats. The relay now awaits shared transactional lifecycle reservation and terminal CAS before it returns a direct NEED receipt, dispatches to any provider, or delivers RESULT/REVOKE. The signed PARTIAL durable outbox is committed first and ACK is only explicit after consumer storage. This candidate exercises both legacy HTTP and compact HTTP across independent relays sharing a deterministic Cosmos REST mock. WebSocket RESULT is awaited in the same terminal CAS path; the five language suites remain mandatory.

Failure contract: a lost Cosmos connection fails before dispatch; stale terminal state cannot be overwritten; conflicting ID retry does not enqueue new work; expired in-memory request detail is not permission to recycle IDs. A durable shared backend does **not** make third-party API charges exactly once. Unknown provider effects remain blocked until independently verified receipt/reconciliation.

No actual Azure Cosmos account, cross-region network split/heal or provider-charge verification is performed by this candidate PR. Those acceptance gates remain outstanding in #990.
