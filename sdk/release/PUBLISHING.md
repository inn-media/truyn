# TRUYN SDK publication contract

**Release family:** npm `0.1.0-alpha.2` repair; PyPI `0.1.0a1`; Go/Java/.NET `0.1.0-alpha.1`  
**Canonical repository:** `inn-media/truyn`  
**npm Trusted Publisher workflow identity:** `.github/workflows/publish-sdk-alpha.yml` / workflow filename `publish-sdk-alpha.yml`  
**Protected GitHub Environment:** `sdk-release`  
**Protocol status:** `TRUYN/1` draft

A release is publishable only from an exact merged commit for which ordinary CI, DCO, CodeQL/security, five-language executable conformance and `sdk/release/build-release.sh` are green. GitHub Actions artifacts are evidence/build outputs, not substitutes for native package registries.

The initial npm/PyPI bootstrap publication infrastructure has already been exercised. npm `@truyn/sdk@0.1.0-alpha.1` is immutable, but clean-room Node 22 ESM import later proved that artifact unusable because `ws` had been bundled through a CommonJS dynamic require. That coordinate must never be overwritten. The bounded npm repair therefore uses the new immutable version `0.1.0-alpha.2`; Python remains `0.1.0a1`, and the Go/Java/.NET alpha coordinates remain unchanged.

The configured npm Trusted Publisher identity remains `publish-sdk-alpha.yml`. For the bounded alpha.2 repair, that workflow is temporarily reduced to one immutable tag-only operation on `sdk/npm/v0.1.0-alpha.2`: it consumes the exact package artifact uploaded by successful ordinary main CI for the same source SHA, requires hosted CodeQL success on that same SHA, publishes through OIDC without a long-lived publish token, and verifies immutable registry evidence. The superseded `go-sdk-alpha-release.yml` filename contains no publication path and is removed by the post-evidence cleanup PR. Ordinary `ci.yml` remains non-publishing.

npm Trusted Publishing covers `npm publish`; npm registry-management commands such as dist-tag mutation are a separate authenticated operation. The repair publish therefore uses the default `latest` tag through Trusted Publishing, while the additional `alpha` tag is repaired only through the narrow existing environment credential if it is not already correct. That credential is not used as the publishing identity and is removed/revoked when no longer needed.

## Package identities

| Ecosystem | Package/module | Current release coordinate |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` (supersedes broken immutable `0.1.0-alpha.1`) |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

## Canonical source/tag rule

Release tags are immutable and may never be moved or reused.

The Go module lives in the `sdk/go` subdirectory, so its accepted VCS release tag is:

```text
sdk/go/v0.1.0-alpha.1
```

The npm packaging repair uses the one-shot release tag:

```text
sdk/npm/v0.1.0-alpha.2
```

The npm tag may be created only after the exact merged source SHA has successful ordinary main CI and hosted CodeQL. The Trusted Publisher workflow must prove that the tag resolves to that exact SHA before any registry mutation.

## npm publication and repair contract

Target: public package `@truyn/sdk` on npm.

The npm organization/scope `truyn` exists and the bootstrap publication boundary has already been exercised. The immutable `0.1.0-alpha.1` package must remain historical evidence; it is not a repair target.

For `0.1.0-alpha.2` the release operation MUST:

1. run only from the immutable `sdk/npm/v0.1.0-alpha.2` tag through `publish-sdk-alpha.yml`;
2. require successful ordinary main CI and hosted CodeQL for the exact tagged SHA;
3. download the exact `truyn-sdk-release-<CI run id>` artifact from that successful CI run rather than rebuilding an independently resolved npm dependency graph;
4. verify `sdk/release/dist/manifest.json` against the tagged SHA and TypeScript version before publication;
5. publish the exact CI tarball through npm Trusted Publishing / OIDC with public access and provenance, without requiring a long-lived publishing token;
6. verify the registry tarball byte-for-byte against that CI artifact;
7. require both `alpha` and the default `latest` dist-tags to resolve to the repaired version so tagged and unqualified installation do not continue resolving to broken alpha.1;
8. clean-room install/import the public package;
9. run npm signature/provenance verification and inspect the attestation statement so repository, workflow path, immutable tag ref and source git commit all match the expected release identity;
10. archive the tarball, hashes, decoded provenance statement and structured release evidence.

Long-lived credentials must not be committed to the repository. Any narrow bootstrap credential used only for dist-tag repair remains scoped to the protected `sdk-release` environment and should be removed/revoked after closure.

## PyPI trusted publishing

Target: `truyn-sdk==0.1.0a1` on PyPI.

The accepted publication uses GitHub OIDC / PyPI Trusted Publishing bound to:

- PyPI project: `truyn-sdk`
- GitHub owner: `inn-media`
- repository: `truyn`
- workflow filename: `publish-sdk-alpha.yml`
- environment: `sdk-release`

The npm alpha.2 repair MUST NOT republish the immutable PyPI coordinate. It independently re-verifies the already-published wheel and sdist hashes/bytes, PEP 740 publisher identity and exact publication source SHA, records each artifact byte size, and performs a clean-room install from public PyPI.

## NuGet trusted publishing

Target: `Truyn.Sdk` on nuget.org.

Configure a nuget.org Trusted Publishing policy with the narrow repository/workflow/environment identity when public NuGet publication is performed. No long-lived NuGet API key belongs in repository source. A NuGet release is accepted only when registry bytes and provenance are bound to an exact accepted source.

## Maven-compatible publication

Target coordinates remain `org.truyn:truyn-sdk:0.1.0-alpha.1`.

The release bundle contains the binary JAR, sources JAR, Javadoc JAR and POM. A public Maven Central publication additionally requires the external Central account boundary: ownership/verification of the `org.truyn` namespace, publisher credentials/token and signing material required by Central. Those credentials/signing materials are intentionally not committed to the repository and must be scoped to the protected `sdk-release` environment or the narrowest supported external publisher boundary.

A Maven publish is accepted only when the registry resolves the exact coordinates and the published artifacts match the release manifest digests/signatures.

## Go module publication

Go requires no registry write credential. The accepted module tag is:

```text
sdk/go/v0.1.0-alpha.1
```

The module path in `sdk/go/go.mod` is `github.com/inn-media/truyn/sdk/go`; the subdirectory tag is therefore the native release coordinate used by Go tooling/proxies.

## Release-infrastructure acceptance gate

A release-infrastructure change is accepted only when all applicable conditions are true:

- registry namespace/package ownership is verified for the target ecosystem;
- publisher identity is bound to `inn-media/truyn` and the narrow release workflow/environment boundary supported by that registry;
- ordinary `ci.yml` contains no registry publication path;
- publication is immutable tag-only and cannot be invoked through `workflow_dispatch` or `pull_request_target`;
- permissions are least-privileged;
- registry writes consume the exact successful CI artifact or another reviewed immutable artifact bound to the exact accepted source SHA;
- the protected `sdk-release` environment gates registry publication;
- exact-source CI and hosted CodeQL are green before publication;
- public registry bytes, installability and provenance are verified after publication;
- temporary one-shot release workflow content/markers/tests are removed after evidence acceptance.

## Release evidence

For every language, keep or record:

- exact merged source SHA;
- native package name/version;
- package byte size;
- SHA-256 from the accepted release artifact/manifest;
- registry/version URL or Go VCS tag;
- CI run proving five-language conformance and package verification;
- CodeQL/security result for the same accepted source;
- publication/verification workflow run and protected environment identity where applicable;
- provenance/attestation identity for registries that support it;
- clean-room install/import result;
- no credentials/private keys/`.env`/repository internals inside distributions.

`publicDistribution` may become true only for a package whose native public location has been observed and whose bytes/version are bound back to the accepted release evidence.
