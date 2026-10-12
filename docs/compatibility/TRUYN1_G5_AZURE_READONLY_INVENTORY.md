# G5 #990 — Azure distributed exactly-once readiness inventory

**Scope:** public `inn-media/truyn`, read-only G5 infrastructure discovery. **Status: OPEN — NOT ADMITTED.**

## Why this gate exists

A deterministic in-memory/mock Cosmos ETag/CAS run and real OS-process `SIGKILL` against that mock do not establish Azure Cosmos consistency, safe regional writer failover, point-in-time restore, 2+ independent live-host recovery, provider financial idempotency, or settlement finality. G5 is only complete after all independently measured gates in issue #990 pass; do not close the issue on successful metadata discovery.

## Bounded automatic probe

`.github/workflows/g5-azure-readonly-inventory.yml` runs once when merged to public `main` (or by explicit workflow dispatch) with existing public-repo OIDC. It verifies the exact checkout and uses read-only Azure CLI calls to inventory existing Cosmos accounts/databases/containers, `/partitionKey` compatibility, continuity/security configuration, Container Apps count and managed identity presence. It never emits names, IDs, credentials, provider payloads, or topology. Scans have bounded account/database/container limits. Only aggregate counts enter an immutable run artifact `g5-readonly-evidence.json`.

This inventory does **not** create, modify, deploy, delete or activate anything in Azure, does not call AI providers, and always marks `BLOCKED_NOT_LIVE_QUALIFIED`. Failed Azure authorization or unavailable resources are blockers, not permission to silently revert to SQLite or simulated evidence.

## Mandatory successor before final G5 closure

1. Accept only a scoped **isolated** Cosmos account/container with Entra data-plane RBAC, `/partitionKey`, immutable replay tombstones, backup/restore and bounded capacity; verify actual write consistency and single-writer fencing without touching production services.
2. Run real 2+ separate cloud hosts with authenticated registration and global OFFER authority. Inject the issue #990 six `SIGKILL` windows plus partition/heal/restore/region failover, with immutable counts and signed outbox/ACK comparisons.
3. Prove **one external provider effect and one accounting settlement** through vendor-supported idempotency or authoritative receipt lookup; ambiguous remote outcomes must remain quarantined and never be blindly resent or falsely billed. Mock counts do not qualify.
4. Run five SDKs plus HTTP/compact/WebSocket/A2A/MCP applicable negatives, owner and policy boundaries, full exact-source CI/CodeQL/Class-D and post-merge independent reconciliation.
5. Only after all evidence is independently admitted, update issue #990 to COMPLETE. This readiness inventory provides no authorization to deploy paid inference or Mainnet.

**No new wire freeze**. The five signed kinds, TCJ1/Ed25519 bytes and SDK historical artifacts are unchanged.
