# TRUYN Main Security-Green Evidence — 2026-08-24

Status: **PASS — exact tested source accepted**

This record closes the exact-main CI/security regression chain for source `e5b0d959f452f2a5486fc194980588869a14b748`. It records the historical immutable failure, fail-before reproduction, focused regression coverage, minimal remediation, ordinary push CI on the exact accepted source, and the immutable verifier pinned to that same source.

## Historical failure identity

- Historical failing source: `0972a3f0373c4ce9df80cd0efe53b9293488077d`
- Historical immutable verifier run: `32638888690`
- Historical verifier job: `97192772550`
- Failing combined step: `Run and publish exact-main canonical CI`
- Exact failing command: `TRUYN_LOCAL_DEVELOPMENT=1 npm test`
- Exit: `1`
- `npm install --ignore-scripts --no-audit --no-fund`: exit `0`
- `git diff --check`: not reached because the canonical gate was fail-fast
- Failing test: `public repository contains no known operational/cloud leakage or credential patterns`
- Assertion location: `tests/public-repository.test.js:199`
- Assertion: `AssertionError [ERR_ASSERTION]` / `deepStrictEqual`
- Expected: `[]`
- Actual: 34 public-repository leakage violations
- Historical suite: 281 tests, 280 pass, 1 fail

## Independent fail-before reproduction

The same immutable historical source was reproduced independently under the canonical Node 22 gate:

- Exact checkout SHA: `0972a3f0373c4ce9df80cd0efe53b9293488077d`
- Reproduction run: `32660605445`
- Reproduction job: `97246080551`
- `npm install`: exit `0`
- `npm test`: exit `1`
- Artifact ID: `9498639467`
- Artifact SHA-256: `sha256:c3ec0d966d7d4baa495eb231f504c15749671283ff56140998657857741809fe`

The reproduction confirmed the failure was a repository regression rather than an infrastructure-only flake.

## Focused regression and minimal remediation

The durable regression is focused on preventing temporary D-1000 operational launch workflows from being committed into the public workflow tree.

Fail-before for that focused regression:

- Pre-fix source: `095322c66575433cfe89ddb49a9b7ac838b1225e`
- Temporary regression PR: `#289`
- Run: `32661437642`
- Job: `97248119053`
- Install: PASS
- Full test: FAIL as expected before remediation
- Diff-check: not reached because the test gate failed

Final corrective PR:

- Pull request: `#288`
- Final fix head: `0402c4fe193ffe6763ddeb1f95dd5081165efa6a`
- PR CI run: `32661377894`
- PR CI job: `97247967623`
- Install: PASS
- Full test suite: PASS
- `git diff --check`: PASS
- PR CI conclusion: `success`

The accepted correction removed the remaining temporary `tmp-class-d1000-*` launch workflows from the public tree, restored the original strict leakage predicate unchanged, and added focused regression coverage. No D-100/D-1000 threshold, evaluator, acceptance predicate, canonical harness, or public-repository leakage predicate was weakened.

## Exact accepted source

The corrective merge produced exact source:

`e5b0d959f452f2a5486fc194980588869a14b748`

This is the source SHA used by both the ordinary push CI and immutable verifier below.

## Ordinary push CI on exact source

- Workflow: `CI`
- Event: `push`
- Run: `32663507515`
- Job: `97253157176`
- Head SHA: `e5b0d959f452f2a5486fc194980588869a14b748`
- `npm install --ignore-scripts --no-audit --no-fund`: PASS
- `TRUYN_LOCAL_DEVELOPMENT=1 npm test`: PASS
- `git diff --check`: PASS
- Run conclusion: `success`

The ordinary-run metadata was independently read back by execution-only observer:

- Observer run: `32663847555`
- Observer job: `97254045118`
- Observer conclusion: `success`
- Observer artifact: `ordinary-ci-evidence-e5b0d959`
- Observer artifact ID: `9499451980`
- Observer artifact SHA-256: `sha256:72f105275f538f8cd8b8a4223c5a11cd6755ede8c73875d611815fdc53d9fd3e`

The observer artifact independently records `target_sha=e5b0d959f452f2a5486fc194980588869a14b748`, `run_id=32663507515`, `job_id=97253157176`, event `push`, conclusion `success`, and success for install, test, and diff-check.

## Immutable exact-SHA verifier

The immutable verifier explicitly checked out the accepted source SHA rather than the verifier branch head.

- Verifier workflow source commit: `b99d0a0f6606e9b01229b5f421763272afa3677c`
- Target SHA: `e5b0d959f452f2a5486fc194980588869a14b748`
- Actual checkout SHA: `e5b0d959f452f2a5486fc194980588869a14b748`
- Verifier run: `32663847573`
- Verifier job: `97254045178`
- Node: `v22.23.2`
- npm: `10.9.8`
- Install exit: `0`
- Full test exit: `0`
- Diff-check exit: `0`
- Full suite: 303 tests, 303 pass, 0 fail
- Canonical evaluator: **PASS**
- Strict terminal verdict: **PASS**
- Exact-SHA status context: `truyn/main-ci-exact-e5b0d959 = success`

Immutable artifact:

- Name: `immutable-main-security-green-e5b0d959`
- Artifact ID: `9499462311`
- Artifact SHA-256: `sha256:22ae49e65b9db2ba3944e1b4ad61c6e84e501892929a4918dd0b61dd324467d6`
- Artifact retention: 30 days

The immutable artifact contains canonical command logs and `evidence.json`. The evidence JSON records:

- schema: `truyn.main-security-green.v1`
- target SHA = actual checkout SHA = `e5b0d959f452f2a5486fc194980588869a14b748`
- all three command exits = `0`
- `evaluator = PASS`
- `terminal = PASS`

The verifier also published commit status `truyn/main-ci-exact-e5b0d959 = success` on the exact accepted source.

## Acceptance statement

For accepted source `e5b0d959f452f2a5486fc194980588869a14b748`:

- the historical failure was localized and independently reproduced;
- focused fail-before regression coverage exists;
- the root-cause correction is minimal and keeps the security predicate strict;
- ordinary push CI on the exact source is green;
- the immutable verifier is pinned to the same exact source;
- canonical install, full test suite, and diff-check all pass;
- evaluator is PASS;
- terminal is PASS;
- the immutable artifact ID and SHA-256 digest are fixed above;
- the exact-SHA status context is success.

Therefore source `e5b0d959f452f2a5486fc194980588869a14b748` is accepted as **security-green** for the canonical repository CI/security gate represented by `.github/workflows/ci.yml` and its strict security regression tests.

This file is a documentation-only attestation commit made after the accepted source was tested. The temporary observer/verifier workflows and temporary PRs are execution scaffolding only and must not be merged into durable `main` state.
