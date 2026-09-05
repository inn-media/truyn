# TRUYN SDK publication contract

**Release family:** npm `0.1.0-alpha.2` repair; PyPI `0.1.0a1`; Go/Java/.NET `0.1.0-alpha.1`  
**Canonical repository:** `inn-media/truyn`  
**npm Trusted Publisher workflow identity:** `.github/workflows/publish-sdk-alpha.yml` / workflow filename `publish-sdk-alpha.yml`  
**Protected GitHub Environment:** `sdk-release`  
**Protocol status:** `TRUYN/1` draft

A release is publishable only from an exact merged main commit whose ordinary CI, hosted CodeQL/security, five-language executable conformance and release-package verification are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

npm `@truyn/sdk@0.1.0-alpha.1` is public and immutable, but clean-room Node 22 ESM import later proved it unusable because `ws` had been bundled through a CommonJS dynamic require. That coordinate is never overwritten. The repair therefore uses package version `0.1.0-alpha.2`; Python remains `0.1.0a1`, and Go/Java/.NET remain on their accepted alpha.1-family coordinates.

## Immutable release-attempt history

Release refs are immutable and are never moved, deleted or reused:

- `sdk/npm/v0.1.0-alpha.2` — initial alpha.2 candidate. Its tag event was created by Actions with `GITHUB_TOKEN`, so GitHub recursion protection correctly did not launch the downstream publish workflow.
- `sdk/npm/v0.1.0-alpha.2-release.1` — exact-green operational attempt. Bot-triggered `workflow_dispatch` reached GitHub but ended as `startup_failure` before any job or registry mutation.
- `sdk/npm/v0.1.0-alpha.2-release.2` — exact-green source `ac6a74ba7d2a63150fd257cf285772d37400ed6c`. Canonical `CI → workflow_run` execution succeeded through source/CI/CodeQL/tag/artifact validation and reached the real npm PUT. The local CI tarball SHA-256 was `e70e1d726511c0cd3454d7bafdc1245c00c7eeda0afe7e51781e98160e2144d7`. npm generated a GitHub provenance statement and transparency-log entry, but the registry PUT returned E404 before `0.1.0-alpha.2` was created.

Read-only protected-environment diagnostics confirmed that npm user `truyn` is a read-write collaborator on the public `@truyn/sdk` package and that public `0.1.0-alpha.1` remains the only version. The automation token intentionally cannot read or modify the package Trusted Publisher configuration (`npm trust list` is E403), so repository automation cannot repair npm account trust policy directly.

The release.2 publish log also exposed `NPM_CONFIG_USERCONFIG` created by `actions/setup-node` and the placeholder `NODE_AUTH_TOKEN`. This matches the known npm/setup-node Trusted Publishing failure mode where the generated `_authToken=${NODE_AUTH_TOKEN}` entry can prevent npm from entering OIDC authentication and surface a misleading E404. The `release.3` repair therefore keeps Trusted Publishing and removes only `_authToken` from the temporary npmrc before `npm publish`, then requires GitHub's OIDC request variables to be present. The actual publish step contains no long-lived npm token.

## Package identities

| Ecosystem | Package/module | Current release coordinate |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` repair candidate; `0.1.0-alpha.1` is public/immutable/superseded |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk:0.1.0-alpha.1` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

## Canonical source/tag rule

The Go module tag remains:

```text
sdk/go/v0.1.0-alpha.1
```

The next npm operational release tag is:

```text
sdk/npm/v0.1.0-alpha.2-release.3
```

`release.3` is created by the canonical release workflow only after the triggering main CI is successful and hosted CodeQL for the same source SHA is successful. If that tag already exists, the workflow accepts it only when it resolves to exactly the same source SHA; otherwise it fails closed.

## npm publication and verification contract

Target: public package `@truyn/sdk@0.1.0-alpha.2`.

The release operation MUST:

1. be initiated only by successful `CI` completion for a push to `main` through `publish-sdk-alpha.yml`;
2. bind source SHA and exact CI run id directly to that `workflow_run` event;
3. require hosted CodeQL success for the same source before release-tag creation or registry mutation;
4. create/verify immutable `sdk/npm/v0.1.0-alpha.2-release.3 → source SHA` after the green gates;
5. download the exact successful `truyn-sdk-release-<CI run id>` artifact and verify its manifest instead of rebuilding a separately resolved package graph;
6. configure Node/npm, remove the temporary setup-node `_authToken` entry, require GitHub OIDC request variables, and keep the publish step token-free;
7. publish the exact CI tarball through npm Trusted Publishing using `--access public --tag alpha --provenance`;
8. if `0.1.0-alpha.2` already exists, refuse overwrite and require byte-for-byte identity with the selected CI artifact;
9. require public SHA-256, `dist.integrity`, `dist.shasum` and attestation metadata;
10. require `alpha == 0.1.0-alpha.2`; repair `latest` only from absent/alpha.1 and refuse rollback from any other version;
11. clean-room install/import the public package and verify `TruynClient` plus `TruynLocalNodeClient`;
12. run `npm audit signatures --include-attestations`, decode provenance, and require repository `inn-media/truyn`, workflow `publish-sdk-alpha.yml`, ref `refs/heads/main`, and exact git commit;
13. archive source SHA, immutable release tag, CI run, CodeQL run, publication run, registry hashes, provenance and clean-room evidence.

The protected `sdk-release` token is used only for post-publication npm operations that OIDC does not support, such as dist-tag repair. It is not available to the `npm publish` step and is removed/revoked from the release path after closure.

## PyPI verification-only contract

Target remains `truyn-sdk==0.1.0a1`; the npm repair never republishes that immutable PyPI coordinate.

The verifier downloads and hashes the accepted wheel and sdist, validates PEP 740 publisher identity/source SHA, and performs a clean-room install from public PyPI. Only entries whose PyPI `packagetype` is `bdist_wheel` or `sdist` participate in distribution-file-set equality. Provenance/attestation records are evidence for distributions and are not themselves distribution files.

Accepted publisher identity remains GitHub owner/repository `inn-media/truyn`, workflow `publish-sdk-alpha.yml`, environment `sdk-release`, and the already recorded PyPI publication source SHA.

## Release-infrastructure acceptance gate

A release-infrastructure change is accepted only when all applicable conditions are true:

- ordinary `ci.yml` contains no registry publication path;
- `workflow_run` accepts only successful push CI from `main` in this repository;
- `pull_request_target` and generic manual publication are absent;
- OIDC `id-token: write` is enabled only on the bounded release workflow;
- setup-node token-placeholder configuration is removed before Trusted Publishing and the publish step itself has no `NODE_AUTH_TOKEN`;
- registry writes consume the exact successful CI artifact bound to the accepted source;
- hosted same-source CodeQL is green before release-tag creation/publication;
- public registry bytes, tags, installability, signatures and provenance are verified after publication;
- PyPI distribution-file verification excludes attestation records from the distribution set;
- temporary release workflow content/markers/tests are removed after permanent release evidence is committed.

## Permanent release evidence

Closure evidence records at minimum:

- exact merged source SHA;
- immutable native release tag and target SHA;
- package version, byte size and SHA-256;
- selected CI run and hosted CodeQL run for the same source;
- publication/verification workflow run and protected environment;
- registry `dist.integrity`, `dist.shasum`, alpha/latest identities;
- decoded npm provenance statement and signature-audit result;
- public clean-room install/import result;
- PyPI wheel/sdist hashes, sizes, PEP 740 verification and clean-room result;
- confirmation that no credentials/private keys/`.env`/repository internals are present in distributions.

`publicDistribution` becomes true only after the public native coordinate and its bytes/provenance are independently observed and bound back to this evidence.
