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

- `sdk/npm/v0.1.0-alpha.2` — initial alpha.2 candidate; its Actions-created tag did not recursively trigger publication.
- `sdk/npm/v0.1.0-alpha.2-release.1` — immutable failed trigger attempt.
- `sdk/npm/v0.1.0-alpha.2-release.2` — reached the real npm PUT from exact-green source and produced signed provenance, but npm returned E404 before alpha.2 was created. Exact CI tarball SHA-256 was `e70e1d726511c0cd3454d7bafdc1245c00c7eeda0afe7e51781e98160e2144d7`.
- `sdk/npm/v0.1.0-alpha.2-release.3` — immutable failed OIDC-boundary attempt.
- `sdk/npm/v0.1.0-alpha.2-release.4` — immutable failed token-environment attempt; never move or reuse it.

The next bounded attempt is `sdk/npm/v0.1.0-alpha.2-release.5`. It preserves all exact-source, byte, signature, provenance and PyPI PEP 740 evidence gates while removing setup-node registry-token injection from the Trusted Publishing subprocess.

## Package identities

| Ecosystem | Package/module | Current release coordinate |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` repair candidate; `0.1.0-alpha.1` is public/immutable/superseded |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk:0.1.0-alpha.1` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

## Canonical source/tag rule

The Go module tag remains `sdk/go/v0.1.0-alpha.1`.

The npm operational release tag for the next attempt is:

```text
sdk/npm/v0.1.0-alpha.2-release.5
```

The tag is created by the canonical release workflow only after successful main CI and hosted CodeQL for the same source SHA. If it already exists, it is accepted only when it resolves to exactly that source SHA; otherwise the workflow fails closed.

## npm publication and verification contract

Target: public package `@truyn/sdk@0.1.0-alpha.2`.

The release operation MUST:

1. be initiated only by successful `CI` completion for a push to `main` through `publish-sdk-alpha.yml`;
2. bind source SHA and exact CI run id directly to that `workflow_run` event;
3. require hosted CodeQL success for the same source before release-tag creation or registry mutation;
4. create/verify immutable `sdk/npm/v0.1.0-alpha.2-release.5 → source SHA` after the green gates;
5. consume the exact successful CI artifact and verify its manifest instead of rebuilding a separately resolved package graph;
6. use npm Trusted Publishing with GitHub OIDC, no setup-node `registry-url`, an empty inherited `NODE_AUTH_TOKEN`, and a publish subprocess stripped of `NODE_AUTH_TOKEN`, `NPM_TOKEN`, and `NPM_CONFIG_TOKEN`;
7. publish with `--access public --tag alpha --provenance`;
8. refuse overwrite if `0.1.0-alpha.2` already exists unless registry bytes are byte-for-byte identical to the selected CI artifact;
9. verify SHA-256, `dist.integrity`, `dist.shasum`, attestation metadata, `alpha` and `latest` identities;
10. refuse dist-tag rollback from any version except the explicitly superseded alpha.1;
11. clean-room install/import the public package and verify `TruynClient` plus `TruynLocalNodeClient`;
12. run `npm audit signatures --include-attestations`, decode provenance, and require repository `inn-media/truyn`, workflow `publish-sdk-alpha.yml`, ref `refs/heads/main`, and the exact git commit;
13. archive source SHA, immutable release tag, CI run, CodeQL run, registry hashes, provenance and clean-room evidence.

The protected `sdk-release` token is permitted only for post-publication dist-tag repair when needed; it is not used by the npm publish subprocess.

## PyPI verification-only contract

Target remains `truyn-sdk==0.1.0a1`; the npm repair never republishes that immutable PyPI coordinate.

The verifier must download and hash only `bdist_wheel` and `sdist` distributions, verify the accepted wheel/sdist hashes, validate PEP 740 publisher identity and source SHA through PyPI provenance and `pypi-attestations`, and perform a clean-room install. Attestation/provenance records are evidence and are not counted as distribution files.

Accepted PyPI publication source SHA remains `fda6b75fda5331dd9cdc7e642f7a0a5556749a64`.

## Release-infrastructure acceptance gate

A release-infrastructure change is accepted only when all applicable conditions are true:

- ordinary `ci.yml` contains no registry publication path;
- `workflow_run` accepts only successful push CI from `main` in this repository;
- `pull_request_target` and generic manual publication are absent;
- OIDC `id-token: write` is enabled only on the bounded release workflow;
- npm publication is token-free and consumes the exact successful CI artifact;
- hosted same-source CodeQL is green before release-tag creation/publication;
- public registry bytes, tags, installability, signatures and provenance are verified after publication;
- PyPI verification retains exact file hashes, PEP 740 publisher/source identity and clean-room evidence;
- temporary one-shot release machinery is removed after permanent evidence is committed.

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
