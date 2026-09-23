# TRUYN SDK publication contract

**Status:** npm/PyPI alpha registry closure completed on 2026-09-05; Go public prerelease accepted; Maven Central remains open; NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease
**Canonical repository:** `inn-media/truyn`  
**Protocol status:** `TRUYN/1` draft

A native SDK release is accepted only when its package bytes are bound to an exact merged `main` source with ordinary CI, hosted CodeQL/security, executable SDK conformance and package verification green. Registry coordinates are immutable; GitHub Actions artifacts are evidence, not consumer distribution channels.

## Current public coordinates

| Ecosystem | Package/module | Coordinate | Publication state |
|---|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` | **Accepted immutable public prerelease** |
| PyPI | `truyn-sdk` | `0.1.0a1` | **Accepted immutable public prerelease** |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` | **Accepted immutable public prerelease** |
| Maven Central | `org.truyn:truyn-sdk` | `0.1.0-alpha.1` | **OPEN** |
| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **Accepted immutable public prerelease** |

The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is accepted from real public publication plus independent verification evidence; Maven Central remains a reserved target coordinate until its own public publication and independent verification are accepted.

npm `0.1.0-alpha.1` remains public and immutable but is superseded: clean-room Node 22 ESM import proved it unusable because `ws` had been bundled through a CommonJS dynamic require. It is never overwritten. `0.1.0-alpha.2` externalizes `ws` and is the accepted npm alpha.

## npm alpha.2 closure

The accepted package source is `67ad856327947bb6fa1728e8fee3ba8553b37e24`. Its ordinary CI run `33965228235` and hosted CodeQL run `33965227398` both completed successfully before publication. The immutable successful release ref is `sdk/npm/v0.1.0-alpha.2-release.4`.

The public tarball is 21,295 bytes with SHA-256 `e70e1d726511c0cd3454d7bafdc1245c00c7eeda0afe7e51781e98160e2144d7`, npm shasum `ac94d083a05348ae3a9cd3b086063f67d9225c44`, and integrity `sha512-zBr13swGU9D81JmwPEau7HtSBTuhM2J7WNOVo4R/c40N49FeurWYEOE53hq4fnAQuHZ+BFdyOzz+ylmk0sNsZw==`. Both `alpha` and `latest` resolve to `0.1.0-alpha.2`.

Publication run `33965529159` used the already verified `truyn` read-write npm credential as a bounded one-shot bootstrap because npm account-side Trusted Publisher policy could not be repaired from repository automation. `--provenance` remained enabled. npm emitted a signed GitHub Actions SLSA provenance statement and recorded transparency-log index `2725236688`.

The immutable provenance identifies publication workflow commit `7554630f1752e8c6969a4d03ab3415480c82657e`, workflow `.github/workflows/npm-alpha2-bootstrap-publication.yml`, and ref `refs/heads/release/npm-alpha2-bootstrap-publication-20260905`. That one-shot workflow itself checked out the accepted package source `67ad856327947bb6fa1728e8fee3ba8553b37e24`, verified its exact main CI and hosted CodeQL runs, consumed the exact CI tarball, published it, verified public byte identity/tags/signatures/clean-room import, uploaded evidence, and deleted its branch. No token-backed npm publication workflow is retained on `main` after closure.

Independent run `33965828141` used no npm/PyPI registry credential. It independently observed the public npm version and dist-tags, downloaded and hashed the tarball, verified `dist.integrity`, `dist.shasum`, attestation metadata, `npm audit signatures --include-attestations`, decoded the SLSA provenance identity, and performed a clean-room install/import of `TruynClient` and `TruynLocalNodeClient`. A later read-only public probe `33966703296` independently reconfirmed the same npm provenance identity and clean-room imports.

## Immutable npm attempt history

These refs are evidence and are never moved, deleted or reused:

- `sdk/npm/v0.1.0-alpha.2` — initial candidate; an Actions-created tag event was recursion-suppressed.
- `sdk/npm/v0.1.0-alpha.2-release.1` — bot `workflow_dispatch` attempt ended as GitHub `startup_failure` before jobs or registry mutation.
- `sdk/npm/v0.1.0-alpha.2-release.2` — canonical `CI → workflow_run` reached the real npm PUT but received E404; no alpha.2 coordinate was created.
- `sdk/npm/v0.1.0-alpha.2-release.3` — setup-node token placeholder was removed and GitHub OIDC variables were present, but npm returned `ENEEDAUTH`, proving the remaining Trusted Publisher blocker was account-side policy.
- `sdk/npm/v0.1.0-alpha.2-release.4` — successful immutable publication of the exact accepted CI tarball with GitHub provenance.
- `sdk/npm/v0.1.0-alpha.2-release.5` — post-publication verification-only ref at `bf09a8bcdfc989306ea555a271d81f07ec2edbe2`; no package mutation occurred. Public bytes matched, while that verifier correctly exposed that immutable provenance belongs to the earlier successful release.4 bootstrap workflow rather than the later verification source.

## npm Trusted Publisher identity for future releases

The canonical repository-side publication path is `.github/workflows/publish-npm.yml`. It is intentionally token-free and requests only GitHub Actions read access, repository contents read access, and `id-token: write` for the publish job. It runs on GitHub-hosted runners in the `sdk-release` environment, consumes the exact ordinary-CI package artifact, requires exact-current-main CI and hosted CodeQL success, and calls `npm publish` without `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `npm whoami`.

The npm account-side trust relationship must bind exactly this identity:

- Repository: `inn-media/truyn`
- Workflow filename: `publish-npm.yml`
- Environment: `sdk-release`
- Allowed action: direct `npm publish`

The one-time maintainer command is:

```bash
npm install --global npm@11.19.1
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm trust github @truyn/sdk \
  --repo inn-media/truyn \
  --file publish-npm.yml \
  --environment sdk-release \
  --allow-publish \
  --yes
npm trust list @truyn/sdk
npm access set mfa=publish @truyn/sdk
npm logout --registry=https://registry.npmjs.org/
```

`npm trust` and the package publishing-access mutation require an interactive npm maintainer session with account-level 2FA. A bypass-2FA automation/granular token is deliberately not accepted for creating the trust relationship. Therefore repository automation must never attempt to bootstrap this setting with a long-lived npm token. The binding is accepted only after `npm trust list @truyn/sdk` shows the exact repository/workflow/environment tuple above and package publishing access is set to require 2FA and disallow traditional tokens.

## Future npm release policy

The alpha.2 repair workflows, marker and repair-specific tests are removed after closure. The repository intentionally retains **no token-backed npm publication path**.

For future npm releases the canonical workflow must remain `.github/workflows/publish-npm.yml`, and npm account-side Trusted Publisher configuration must authorize its exact GitHub repository/workflow/environment identity. The workflow must:

1. accept only an exact current merged `main` source with ordinary CI and same-source hosted CodeQL green;
2. consume the exact verified CI package artifact rather than rebuilding an independently resolved dependency graph;
3. run only from a fresh immutable `sdk/npm/v*` tag whose target is that exact current `main` source;
4. fail closed if the target version already exists unless public bytes are identical;
5. publish through npm Trusted Publishing with `--provenance`, without a long-lived npm token in the publish step;
6. use `alpha` for prerelease versions and `latest` for stable versions; during prerelease work `latest` may intentionally remain on the last accepted default version because npm OIDC authorizes publish/stage operations, not arbitrary `dist-tag` mutation;
7. independently verify public bytes, the publish-time dist-tag, signatures/provenance and clean-room installability;
8. preserve release evidence and never move, delete or reuse immutable release tags.

If npm Trusted Publisher is not configured, publication must fail rather than silently fall back to a persistent token path. Any exceptional bootstrap requires an explicit bounded one-shot workflow, exact-byte pinning, independent verification, and immediate cleanup as performed for alpha.2.

## PyPI verification contract

`truyn-sdk==0.1.0a1` remains immutable and was not republished during npm repair. The accepted wheel SHA-256 is `dec464064dec577aa56d33780c6222ac674accf07fe09ae59af18a191afcd958`; the accepted sdist SHA-256 is `a2e1e2baa6248cab18bdee08b10e832a39453836a64ad0b55c000f48c890ddaf`.

Independent run `33965828141` verified that the PyPI distribution set contains exactly the wheel and sdist when filtered to `bdist_wheel`/`sdist`, downloaded both public files and verified bytes, validated the current PEP 740 publisher representation (`kind=GitHub`, `repository=inn-media/truyn`, `workflow=publish-sdk-alpha.yml`, `environment=sdk-release`), ran `pypi-attestations verify`, and completed a clean-room install. Provenance/attestation records are evidence about distributions and are never counted as distribution files.

The recorded historical PyPI publication source remains `fda6b75fda5331dd9cdc7e642f7a0a5556749a64`.

## Permanent evidence

Canonical machine-readable closure evidence is committed at `sdk/release/evidence/npm-alpha2-2026-09-05.json`. It records source/tag identity, exact CI and CodeQL run IDs, publication and independent-verification run IDs, publication workflow identity, registry hashes/integrity, public dist-tags, provenance/signature/clean-room results, PyPI distribution hashes and artifact digests. It contains no credentials or private operational topology.

## Maven Central (`org.truyn:truyn-sdk`)

**State:** OPEN. The Java SDK already builds `truyn-sdk-<v>.jar`, `-sources.jar`, `-javadoc.jar` and the POM in ordinary CI (`sdk/release/build-release.sh`), and the POM already carries the metadata Central requires (name, description, url, license, developers, scm). What was missing was the publication path itself and the account-side identity.

Repository-side path: `.github/workflows/publish-maven.yml`, triggered only by an immutable `sdk/maven/v<version>` tag on exact current `main`.

1. `sdk/release/resolve-release-gates.sh` checks that the tag version equals `sdk/java/pom.xml` `<version>`, that the tag targets exact current `main`, and that same-SHA ordinary CI and hosted CodeQL are green.
2. The job downloads the exact CI artifact `truyn-sdk-release-<ci run>`, re-runs `verify-release.mjs` and binds `manifest.json` to the source SHA. Nothing is rebuilt.
3. If the version already exists on `repo1.maven.org`, the public jar must be byte-identical or the job fails. A coordinate is never overwritten.
4. `sdk/release/build-maven-bundle.sh` wraps the exact CI bytes into a Central Portal bundle (Maven layout, `.asc`, `.md5`, `.sha1`, `.sha256`, `.sha512`).
5. The bundle is uploaded to the Central Portal Publisher API with `publishingType=AUTOMATIC`. The job polls `/status` until `PUBLISHED` and fails on `FAILED`.
6. Independent verification: public jar bytes and SHA-256 equal the CI jar, the `.sha1` matches, `gpg --verify` of the public `.asc` passes, sources/javadoc/POM resolve, and a clean-room `mvn dependency:get` plus `javac`/`java` probe loads `org.truyn.sdk.TruynClient`.
7. The evidence JSON is uploaded as `truyn-sdk-maven-central-<run>`.

Maven Central has **no OIDC trusted publishing**, so this is the one registry path that uses stored credentials. They exist only as secrets of the protected `sdk-release` environment:

| Name | Kind | Value |
|---|---|---|
| `MAVEN_CENTRAL_USERNAME` / `MAVEN_CENTRAL_PASSWORD` | environment secret | Central Portal **user token** pair (not the account password) |
| `MAVEN_GPG_PRIVATE_KEY` | environment secret | ASCII-armoured private key of a dedicated release signing key |
| `MAVEN_GPG_PASSPHRASE` | environment secret | its passphrase |
| `MAVEN_GPG_FINGERPRINT` | environment variable | full fingerprint; the job refuses any other key |

One-time maintainer steps:

1. Sign in at `central.sonatype.com`. Add namespace `org.truyn` and prove control of `truyn.org` with the DNS TXT record the Portal shows. If `truyn.org` DNS is not controllable, change `groupId` to the auto-verified `io.github.inn-media` **before** the first release, because a published groupId cannot be renamed.
2. Generate a dedicated signing key (`gpg --quick-gen-key "TRUYN Release Signing <…>" ed25519 sign 2y`). Publish it with `gpg --keyserver keys.openpgp.org --send-keys <FPR>`, confirm the address in the keys.openpgp.org e-mail, and also send it to `keyserver.ubuntu.com`. Keep an offline revocation certificate.
3. In the Portal, generate a user token (Account → Generate User Token).
4. In GitHub Settings → Environments → `sdk-release`: add the secrets and variable above, keep required reviewers, and restrict deployment refs to `main` and `sdk/*/v*` tags.
5. Release: `git tag sdk/maven/v0.1.0-alpha.1 <exact-main-sha> && git push origin sdk/maven/v0.1.0-alpha.1`. A tag pushed by a person triggers the workflow. A tag created by `GITHUB_TOKEN` would be recursion-suppressed.
6. After the release is verified, rotate the Portal user token and set `coordinates.maven.publicationState` to `accepted` in `public-coordinates.json`, with committed evidence.

## NuGet.org (`Truyn.Sdk`)

**State:** **ACCEPTED IMMUTABLE PUBLIC PRERELEASE.** `Truyn.Sdk 0.1.0-alpha.1` is publicly available on NuGet.org and is bound to exact source `953ed548a52e4c3440a414ec2401ea324120155e` by immutable tag `sdk/nuget/v0.1.0-alpha.1`.

Accepted release chain:

- ordinary CI run `35903671988` — GREEN on the exact source SHA and produced the canonical package;
- hosted CodeQL run `35903670985` — GREEN on the same source SHA;
- NuGet Trusted Publishing run `35904855105` — pushed the exact CI package through GitHub Actions OIDC / `NuGet/login@v1`;
- independent verification run `35905748486` — fetched the public package without registry mutation, proved content identity excluding the expected NuGet.org repository signature, verified that repository signature with `dotnet nuget verify --all`, and completed clean-room restore plus runtime load of `Truyn.Sdk.TruynClient`.

Canonical committed evidence: `sdk/release/evidence/nuget-alpha1-2026-09-23.json`.

The publication run successfully mutated the registry. Its terminal clean-room step failed only because that historical verifier used obsolete `dotnet add package --packages` syntax. The independent verification run used `NUGET_PACKAGES`, performed no registry mutation, and closed the acceptance gate GREEN.

Repository-side publication remains `.github/workflows/publish-nuget.yml` using NuGet Trusted Publishing. No long-lived NuGet API key is part of the release contract.

Permanent rules: publish only immutable version tags on exact qualified main; consume exact CI package bytes; never skip duplicates; require package-entry identity apart from NuGet.org's repository signature; require `dotnet nuget verify --all`; require clean-room restore/runtime loading; preserve release evidence; and use a new version/tag for materially different bytes.

Configured Trusted Publishing identity: package owner `truyn.org`, repository `inn-media/truyn`, workflow `publish-nuget.yml`, environment `sdk-release`, GitHub environment variable `NUGET_USER=truyn`.

NuGet.org is no longer an external Developer Release publication gate. Maven Central remains the open registry publication gate.
