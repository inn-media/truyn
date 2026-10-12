# Documentation sanitation — 2026-10-12 (truyn)

**Reviewed source snapshot:** `0d4a701a1365430db15f023eb2310cc21f0f9288`. This records a documentation audit, not a moving current-main pointer, protocol release, deployment or certification of every product gate.

## Coverage

The complete tracked documentation snapshot was inventoried: **384 text/documentation files**, including **328 Markdown documents**. Local link targets, current SDK/release claims, historical references and evidence/acceptance boundaries were inspected. All 79 files under `docs/benchmarks/` remain byte-identical to the reviewed snapshot. Historical dates, source identities, digests and observed results are not rewritten as current state.

## Corrections

Current SDK coordinates now agree across the machine ledger, five-SDK freeze inventory, packaging/compatibility tables, SDK READMEs, quickstarts and roadmap. The original Developer Release ledger is preserved byte-exact under `sdk/release/evidence/public-coordinates-developer-release-2026-09-23.json`; historical npm/PyPI/Maven/NuGet verification retains its original hashes and run IDs. Maven/NuGet are no longer falsely described as unpublished.

P1–P14 now distinguish normative **DEFINED**, executable **IMPLEMENTED**, bounded acceptance and final release qualification. [The machine evidence inventory](../compatibility/protocol-rc-documentation-inventory.json) points to the actual normative/test/certificate files. P6–P9 and P11 are not missing specifications; their outstanding acceptance must not be replaced by an automatic PASS. P10/P12 retain separately recorded bounded scopes. P13-FORMAT and P13-OPS stay separate, and P14 draft labels remain intentional.

Descriptor serving-time refresh and shared missing/blank endpoint/type negatives are recorded as implemented source behavior. Broader release-specific lifecycle acceptance, delegated signing and stable admission remain separate. No immutable historical SDK is assumed to inherit newer source behavior.

Issue #615 was re-read. Its body already records S103 PR #823 as merged and sets `RECONCILIATION_REQUIRED`; the old S103 implementation capsule is explicitly historical. This sanitation does not fabricate S104–S200 acceptance or mark the task COMPLETE.

## Repeatable checks

Run `node scripts/check-documentation-consistency.mjs` and `node --test tests/documentation-release-regression.test.js`. The guard compares all five source/registry versions, checks P1–P14 proof paths and Markdown local links, preserves the historical ledger digest, and rejects intentionally injected stale coordinates and false Stable promotion. It performs no network access or release admission.

Targeted local documentation/publication/Descriptor/RC tests: **18/18 PASS** on the reviewed source plus this patch before final report insertion. Full exact-head and post-merge CI results belong to the actual pull request/check runs; this report does not pre-claim them.

## Changed paths

- `README.md`
- `ROADMAP.md`
- `SECURITY.md`
- `STRUCTURE.md`
- `docs/README.md`
- `docs/architecture/ARCHITECTURE_CONTRACT.md`
- `docs/architecture/IMPLEMENTATION_STATUS.md`
- `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `docs/compatibility/P13_FORMAT_COMPATIBILITY.md`
- `docs/compatibility/README.md`
- `docs/compatibility/SDK_COMPATIBILITY.md`
- `docs/compatibility/SDK_PACKAGING.md`
- `docs/compatibility/TRUYN1_RC_GAP_LEDGER.md`
- `docs/compatibility/TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md`
- `docs/compatibility/protocol-rc-documentation-inventory.json`
- `docs/getting-started/DX3_SDK.md`
- `docs/getting-started/MVP_QUICKSTART.md`
- `docs/getting-started/SDK_QUICKSTART.md`
- `examples/README.md`
- `examples/sdk/README.md`
- `scripts/check-documentation-consistency.mjs`
- `sdk/README.md`
- `sdk/conformance/README.md`
- `sdk/dotnet/README.md`
- `sdk/go/README.md`
- `sdk/java/README.md`
- `sdk/python/README.md`
- `sdk/release/PUBLISHING.md`
- `sdk/release/evidence/public-coordinates-developer-release-2026-09-23.json`
- `sdk/release/public-coordinates.json`
- `spec/compatibility/matrix.md`
- `tests/documentation-release-regression.test.js`
- `tests/maven-nuget-publication-workflow.test.js`

## Preservation and limits

No runtime protocol, provider, authorization, deployment, active dependency or benchmark threshold is changed. Existing immutable release evidence is not deleted or replaced by a summary. This audit reconciles documentation against available source and scoped evidence; it is not a fresh live-cloud test or an independent final Stable-v1/Mainnet goal reconciliation. Historical operational observations remain historical and may require their own task-scoped current-state verification.
