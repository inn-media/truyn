# TRUYN Main Security-Green Evidence — 2026-08-23

Status: **PASS — exact tested source accepted**

This record closes the CI regression first observed by the immutable verifier on historical source `0972a3f0373c4ce9df80cd0efe53b9293488077d`, records the fail-before reproduction, the minimal remediation, the ordinary CI result on the new exact `main` source, and the immutable verifier evidence pinned to that same source.

## Historical failure identity

- Historical tested source: `0972a3f0373c4ce9df80cd0efe53b9293488077d`
- Historical immutable verifier run: `32638888690`
- Historical verifier job: `97192772550`
- Failing step: `Run and publish exact-main canonical CI`
- Historical workflow conclusion: `failure`
- Canonical command sequence in that step:
  1. `npm install --ignore-scripts --no-audit --no-fund`
  2. `TRUYN_LOCAL_DEVELOPMENT=1 npm test`
  3. `git diff --check`

The historical job metadata identifies the failing combined canonical-gate step. Exact command-level failure was independently reproduced against the same immutable source because the historical raw job log was not used as the sole evidence source.

## Fail-before reproduction

Focused immutable fail-before:

- Run: `32657133006`
- Job: `97237546013`
- Exact checkout SHA: `0972a3f0373c4ce9df80cd0efe53b9293488077d`
- Node: `v22.23.2`
- npm: `10.9.8`
- Exact command: `TRUYN_LOCAL_DEVELOPMENT=1 node --test tests/public-repository.test.js`
- Exit: `1`
- Failing test: `public repository contains no known operational/cloud leakage or credential patterns`
- Assertion: `ERR_ASSERTION` / `AssertionError`
- Operator: `deepStrictEqual`
- Expected: `[]`
- Actual: 34 public-repository leakage violations
- Assertion stack location: `tests/public-repository.test.js:199:10`
- Focused test summary: 2 tests, 1 pass, 1 fail
- Artifact: `exact-0972-public-repository-fail-before`
- Artifact ID: `9497732033`
- Artifact SHA-256: `sha256:f59b55cbf5d1d8f40dddeba7f21c817b8d6fea01c74da08835078266405bd3e5`

The 34 violations consisted of 33 findings from 11 temporary D-1000 operational workflow files plus one forbidden operational marker in the public Azure origin-lock evidence. No acceptance threshold or leakage predicate was changed to obtain the fix.

## Minimal remediation

By the time the fix branch was cut from then-current `main` `4254a50076846dbdcaf76c452766100de76f1134`, ten of the eleven historical temporary workflow files had already been removed by intervening work. The minimal remaining remediation therefore changed only two paths:

1. removed the final completed temporary D-1000 launcher workflow from the public tree;
2. removed the internal deployment-managed proof-header name from `docs/benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md` while preserving the accepted perimeter semantics and evidence.

`tests/public-repository.test.js` was not weakened or modified.

Fix PR:

- Pull request: `#277`
- Fix head: `3042933dbf606eebc2de5be6485cc18776c45924`
- Ordinary PR CI run: `32657243065`
- PR CI job: `97237817754`
- Install: PASS
- Full test suite: PASS
- `git diff --check`: PASS
- PR CI conclusion: `success`

## Exact tested main source

The fix was merged as:

`9b62718242f449c4339ba34245c589950c1be5bc`

This is the exact source SHA accepted by the ordinary CI and immutable verifier recorded below.

### Ordinary push CI

- Workflow: `CI`
- Event: `push`
- Run: `32657420977`
- Job: `97238271478`
- Head SHA: `9b62718242f449c4339ba34245c589950c1be5bc`
- `npm install --ignore-scripts --no-audit --no-fund`: PASS
- `npm test`: PASS
- `git diff --check`: PASS
- Run conclusion: `success`

The ordinary-run metadata was independently read back through a temporary read-only observer and archived as artifact `9497817794`, digest `sha256:8400a9b050ba69e001ce963a7e5e56f924209abb217779d21ed8fa28dce78a38`.

## Immutable verifier

The immutable verifier explicitly checked out the exact tested source SHA rather than the verifier branch head.

- Target SHA: `9b62718242f449c4339ba34245c589950c1be5bc`
- Actual checkout SHA: `9b62718242f449c4339ba34245c589950c1be5bc`
- Verifier run: `32657576008`
- Verifier job: `97238651988`
- Node: `v22.23.2`
- npm: `10.9.8`
- Install exit: `0`
- Full test exit: `0`
- Diff-check exit: `0`
- Full suite: 281 tests, 281 pass, 0 fail
- Canonical evaluator: **PASS**
- Strict terminal verdict: **PASS**
- Exact-SHA status context: `truyn/main-ci-exact-9b627182 = success`

Immutable artifact:

- Name: `immutable-main-security-green-9b627182`
- Artifact ID: `9497857389`
- Artifact SHA-256: `sha256:88a5155112445e18a41cdcafed69137b9b55e35cb9eeb4569e406238e9e56fa8`
- Artifact retention configured by verifier: 30 days

The artifact contains the exact target and checkout SHAs, command exit codes, evaluator and terminal verdicts, and canonical command logs. Its recorded evidence JSON states `evaluator=PASS` and `terminal=PASS`.

## Acceptance statement

For tested source `9b62718242f449c4339ba34245c589950c1be5bc`:

- ordinary CI on the exact source is green;
- the immutable verifier is pinned to the exact same source;
- canonical install, full test suite, and diff-check all pass;
- evaluator is PASS;
- terminal is PASS;
- immutable artifact identity and SHA-256 digest are recorded;
- the public-repository leakage guard remains intact.

Therefore the tested source is accepted as **security-green** for the canonical repository CI gate represented by `.github/workflows/ci.yml`.

The temporary observer/verifier workflows are execution scaffolding only and are not part of durable `main` state.
