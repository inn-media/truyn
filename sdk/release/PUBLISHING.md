# TRUYN SDK publication contract

**Release line:** `0.1.0-alpha.1` (`0.1.0a1` on PyPI)  
**Canonical repository:** `inn-media/truyn`  
**Planned publication workflow identity:** `.github/workflows/publish-sdk-alpha.yml` / workflow filename `publish-sdk-alpha.yml`  
**Planned protected GitHub Environment:** `sdk-release`  
**Protocol status:** `TRUYN/1` draft

A release is publishable only from an exact merged commit for which ordinary CI, DCO, CodeQL/security, five-language executable conformance and `sdk/release/build-release.sh` are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

The publication workflow is intentionally **not present in this developer-release PR**. Registry ownership and trusted-publishing identities MUST be bootstrapped first. After that bootstrap, a separate security-reviewed release-infrastructure PR may add exactly one public workflow named `publish-sdk-alpha.yml`, explicitly permit only that filename in the public-workflow guard, and bind publication to the protected `sdk-release` environment and an immutable release tag. Ordinary `ci.yml` MUST remain non-publishing.

## Package identities

| Ecosystem | Package/module | Version |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.1` |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

## Canonical source/tag rule

The Go module lives in the `sdk/go` subdirectory, so its VCS release tag is:

```text
sdk/go/v0.1.0-alpha.1
```

The tag MUST point to the exact accepted release commit after the release-infrastructure gate is green. Never move or reuse a release tag and never overwrite a native registry version.

## npm trusted publishing

Target: public package `@truyn/sdk` on npm.

One-time account/ownership bootstrap outside this repository:

1. The npm organization/scope `truyn` must exist and the release owner must have publish permission.
2. If `@truyn/sdk` does not yet exist, create the first public package version through an npm owner-authorized bootstrap publication (`--access public`); npm trusted-publisher configuration is package-scoped and cannot establish ownership of a namespace by itself.
3. After the package exists, configure GitHub Actions trusted publishing for:
   - repository owner: `inn-media`
   - repository: `truyn`
   - workflow filename: `publish-sdk-alpha.yml`
   - environment: `sdk-release`
4. After the trusted publisher is proven, disallow long-lived publishing tokens for the package.

GitHub publication MUST use a hosted runner, a currently supported Node/npm pair that satisfies npm trusted-publishing requirements, request only the permissions required by the publishing mechanism (including `id-token: write` where OIDC is used), and run `npm publish --access public` from the verified package tree. The package `repository.url` must continue to identify `https://github.com/inn-media/truyn.git`.

## PyPI trusted publishing

Target: `truyn-sdk` on PyPI.

PyPI supports a pending trusted publisher before the project exists. Configure once on PyPI with:

- PyPI project: `truyn-sdk`
- GitHub owner: `inn-media`
- repository: `truyn`
- workflow filename: `publish-sdk-alpha.yml`
- environment: `sdk-release`

Publication then uses GitHub OIDC (`id-token: write`) and `pypa/gh-action-pypi-publish` against the exact wheel/sdist produced by the release build.

## NuGet trusted publishing

Target: `Truyn.Sdk` on nuget.org.

Configure a nuget.org Trusted Publishing policy once with:

- repository owner: `inn-media`
- repository: `truyn`
- workflow file: `publish-sdk-alpha.yml`
- environment: `sdk-release`

The publishing job requests the OIDC permission required by NuGet Trusted Publishing, exchanges the GitHub identity through the supported NuGet login action, and pushes the exact `.nupkg` from the verified release bundle using the returned short-lived credential. No long-lived NuGet API key belongs in repository secrets.

## Maven-compatible publication

Target coordinates: `org.truyn:truyn-sdk:0.1.0-alpha.1`.

The release bundle contains the binary JAR, sources JAR, Javadoc JAR and POM. A public Maven Central publication additionally requires the external Central account boundary: ownership/verification of the `org.truyn` namespace, publisher credentials/token and signing material required by Central. Those credentials/signing materials are intentionally not committed to the repository and must be scoped to the protected `sdk-release` environment or the narrowest supported external publisher boundary.

A Maven publish is accepted only when the registry resolves the exact coordinates and the published artifacts match the release manifest digests/signatures.

## Go module publication

Go requires no registry write credential. Once the exact release commit is accepted, create the immutable tag:

```text
sdk/go/v0.1.0-alpha.1
```

The module path in `sdk/go/go.mod` is `github.com/inn-media/truyn/sdk/go`; the subdirectory tag is therefore the native release coordinate used by Go tooling/proxies.

## Release-infrastructure acceptance gate

The later release-infrastructure PR is accepted only when all of the following are true:

- registry namespace/package ownership is verified for npm, PyPI, NuGet and Maven Central;
- trusted-publishing/publisher identities are bound to `inn-media/truyn`, `publish-sdk-alpha.yml` and `sdk-release` where the registry supports that binding;
- exactly one new public workflow, `publish-sdk-alpha.yml`, is added and exactly that filename is explicitly allowed by the public-workflow guard (no wildcard);
- ordinary `ci.yml` contains no registry publication path;
- the publication workflow is tag-only and cannot be invoked through `workflow_dispatch` or `pull_request_target`;
- permissions are least-privileged, with `contents: read` and `id-token: write` only for jobs that actually need OIDC;
- the workflow consumes or rebuilds a release bundle bound to the exact accepted source SHA and verifies its manifest before registry writes;
- the protected `sdk-release` environment gates registry publication;
- DCO, ordinary CI and CodeQL/security are green on the exact release-infrastructure PR head.

## Release evidence

For every language, keep or record:

- exact merged source SHA;
- native package name/version;
- package byte size;
- SHA-256 from `sdk/release/dist/manifest.json`;
- registry/version URL or Go VCS tag;
- CI run proving five-language conformance and package verification;
- CodeQL/security result for the same PR/release source;
- publication workflow run and protected environment identity once publication is enabled;
- no credentials/private keys/`.env`/repository internals inside distributions.

`publicDistribution` may become true only for a package whose native public location has been observed and whose bytes/version are bound back to the accepted release evidence.
