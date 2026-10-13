# GitHub Actions sanitation — D-5000 historical workflows (2026-10-14)

Status: **PROPOSED / review required**. Source main commit: `ee7f682039ccb48168c84875a22077b32b705326`. No campaign, cloud deployment, inference, abort or cleanup is launched by this change.

## Inert, byte-identical evidence archive

Each historic workflow below is moved (not rewritten) from `.github/workflows/` to `archive/github-actions/d5000/`. The original Git blob SHA is preserved; earlier runs and their artifacts remain referenced by their original run IDs. Archived YAML is never an eligible GitHub Actions workflow. To restart any campaign, a newly reviewed and freshly authorized controller with a new launch identity, quotas, duplicate guards and exact-SHA qualification is required. Do **not** simply move an archived workflow back.

| Original executable workflow | Archived file | Immutable Git blob SHA |
|---|---|---|
| `.github/workflows/d5000-abort-37824934693.yml` | `archive/github-actions/d5000/d5000-abort-37824934693.yml` | `69f30f678d3cf7bcbd4e1270a353f10ebf682536` |
| `.github/workflows/d5000-attempt1.yml` | `archive/github-actions/d5000/d5000-attempt1.yml` | `a56e56234196eb97f771e70f1359e530bc6d0948` |
| `.github/workflows/d5000-attempt10-approved.yml` | `archive/github-actions/d5000/d5000-attempt10-approved.yml` | `560de76f49fff212e8c477e672787f7b70ca98b7` |
| `.github/workflows/d5000-attempt10-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt10-offline-qualification.yml` | `479ca1634d35382aa4219a588f20564b86b37565` |
| `.github/workflows/d5000-attempt11-approved.yml` | `archive/github-actions/d5000/d5000-attempt11-approved.yml` | `0e07bc13b690a0f8591f7f1ccd89bb9fa5f188c1` |
| `.github/workflows/d5000-attempt11-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt11-offline-qualification.yml` | `4a05c698c0b667097804179a62eeec588910ae56` |
| `.github/workflows/d5000-attempt12-approved.yml` | `archive/github-actions/d5000/d5000-attempt12-approved.yml` | `ca4dbab00d826203d2f3a805859f768d03191cb1` |
| `.github/workflows/d5000-attempt12-immutable-evidence-proof.yml` | `archive/github-actions/d5000/d5000-attempt12-immutable-evidence-proof.yml` | `c3912186adaeed124fa9cbd6c183812787839582` |
| `.github/workflows/d5000-attempt2-approved-only.yml` | `archive/github-actions/d5000/d5000-attempt2-approved-only.yml` | `33b202f6d1743045f19fe98fc212d41b2edc6dcc` |
| `.github/workflows/d5000-attempt2-clone-attempt1.yml` | `archive/github-actions/d5000/d5000-attempt2-clone-attempt1.yml` | `555382b45caa4d3f31258d35f40dffba3f06f350` |
| `.github/workflows/d5000-attempt2-retry1-approved.yml` | `archive/github-actions/d5000/d5000-attempt2-retry1-approved.yml` | `a402af7871c794a00f8d86662e5c436751d503b9` |
| `.github/workflows/d5000-attempt2-retry1-qualification.yml` | `archive/github-actions/d5000/d5000-attempt2-retry1-qualification.yml` | `38c45016bccbb57d7c34b7d4f57fde4f6845990a` |
| `.github/workflows/d5000-attempt3-approved.yml` | `archive/github-actions/d5000/d5000-attempt3-approved.yml` | `6ddc053b8ae4e588a26a0e964e97f1577c9a1379` |
| `.github/workflows/d5000-attempt4-approved.yml` | `archive/github-actions/d5000/d5000-attempt4-approved.yml` | `84d37d901e0344a2ad0ef651d5b3937f11831a10` |
| `.github/workflows/d5000-attempt4-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt4-offline-qualification.yml` | `a6283ab6fe70072cf97782b8da76371406826bb1` |
| `.github/workflows/d5000-attempt5-approved.yml` | `archive/github-actions/d5000/d5000-attempt5-approved.yml` | `a2953e8583ffa3b49c6101531c9d4412d5d0feb3` |
| `.github/workflows/d5000-attempt5-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt5-offline-qualification.yml` | `aeab1d4ece8f9fbe95f6a4bafafe26ef4bc7b8b3` |
| `.github/workflows/d5000-attempt6-approved.yml` | `archive/github-actions/d5000/d5000-attempt6-approved.yml` | `73ec2330948a2af4e7a769b752e5c4e79acbb16f` |
| `.github/workflows/d5000-attempt6-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt6-offline-qualification.yml` | `148579d0dfb23587f8209095c0e0de3c73eae473` |
| `.github/workflows/d5000-attempt7-approved.yml` | `archive/github-actions/d5000/d5000-attempt7-approved.yml` | `74b90b672c816981d7d836d93bb23a8d4f51b41b` |
| `.github/workflows/d5000-attempt7-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt7-offline-qualification.yml` | `5764f8a97a806ba9b5f8f76cfc153fd38a3d0550` |
| `.github/workflows/d5000-attempt8-approved.yml` | `archive/github-actions/d5000/d5000-attempt8-approved.yml` | `7120635885e07dda9f07824de735edf9a2e5a0c4` |
| `.github/workflows/d5000-attempt8-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt8-offline-qualification.yml` | `a6499ff877c7c9eee40f229f7eb9b1bdc0b4dde1` |
| `.github/workflows/d5000-attempt9-approved.yml` | `archive/github-actions/d5000/d5000-attempt9-approved.yml` | `7c86730ef36d7df5683d13200ed7bf5ff9586ff6` |
| `.github/workflows/d5000-attempt9-offline-qualification.yml` | `archive/github-actions/d5000/d5000-attempt9-offline-qualification.yml` | `d079f1bd60cd4a5fbde96b28d7140f9d16aa9eb1` |
| `.github/workflows/d5000-bootstrap-scale-repair-qualification.yml` | `archive/github-actions/d5000/d5000-bootstrap-scale-repair-qualification.yml` | `7e66cf0578d768a7f8e0745ee3560d5e3b085353` |
| `.github/workflows/d5000-exact-source-qualification.yml` | `archive/github-actions/d5000/d5000-exact-source-qualification.yml` | `c6f39ced94a9c48f660374ba4646e7b24d2b4098` |
| `.github/workflows/d5000-force-cancel-37824934693.yml` | `archive/github-actions/d5000/d5000-force-cancel-37824934693.yml` | `b2c7c49ab6b2c899f6994c6475db2cd606270be0` |
| `.github/workflows/d5000-p0-p1-repair-qualification.yml` | `archive/github-actions/d5000/d5000-p0-p1-repair-qualification.yml` | `358e5879d84d5a39a060e90968616ed03cb30fea` |
| `.github/workflows/d5000-posix-sh-repair-qualification.yml` | `archive/github-actions/d5000/d5000-posix-sh-repair-qualification.yml` | `1001bf41575be018e8c602883054adf1bd775d6e` |
| `.github/workflows/d5000-quota-only-20261008.yml` | `archive/github-actions/d5000/d5000-quota-only-20261008.yml` | `3f1e77c01adea723e765be323851a6a0163d33f0` |
| `.github/workflows/d5000-sku-readonly-20261008.yml` | `archive/github-actions/d5000/d5000-sku-readonly-20261008.yml` | `802f2805ac5a02e9875265759c8ccc1dcde470ec` |

## Intentionally retained live until separate evidence reconciliation

- `.github/workflows/d5000-attempt13-approved.yml` — latest attempt; archive only after terminal run, Azure cleanup and immutable evidence are independently reconciled.
- `.github/workflows/d5000-attempt13-offline-qualification.yml` — frozen candidate companion; do not silently remove while the latest attempt remains unresolved.

These are **exceptions, not authorization to re-run**. All remaining controllers in `.github/workflows/` require a later dependency/authority review before retirement. Archive counts are not a proxy for all safety gates passing.

## Safety contract

1. No archive restoration to `.github/workflows/` without new user approval and reviewed exact-source gates.
2. No historical campaign re-dispatch, no Azure/GCP token usage, no mutation of production resources as part of hygiene.
3. Keep original workflow bytes, history, run IDs, artifact IDs/digests and docs/benchmarks proof; redact sensitive evidence fields instead of removing reports.
4. On PR qualification, verify the public repository leakage guard, pinned blobs, full CI and active-controller references; merge only with GREEN and no unrelated main movement.
