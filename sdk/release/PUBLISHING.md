# TRUYN SDK publication contract

**Release line:** `0.1.0-alpha.1` (`0.1.0a1` on PyPI)  
**Canonical repository:** `inn-media/truyn`  
**Canonical GitHub Actions workflow identity:** `.github/workflows/ci.yml` / workflow filename `ci.yml`  
**Protocol status:** `TRUYN/1` draft

A release is publishable only from an exact merged commit for which ordinary CI, DCO, CodeQL/security, five-language executable conformance and `sdk/release/build-release.sh` are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

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

The tag MUST point to the exact merged release commit. Never move or reuse a release tag and never overwrite a native registry version.

## npm trusted publishing

Target: public package `@truyn/sdk` on npm.

One-time account/ownership bootstrap outside this repository:

1. The npm organization/scope `truyn` must exist and the release owner must have publish permission.
2. If `@truyn/sdk` does not yet exist, create the first public package version through an npm owner-authorized publication (`--access public`); npm trusted-publisher configuration is package-scoped and cannot establish ownership of a namespace by itself.
3. In the package settings, configure GitHub Actions trusted publishing for:
   - repository owner: `inn-media`
   - repository: `truyn`
   - workflow filename: `ci.yml`
   - allowed action: `npm publish`
4. After the trusted publisher is proven, disallow long-lived publishing tokens for the package.

GitHub publication MUST use a hosted runner, Node >=22.14 and npm >=11.5.1, request `id-token: write`, and run `npm publish --access public` from the verified package tree. The package `repository.url` must continue to identify `https://github.com/inn-media/truyn.git`.

## PyPI trusted publishing

Target: `truyn-sdk` on PyPI.

PyPI supports a pending trusted publisher before the project exists. Configure once on PyPI with:

- PyPI project: `truyn-sdk`
- GitHub owner: `inn-media`
- repository: `truyn`
- workflow filename: `ci.yml`
- optional environment: `release` if the GitHub environment is also configured and protected

Publication then uses GitHub OIDC (`id-token: write`) and `pypa/gh-action-pypi-publish` against the exact wheel/sdist produced by the release build.

## NuGet trusted publishing

Target: `Truyn.Sdk` on nuget.org.

Configure a nuget.org Trusted Publishing policy once with:

- repository owner: `inn-media`
- repository: `truyn`
- workflow file: `ci.yml`
- optional environment: `release`

The GitHub job requests `id-token: write`, exchanges the GitHub OIDC identity through `NuGet/login`, and pushes the exact `.nupkg` from the verified release bundle using the returned short-lived API key. No long-lived NuGet API key belongs in repository secrets.

## Maven-compatible publication

Target coordinates: `org.truyn:truyn-sdk:0.1.0-alpha.1`.

The release bundle contains the binary JAR, sources JAR, Javadoc JAR and POM. A public Maven Central publication additionally requires the external Sonatype/Central account boundary: ownership/verification of the `org.truyn` namespace, publisher credentials/token and signing material required by Central. These credentials are intentionally not committed to the repository and are not represented by TRUYN runtime/provider secrets.

A Maven publish is accepted only when the registry resolves the exact coordinates and the published artifacts match the release manifest digests/signatures.

## Go module publication

Go requires no registry write credential. Once the exact merged release commit is accepted, create the immutable tag:

```text
sdk/go/v0.1.0-alpha.1
```

The module path in `sdk/go/go.mod` is `github.com/inn-media/truyn/sdk/go`; the subdirectory tag is therefore the native release coordinate used by Go tooling/proxies.

## Release evidence

For every language, keep or record:

- exact merged source SHA;
- native package name/version;
- package byte size;
- SHA-256 from `sdk/release/dist/manifest.json`;
- registry/version URL or Go VCS tag;
- CI run proving five-language conformance and package verification;
- CodeQL/security result for the same PR/release source;
- no credentials/private keys/`.env`/repository internals inside distributions.

`publicDistribution` may become true only for a package whose native public location has been observed and whose bytes/version are bound back to the accepted release evidence.
