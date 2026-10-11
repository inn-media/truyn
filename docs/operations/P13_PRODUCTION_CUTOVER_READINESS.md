# P13 production cutover: inventory, independent proof and rollback

**Status: BLOCKED.** This document is not permission to deploy or declare Stable TRUYN/1. Actual `TRUYN/1` remains pre-stable in `spec/compatibility/matrix.md`, and `TRUYN/2` is not implemented.

## Ten-domain evidence inventory

`operations/p13-production-cutover-plan.json` enumerates **all currently identified** durable state surfaces: identity keys, reference filesystem authority, managed Cosmos checkpoint, network state, durable inbox, trust/revocations, semantic indexes, content/artifacts, BYOK config and entitlements/accounting. Actual deployed applicability and every additional private storage backend MUST be independently reconciled. Shared implementation files do not imply that domains may be skipped.

## Ordered production gates

1. Identify the **real** authoritative source of existing production state, including writer ownership, private deployment source SHA, revision and immutable SHA-256 digest. Never invent source state or bootstrap an empty managed authority.
2. Inventory deployed software/protocol/wire/storage/SDK versions and qualified compatibility negotiation. Alpha SDK interoperability does not establish a stable wire generation. Unsupported versions MUST fail closed.
3. Verify existing backup, access restrictions, Cosmos Entra-only identity/private network and continuous PITR against live read-back. Document writer quiescence; no silent fallback to owner-funded execution.
4. Quiesce writes and record per-domain source snapshots/checksums and recovery checkpoints without leaking secrets into public artifacts. Preserve node signing keys, monotonic sequence, inbox terminal state, revocations and accounting reservations.
5. Test versioned migration for **each actual** domain on isolated replicas. Abort on any domain without a supported migrator. The accepted local BYOK schema-1→2 helper is not a general network upgrade.
6. Test actual released-version cross-generation peer negotiation, positive/negative signed-envelope fixtures across five SDK ecosystems, and lossless identity/storage transitions.
7. Run an **isolated** live authority plus relay/provider canary using real source state and fail-closed negative authorization/stale cache tests.
8. Execute isolated point-in-time restore, validate checkpoint digest/revision, and perform nine recovery drills under the canonical recovery RTO/RPO; never restore over the live authoritative source.
9. Rehearse controlled rollback with post-rollback identity/revocation/inbox/accounting checks. Obtain immutable independent auditor attestation tied to exact deployed SHAs.
10. Only a **separate privileged** controller, explicitly authorized for traffic changes after all gates PASS, may perform production cutover. It must support immediate rollback and keep evidence private/sanitized.

## Current blockers

- No stable protocol-release declaration/qualified version-generation bridge.
- No independently attested snapshot from the current live authoritative producer.
- No verified live PITR restore and ten-domain recovery manifest.
- No production canary, independent cross-version migration and verified rollback.

## Executable read-only preflight

`node scripts/p13-production-readiness.mjs` returns a machine-readable `BLOCKED` decision and missing evidence. It **cannot** approve or perform production changes, even if passed fabricated all-success JSON. Repository CI exercises the inventory, negative cases and fail-closed decision.

The already existing `.github/workflows/production-authority-source-discovery.yml` provides Azure OIDC *read-only* subscription-wide source-candidate discovery through an explicit `workflow_dispatch`. Run it first and inspect its sanitized `production-authority-source-discovery-evidence` artifact. A candidate is not proof of authority, a backup is not a restored checkpoint, and an SDK alpha test is not a production cutover.

Follow `docs/operations/PRODUCTION_PERSISTENCE_DR.md` for Cosmos foundation, managed bootstrap and real cutover order. No private topology or credentials should be stored in GitHub documentation or public Actions artifacts.

## Read-only incident RCA for earlier red runs

The existing P13 workflow also classifies the failed Production DR Foundation run [#38160940813](https://github.com/inn-media/truyn/actions/runs/38160940813) (source SHA prefix `01fb6431`) using **Azure ARM deployment operations error codes only**, and inventories the presence/running state of Tempo and the acceptance-probe Container App. The output `p13-dr-trace-readonly.json` is an aggregate sanitized evidence artifact; missing permissions produce `UNKNOWN` instead of a false PASS.

This identifies why DR provisioning failed and whether the trace probe container is present/running, but does **not** read actual traces, validate retention, rerun failed deployments or authorize production cutover. Trace backend run [#38160940676](https://github.com/inn-media/truyn/actions/runs/38160940676) remains FAIL until independent OTLP ingestion, 30/90-day retention policy read-back and actual trace query PASS.

**P13 stable-v1 gate stays OPEN until independent live evidence passes.**
