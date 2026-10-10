# Independent dependency, task-capsule and production reconciliation — 2026-10-10

This is an evidence-bound sanitation checkpoint, not a claim that all modules or production deployments are accepted.

## Exact source snapshot

- Public `inn-media/truyn`: `ac7dd75dfc4e9f9dc101b9fe211106655822993c` at audit start; 1,246 tracked blobs.
- Private `inn-media/truyn-platform`: `7dcb2e7edb1c6a61b6c671bd11593692ca438c7b` at audit start; 999 tracked blobs.
- Both Git trees were complete (`truncated=false`).

## Duplicate-content inventory (Git blob identity, exact bytes)

Public contains four groups of exactly identical tracked blobs:
1. `.github/d200-repeatability/launch-01.template.txt` and `launch-01.txt`; launcher lineage/automations require reachability validation before removal.
2. `LICENSE` and copies within each public SDK and spec; intentional redistributable license notice, **do not remove**.
3. `NOTICE` and copies within each public SDK and spec; intentional redistributed notices, **do not remove**.
4. D-200 sanitation `evidence-ledger-pre.json` and `evidence-ledger-post.json`; retain as distinct pre/post audit captures, even when bytes coincide.

Private main's 999 blobs showed no byte-identical duplicate groups in the Git-tree scan. Exact-content duplication is not architectural duplication; separately named modules may be semantically overlapping.

## Unused-module and deletion policy

Executable public guard: `scripts/audit-dependency-reachability.mjs`; test: `tests/dependency-reachability-sanitation.test.js`. It scans the full tracked tree, records static references and duplicate-content groups, and lists possible unreferenced modules **without deleting any**.

A zero static inbound reference is insufficient to prove a file dead because GitHub Actions, package exports, installed clients, dynamic loaders, historical workflows and manual operators can invoke paths independently. Deletion requires negative proof for every known entrypoint, release compatibility verification and component/full qualification at exact head.

**Authorized deletion count: 0.** No module was demonstrably safe to delete from the available source/evidence. No infrastructure or private product code was changed.

## Private 107 authoritative capsule divergence

Private control branch `autopilot/private-product-remaining-107-722604`, task anchor issue #271:
- `.github/private107-autopilot/runtime/.../STATE.json` says current `S070`, `READY_FOR_FINAL_RECONCILIATION`, goal `NOT_REACHED`, checkpoint S069 PASS on `c2bec23dab617d269f20184322a88a772ff0a8d9`.
- Adjacent `CONTROL.md` still says `S066` and earlier private SHA `b1fda37199c88f70a5093319f1be865cd3325aef`.
- Main at audit time has advanced beyond both; task branch state must be reconciled against main and issue #271 before any final G1–G34 closure. **No COMPLETE claim**.
- The control-branch snapshot is not independently verified as current production state. No private capsule mutations were made.

## Private CI and deploy boundary

- Latest observed private implementation runs at `7ea7679afb57ddceb34193afe659dc98b8dbc03d` include failing `Private Implementation Tests` run `38063221636`, while private guardrails run `38063221894` succeeded. These source runs are not the audited `main` SHA and must not be silently attributed to it.
- `.github/workflows/deploy-truyn-org.yml` exists privately. It defines production deployment on private main changes to `site/truyn.org/**`, with manual dispatch, OIDC and protected production environment. A workflow definition is not proof of successful deploy or currently active Azure resources.
- `docs/operations/PRODUCTION_TOPOLOGY.md` explicitly describes P19-S01 foundation/resource classes and requires deployed build SHA, identity bindings, HA, restore/failover and monitoring evidence.
- No Azure/GCP provider-native live readback or successful exact-deployed SHA was established in this audit. Production deployment status = `UNVERIFIED`, not GREEN or RED. Public HTTP request to truyn.org could not be validated from the available web request.
- GitHub deployment/environments endpoint enumeration was not available through the current connector. Avoid making up resource state.

## Remaining independent closure gates

1. Reconcile all active private task capsules on their own task branches, then repair stale adjacent control docs in **private scoped tasks**, without letting public sanitation mutate private task execution state.
2. Compare registered package exports, all dynamic imports/CLI and workflow dispatch, and native client installers with static reachability before deleting any candidate.
3. Perform provider-native read-only Azure/GCP deployed-resource and site readback, exact GitHub Actions deploy run, build SHA, DNS and public-edge verification.
4. Execute exact-source tests and independent cross-repository contract comparison before any status promotion.

Never rewrite historical benchmark evidence merely to erase inconvenient failures.
