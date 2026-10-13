# P6-P9 / P11 / P13-FORMAT lifecycle evidence and P14 reconciliation

This extends the accepted twenty signed NEED/RESULT exchanges with a mandatory 540-row coverage inventory: five languages, four published/source provider-requester combinations, fifteen direct lifecycle/security scenarios and twelve compact streaming scenarios. The frozen SDK coordinates and package digests are unchanged. No cloud resources, paid providers, private repositories or production routing are modified.

## Real actor boundaries

Go, Java and .NET use their native public client methods for signing, cancellation and verified events. TypeScript uses the published `TruynLocalNodeClient` and its public bundled `runtime` for cancellation and compact signing/polling. Python uses the actual SDK public `create_envelope` primitive for REVOKE, with its public `LocalIdentity`; the small HTTP fixture is explicitly **primitive-level**, not proof of a missing high-level cancellation method. No Java/.NET private-key reflection or replacement reference signer is used to pretend that a package supports PARTIAL.

A local transparent HTTP proxy observes synthetic requests and statuses in memory only. The reference adversary uses its own separate identity to attempt a cross-transport replay of a NEED ID originally emitted by the tested SDK. The test never acquires or exports a tested peer's private key.

## Required executable cases

Direct cases cover signed OFFER integrity, owner-only withdrawal and cancellation, same-ID replay, cross-transport replay, result ownership, withdrawal without retroactive cancellation, verified delivery, duplicate terminal rejection, cancellation after completion, repeated cancellation, late-result suppression, replay after cancellation, concurrent RESULT/REVOKE finality and unsupported-generation registration rejection.

Compact cases cover sequence gaps, zero-based start, identical and conflicting retries, backpressure without advancement, ordered drain, retry after drain, terminal ordering, late PARTIAL, duplicate RESULT, foreign-provider output and cancellation/late-PARTIAL suppression.

## Honest coverage, never a release shortcut

An absent native compact API is `UNSUPPORTED`, never `PASS`. The current TS bundled runtime can exercise compact behavior; SDK pairs without native compact entrypoints produce explicit uncovered rows, blocking full lifecycle coverage. If an SDK later gains those methods, the harness refuses an obsolete unsupported waiver and must be extended to execute the native API. Existing immutable packages are never rewritten.

The workflow emits `lifecycle-report.json` and an independently calculated `p14-lifecycle-coverage.json` beside the original five-package receipts. Context binds exact source SHA, tree, Actions run/attempt and SHA-256 of the original verified package report. Duplicate, missing, foreign-SHA and self-declared stable evidence is rejected. The CI job can successfully collect an honest **BLOCKED** coverage inventory; this is not successful stable-release admission.

Complete P14 still requires native coverage for every required SDK/version, accepted P1-P13 contract/security/durable-lifecycle evidence, same-source hosted checks and independent postmerge reconciliation. Production P13-OPS remains separate. Nothing in this test campaign changes draft labels or declares Stable TRUYN/1.
