# TRUYN SDK publication contract

**Release family:** npm `0.1.0-alpha.2` repair; PyPI `0.1.0a1`; Go/Java/.NET `0.1.0-alpha.1`  
**Canonical repository:** `inn-media/truyn`  
**npm Trusted Publisher workflow identity:** `.github/workflows/publish-sdk-alpha.yml` / workflow filename `publish-sdk-alpha.yml`  
**Protected GitHub Environment:** `sdk-release`  
**Protocol status:** `TRUYN/1` draft

A release is publishable only from an exact merged main commit whose ordinary CI, CodeQL/security, five-language executable conformance and release-package verification are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

npm `@truyn/sdk@0.1.0-alpha.1` is immutable but unusable for Node 22 ESM consumers because the published artifact bundled `ws` through a CommonJS dynamic require. That coordinate must never be overwritten. The bounded repair therefore uses the distinct immutable package version `0.1.0-alpha.2`; Python remains `0.1.0a1`, and Go/Java/.NET remain on their accepted alpha.1-family coordinates.

Two GitHub release-trigger attempts are retained as immutable historical evidence and are never moved or reused. `sdk/npm/v0.1.0-alpha.2` was a candidate tag whose `GITHUB_TOKEN`-originated tag event was correctly suppressed by GitHub recursion protection. `sdk/npm/v0.1.0-alpha.2-release.1` was then created from exact-green main and dispatched to the canonical workflow, but GitHub ended that bot-triggered dispatch as `startup_failure` before any job or registry mutation. The operational repair therefore returns to the repository's previously proven `CI → workflow_run` execution path. The workflow obtains `SOURCE_SHA` and the exact CI run id from the successful main CI event, waits for hosted same-SHA CodeQL to reach success, and only then creates or verifies the immutable `sdk/npm/v0.1.0-alpha.2-release.2` tag before any registry mutation.

This workflow-run fallback does not weaken source binding. The release tag is verified independently against `SOURCE_SHA`; the exact successful main-CI artifact is consumed without rebuilding; npm provenance must bind the package to `inn-media/truyn`, `.github/workflows/publish-sdk-alpha.yml`, `refs/heads/main` and the same git commit. The permanent evidence therefore records both the provenance workflow ref and the distinct immutable release tag relation.

npm Trusted Publishing covers `npm publish`; npm registry-management commands such as dist-tag mutation are a separate authenticated operation. The publish command uses explicit `--tag alpha`, public access and provenance. If the default `latest` tag still points to the superseded alpha.1 package, the narrow existing `sdk-release` credential may advance it to alpha.2; the anti-rollback guard refuses to move either `alpha` or `latest` backward from any other version.

## Package identities

| Ecosystem | Package/module | Current release coordinate |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` (supersedes broken immutable `0.1.0-alpha.1`) |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk:0.1.0-alpha.1` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

## Canonical source/tag rule

Release tags are immutable and may never be moved or reused.

The Go module lives in `sdk/go`, so its accepted VCS tag is:

```text
sdk/go/v0.1.0-alpha.1
```

The npm repair's operational release tag is:

```text
sdk/npm/v0.1.0-alpha.2-release.2
```

The earlier `sdk/npm/v0.1.0-alpha.2` and `sdk/npm/v0.1.0-alpha.2-release.1` refs remain immutable historical setup/failed-trigger evidence. They are not publication tags and are never retargeted.

`release.2` is created by the canonical release workflow only after the triggering main CI is successful and hosted CodeQL for the same source SHA has completed successfully. If the tag already exists, the workflow accepts it only when it resolves to exactly the same `SOURCE_SHA`; any conflicting existing ref fails closed.

## npm publication and repair contract

Target: public package `@truyn/sdk@0.1.0-alpha.2`.

The release operation MUST:

1. be initiated only by successful `CI` completion for a `push` to `main` through `publish-sdk-alpha.yml`;
2. bind `SOURCE_SHA` and the CI run id directly to that successful workflow-run event;
3. require hosted CodeQL success for the same source SHA before creating the operational release tag or touching a registry;
4. create or verify immutable `sdk/npm/v0.1.0-alpha.2-release.2 → SOURCE_SHA` after those green gates;
5. download the exact `truyn-sdk-release-<CI run id>` artifact and verify its manifest against the same source SHA and TypeScript version, rather than rebuilding a separately resolved package graph;
6. publish the exact CI tarball through npm Trusted Publishing/OIDC with `--access public --tag alpha --provenance`, without a long-lived publish token;
7. if the package coordinate already exists, refuse overwrite and require byte-for-byte identity with the selected CI artifact;
8. require the public registry tarball SHA-256, `dist.integrity`, `dist.shasum` and attestation metadata;
9. require `alpha == 0.1.0-alpha.2`, repair `latest` only from absent/alpha.1, and refuse rollback from any newer/different version;
10. clean-room install/import the public package and verify `TruynClient` plus `TruynLocalNodeClient`;
11. run `npm audit signatures --include-attestations` and inspect the SLSA provenance so repository, workflow path, main ref and source git commit match;
12. archive source SHA, immutable release tag, CI run, CodeQL run, publication workflow run, registry hashes, provenance and clean-room evidence.

Long-lived credentials must not be committed. Any narrow credential used only to repair dist-tags remains scoped to `sdk-release` and is removed/revoked after closure.

## PyPI verification-only contract

Target remains `truyn-sdk==0.1.0a1`; the npm repair MUST NOT republish that immutable PyPI coordinate.

The verifier independently downloads and hashes the accepted wheel and sdist, verifies PEP 740 publisher identity/source SHA, and performs a clean-room install from public PyPI. Only entries whose PyPI `packagetype` is `bdist_wheel` or `sdist` participate in the distribution-file-set equality check. Provenance/attestation records are evidence for those distributions and are not themselves treated as distribution files.

Accepted PyPI publisher identity remains:

- project: `truyn-sdk`;
- GitHub owner/repository: `inn-media/truyn`;
- workflow filename: `publish-sdk-alpha.yml`;
- environment: `sdk-release`;
- publication source SHA: the already accepted PyPI publication SHA recorded in the release marker.

## NuGet trusted publishing

Target remains `Truyn.Sdk 0.1.0-alpha.1`. A future public NuGet publication must use the narrow repository/workflow/environment identity supported by nuget.org and must bind public artifacts to an exact accepted source.

## Maven-compatible publication

Target remains `org.truyn:truyn-sdk:0.1.0-alpha.1`. Public Maven Central publication remains subject to its external namespace, account, credential and signing boundaries. Those credentials/signing materials never belong in repository source.

## Go module publication

Go requires no registry write credential. The accepted module path/tag pair is:

```text
github.com/inn-media/truyn/sdk/go
sdk/go/v0.1.0-alpha.1
```

## Release-infrastructure acceptance gate

A release-infrastructure change is accepted only when all applicable conditions are true:

- registry namespace/package ownership is verified;
- publisher identity is bound to `inn-media/truyn` and `publish-sdk-alpha.yml` / `sdk-release`;
- ordinary `ci.yml` contains no registry publication path;
- `workflow_run` accepts only successful push CI from `main` in this repository;
- `pull_request_target` and generic manual publication are absent;
- permissions are limited to Actions read, OIDC and the temporary contents write needed to create the immutable release tag;
- registry writes consume the exact successful CI artifact bound to the accepted source SHA;
- hosted same-SHA CodeQL is green before tag creation/publication;
- public registry bytes, installability, signatures and provenance are verified after publication;
- PyPI distribution-file verification excludes attestation records from the distribution set;
- temporary release workflow content/markers/tests are removed after permanent release evidence is committed.

## Release evidence

Permanent closure evidence records at minimum:

- exact merged source SHA;
- immutable native release tag and its target SHA;
- package name/version and byte size;
- selected CI run proving five-language conformance/package verification;
- hosted CodeQL run for the same source;
- publication/verification workflow run and protected environment;
- registry tarball SHA-256 plus `dist.integrity` and `dist.shasum`;
- decoded npm provenance statement and signature-audit result;
- `alpha`/`latest` identities;
- public clean-room install/import result;
- PyPI wheel/sdist hashes, sizes, PEP 740 verification and clean-room result;
- confirmation that no credential/private key/`.env`/repository internals are present in distributions.

`publicDistribution` becomes true only after the public native coordinate and its bytes/provenance are independently observed and bound back to this evidence.
