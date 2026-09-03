# TRUYN SDK publication contract

**Release line:** `0.1.0-alpha.1` (`0.1.0a1` on PyPI)  
**Canonical repository:** `inn-media/truyn`  
**Publication workflow:** `.github/workflows/publish-sdk-alpha.yml` / workflow filename `publish-sdk-alpha.yml`  
**Protected publication environment:** `sdk-release`  
**Canonical release tag:** `sdk/go/v0.1.0-alpha.1`  
**Protocol status:** `TRUYN/1` draft

The repository-side release pipeline is implemented. Native registry publication remains accepted only when the external registry identities/ownership described below are configured and the immutable tag-triggered workflow completes successfully.

A release is publishable only from an exact accepted commit for which ordinary CI, DCO, CodeQL/security, five-language executable conformance and `sdk/release/build-release.sh` are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

The publication workflow is intentionally isolated from ordinary `ci.yml` and has no `workflow_dispatch`, `pull_request` or `pull_request_target` entrypoint. It is triggered only by the exact immutable tag `sdk/go/v0.1.0-alpha.1`. The build job re-runs five-language executable conformance, rebuilds the consumer distributions, verifies `sdk/release/dist/manifest.json` against the exact Git SHA and uploads the exact release bundle. Native publisher jobs consume that accepted source/bundle and are bound to the `sdk-release` GitHub Environment.

## Package identities

| Ecosystem | Package/module | Version | Publication mechanism |
|---|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.1` | GitHub OIDC trusted publishing |
| PyPI | `truyn-sdk` | `0.1.0a1` | PyPI Trusted Publisher / GitHub OIDC |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` | immutable VCS subdirectory tag |
| Maven Central | `org.truyn:truyn-sdk` | `0.1.0-alpha.1` | Central Publisher Portal token + PGP signatures |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` | nuget.org Trusted Publishing / GitHub OIDC |

## Canonical source/tag rule

The Go module lives in the `sdk/go` subdirectory, therefore the one release tag for this alpha is:

```text
sdk/go/v0.1.0-alpha.1
```

The tag MUST point to the exact release commit after the release-infrastructure PR has passed DCO, ordinary CI and CodeQL/security. Never move or reuse the tag. Never overwrite or rebuild a native registry version from a different source SHA.

`publish-sdk-alpha.yml` verifies both `GITHUB_REF` and `git rev-parse HEAD` before any release package is built. Go publication is represented by the same immutable subdirectory tag, while the other four ecosystems publish from that exact tagged source.

## npm trusted publishing

Target: public package `@truyn/sdk` on npm.

External ownership bootstrap required once:

1. The npm `@truyn` scope must be owned by the TRUYN release owner.
2. If `@truyn/sdk` does not yet exist, establish package ownership using npm's supported first-publication/bootstrap path.
3. Configure the package trusted publisher for:
   - repository owner: `inn-media`
   - repository: `truyn`
   - workflow filename: `publish-sdk-alpha.yml`
   - environment: `sdk-release`
4. After trusted publishing is proven, do not retain a long-lived npm publishing token for this workflow.

The workflow uses Node 24, requires npm >= 11.5, requests `id-token: write`, and publishes the verified tarball with `--access public --provenance`. The package repository URL must continue to resolve to `https://github.com/inn-media/truyn.git`.

## PyPI trusted publishing

Target: `truyn-sdk` on PyPI.

PyPI can use a pending Trusted Publisher before the project exists. Configure once with:

- PyPI project: `truyn-sdk`
- GitHub owner: `inn-media`
- repository: `truyn`
- workflow filename: `publish-sdk-alpha.yml`
- environment: `sdk-release`

The workflow publishes the exact verified wheel/sdist through `pypa/gh-action-pypi-publish@release/v1` with GitHub OIDC and attestations. No PyPI API token is stored in the repository workflow.

## NuGet trusted publishing

Target: `Truyn.Sdk` on nuget.org.

Configure a nuget.org Trusted Publishing policy once with:

- repository owner: `inn-media`
- repository: `truyn`
- workflow file: `publish-sdk-alpha.yml`
- environment: `sdk-release`
- nuget.org user/profile name available to the workflow as `NUGET_USER`

The workflow requests GitHub OIDC, exchanges it using `NuGet/login@v1` for a temporary API key, and pushes the exact `.nupkg`. It intentionally does not use `--skip-duplicate`: an immutable-version conflict is a release failure, not a successful retry.

## Maven Central publication

Target coordinates: `org.truyn:truyn-sdk:0.1.0-alpha.1`.

Maven Central currently requires its external Central Publisher Portal account boundary. Before the tag is created:

1. verify/own the `org.truyn` namespace in Central;
2. generate a Central Publisher Portal user token;
3. configure the protected `sdk-release` environment with:
   - `MAVEN_CENTRAL_USERNAME`
   - `MAVEN_CENTRAL_TOKEN`
   - `MAVEN_GPG_PRIVATE_KEY`
   - `MAVEN_GPG_PASSPHRASE`
4. ensure the public signing key is distributed so consumers can verify PGP signatures.

The Java POM includes sources, Javadoc, PGP signing and the Central publishing plugin. The workflow imports the release key only inside the isolated publication job and executes the `central-release` Maven profile. Credentials/signing material are never committed to source or release bundles.

A Maven release is accepted only after Central resolves the exact coordinates and the published binary/source/Javadoc/POM artifacts correspond to the accepted source/version.

## Go module publication

Go requires no registry write credential. Public publication is the immutable Git tag:

```text
sdk/go/v0.1.0-alpha.1
```

The module path in `sdk/go/go.mod` is `github.com/inn-media/truyn/sdk/go`. The publication workflow rechecks that coordinate and runs Go tests on the tagged source. Normal Go tooling/proxies can then resolve the module from the public repository/tag.

## GitHub Environment gate

All registry-write jobs use the `sdk-release` GitHub Environment. Repository administrators should configure environment protection before creating the release tag, including required reviewers where appropriate. External trusted-publisher policies should include the same environment name wherever supported.

The environment boundary does not turn transport authentication into TRUYN authority and does not affect runtime/provider authorization. It exists only to protect software release publication.

## Release-infrastructure acceptance gate

The release-infrastructure PR is accepted only when all repository-side predicates are true:

- `.github/workflows/publish-sdk-alpha.yml` is the only native registry publication workflow;
- ordinary `ci.yml` contains no registry publication path;
- publication is exact-tag-only and cannot be invoked through `workflow_dispatch`, `pull_request` or `pull_request_target`;
- the build is bound to exact `GITHUB_SHA` and verifies the release manifest before registry writes;
- npm/PyPI/NuGet use OIDC rather than long-lived publish tokens;
- Maven Central secrets are referenced only inside the protected publication job;
- `sdk-release` gates all registry-write jobs;
- DCO, ordinary CI and CodeQL/security are green on the exact release-infrastructure PR head;
- developer-site deployment remains a separate Pages workflow and cannot gain registry publication authority.

The external publication acceptance predicates are separate and cannot be faked by repository source:

- npm scope/package ownership and trusted publisher configured;
- PyPI pending/existing Trusted Publisher configured;
- NuGet trusted publishing policy and `NUGET_USER` configured;
- Maven Central `org.truyn` namespace, token and PGP signing identity configured;
- `sdk-release` environment protections configured;
- immutable `sdk/go/v0.1.0-alpha.1` tag created on the exact accepted release commit;
- tag-triggered workflow succeeds;
- all five native coordinates resolve publicly and match the accepted release evidence.

## Release evidence

For every language record:

- exact merged/tagged source SHA;
- native package name/version;
- package byte size;
- SHA-256 from `sdk/release/dist/manifest.json`;
- registry/version URL or Go VCS tag;
- CI run proving five-language conformance and package verification;
- CodeQL/security result for the same release source;
- tag-triggered publication workflow run;
- protected environment identity for registry jobs;
- confirmation that credentials/private keys/`.env`/private topology are absent from distributions.

`publicDistribution` may become `true` only after the native public location has been observed and the published version has been bound back to this accepted release evidence.
