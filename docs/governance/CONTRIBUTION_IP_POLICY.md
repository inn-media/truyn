# TRUYN Contribution IP Policy

**Status:** Adopted / mandatory for new contribution commits from 2026-08-23 onward.

TRUYN uses the **Developer Certificate of Origin (DCO) 1.1** as its contribution provenance mechanism.

The canonical DCO 1.1 text is stored in the repository root as [`DCO`](../../DCO). Contributions remain governed by the project license, currently the **Apache License 2.0**. DCO sign-off supplements the license by recording the contributor's certification that they have the right to make the contribution.

## Mandatory sign-off

Every new contribution commit proposed to TRUYN MUST contain a `Signed-off-by` trailer:

```text
Signed-off-by: Your Name <your.email@example.com>
```

The normal Git command is:

```bash
git commit -s -m "your commit message"
```

The `-s` / `--signoff` flag is not a cryptographic signature. It records the contributor's DCO certification in the commit message.

TRUYN CI verifies that every commit in a pull request contains a `Signed-off-by` trailer whose email matches the commit author's email. A pull request with a missing or mismatched sign-off is not eligible for merge.

## What the sign-off certifies

By adding the trailer, the contributor certifies the terms of DCO 1.1, including that the contribution was created or received under conditions that give the contributor the right to submit it under the applicable open-source license, and that the public contribution record may be retained and redistributed consistent with the project/license.

The sign-off is a legal/provenance assertion. It is not merely an acknowledgment that the contributor read this policy.

## Scope

The DCO requirement applies to contribution commits containing, including but not limited to:

- protocol/specification changes;
- source code and tests;
- SDKs and adapters;
- documentation and examples;
- benchmark code/methodology/evidence changes;
- governance/RFC/decision records;
- build, CI and repository configuration.

The requirement is content-neutral: a documentation-only contribution is still a contribution.

## Fixing an unsigned commit

For the latest commit:

```bash
git commit --amend --signoff --no-edit
```

For a branch with multiple commits, use an interactive rebase or equivalent history edit and add a valid sign-off to each contribution commit. One common approach is:

```bash
git rebase --signoff <base-branch>
```

After rewriting an already-pushed contribution branch, update the branch safely according to the contributor's normal Git workflow. Contributors should avoid rewriting shared branches they do not control.

## Multiple authors and delegated work

Each commit author whose contribution is represented by the commit must have a valid DCO sign-off for that commit. `Co-authored-by` trailers do not replace DCO certification when a co-author is also making a contribution represented by the commit; projects/maintainers may require corresponding sign-off trailers where needed for clear provenance.

A contributor acting for an employer or another rights holder remains responsible for having the authority required by DCO 1.1. TRUYN does not infer corporate authorization merely from an email domain or job title.

## Bots and automation

Automation that creates contribution commits must use an attributable bot/service identity and include a valid sign-off for that author identity. A GitHub-generated integration/merge commit created only after the underlying contribution commits have passed the DCO gate is not treated as a new third-party contribution requiring a separate human certification.

## No CLA or copyright assignment by default

TRUYN does **not** currently require a Contributor License Agreement (CLA), copyright assignment, or an InnMedia-specific relicensing grant.

Contributors retain their copyright subject to the rights granted under the applicable project license. The project accepts contributions under Apache License 2.0 plus DCO 1.1 provenance certification.

A future proposal to introduce a CLA, copyright assignment, project-specific relicensing right, or materially different inbound contribution mechanism is a **Governance change**. It requires the published governance process and must be evaluated against TRUYN's neutral-stewardship goal.

## Prospective adoption; no history rewrite

This policy is prospective. It does not retroactively rewrite or invalidate historical commits made before adoption, and TRUYN MUST NOT rewrite established repository history merely to manufacture retroactive DCO trailers.

From adoption onward, new contribution commits are expected to satisfy the DCO gate.

## Enforcement boundary

The repository CI contains a DCO check for pull-request commits. Maintainers MUST NOT merge a pull request that fails the DCO check.

Repository rules/branch protection should require the CI status that contains this check so that a failing DCO contribution cannot be merged through the normal protected-branch path. Administrative emergency access does not convert a non-compliant contribution into a compliant one; any exceptional repository recovery must preserve or restore an auditable compliant contribution path.

## Governance ownership

This policy is part of TRUYN governance rather than an implementation convenience. Changes to the mandatory DCO version, sign-off semantics, waiver policy, CLA/copyright-assignment posture, or contribution provenance boundary are governed changes and require a durable public decision record.

See:

- [`../../DCO`](../../DCO)
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- [`../../GOVERNANCE.md`](../../GOVERNANCE.md)
- [`DECISION_PROCESS.md`](DECISION_PROCESS.md)
