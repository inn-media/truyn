# Exact qualification: P11, P12 and P13-FORMAT

**Status: prerelease qualification only.** This candidate does not publish packages, authorize cutover or declare Stable TRUYN/1.

The existing five-published-freeze interop workflow fetches and verifies immutable packages from npm, PyPI, Go proxy, Maven Central and NuGet and exercises the real 20-case published/source NEED-to-RESULT matrix. The new final step runs P11 negotiation/malformed-generation tests, P12 verified object/reference positives and negatives, and P13 format-local rollback/release-scope negatives after native successor tests. It binds their results to the same source SHA, tree, Actions run and attempt, published package receipts and lifecycle evidence.

Artifact: **p11-p12-p13format-exact-qualification.json**, uploaded with the prior five-SDK artifacts. Its assertions refuse missing/duplicate SDK cells, wrong package receipt digests, stale run/SHA, false native success or missing negative suites.

Boundaries: P11 is bounded source-profile evidence, not real TRUYN/2 interop. P12 is strict reference-profile evidence, not distributed OBJECT transport. P13-FORMAT remains **PRE_STABLE** until five new immutable published release versions, positive and negative old/new format+signature+required-semantic interoperability, final wire freeze, exact released package SHA and independent post-merge reconciliation. Historical alpha binaries remain untouched. P13-OPS and P6-P9/G5/P14 remain independent gates. A green CI job is not permission to promote any of these statuses.
