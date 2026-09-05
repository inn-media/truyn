# TRUYN SDK publication contract

**Status:** npm/PyPI alpha registry closure completed on 2026-09-05  
**Canonical repository:** `inn-media/truyn`  
**Protocol status:** `TRUYN/1` draft

A native SDK release is accepted only when its package bytes are bound to an exact merged `main` source with ordinary CI, hosted CodeQL/security, executable SDK conformance and package verification green. Registry coordinates are immutable; GitHub Actions artifacts are evidence, not consumer distribution channels.

## Current public coordinates

| Ecosystem | Package/module | Accepted coordinate |
|---|---|---|
| npm | `@truyn/sdk` | `0.1.0-alpha.2` |
| PyPI | `truyn-sdk` | `0.1.0a1` |
| Go modules | `github.com/inn-media/truyn/sdk/go` | `v0.1.0-alpha.1` |
| Maven | `org.truyn:truyn-sdk` | `0.1.0-alpha.1` |
| NuGet | `Truyn.Sdk` | `0.1.0-alpha.1` |

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

## Future npm release policy

The alpha.2 repair workflows, marker and repair-specific tests are removed after closure. The repository intentionally retains **no token-backed npm publication path**.

Before a future npm release workflow is introduced, npm account-side Trusted Publisher configuration must authorize its exact GitHub repository/workflow identity. A future canonical workflow must then:

1. accept only an exact merged `main` source with ordinary CI and same-source hosted CodeQL green;
2. consume the exact verified CI package artifact rather than rebuilding an independently resolved dependency graph;
3. create a fresh immutable release tag only after those gates;
4. fail closed if the target version already exists unless public bytes are identical;
5. publish through npm Trusted Publishing with `--provenance`, without a long-lived npm token in the publish step;
6. independently verify public bytes, tags, signatures/provenance and clean-room installability;
7. preserve permanent release evidence and remove temporary release scaffolding after closure.

If npm Trusted Publisher is not configured, publication must fail rather than silently fall back to a persistent token path. Any exceptional bootstrap requires an explicit bounded one-shot workflow, exact-byte pinning, independent verification, and immediate cleanup as performed for alpha.2.

## PyPI verification contract

`truyn-sdk==0.1.0a1` remains immutable and was not republished during npm repair. The accepted wheel SHA-256 is `dec464064dec577aa56d33780c6222ac674accf07fe09ae59af18a191afcd958`; the accepted sdist SHA-256 is `a2e1e2baa6248cab18bdee08b10e832a39453836a64ad0b55c000f48c890ddaf`.

Independent run `33965828141` verified that the PyPI distribution set contains exactly the wheel and sdist when filtered to `bdist_wheel`/`sdist`, downloaded both public files and verified bytes, validated the current PEP 740 publisher representation (`kind=GitHub`, `repository=inn-media/truyn`, `workflow=publish-sdk-alpha.yml`, `environment=sdk-release`), ran `pypi-attestations verify`, and completed a clean-room install. Provenance/attestation records are evidence about distributions and are never counted as distribution files.

The recorded historical PyPI publication source remains `fda6b75fda5331dd9cdc7e642f7a0a5556749a64`.

## Permanent evidence

Canonical machine-readable closure evidence is committed at `sdk/release/evidence/npm-alpha2-2026-09-05.json`. It records source/tag identity, exact CI and CodeQL run IDs, publication and independent-verification run IDs, publication workflow identity, registry hashes/integrity, public dist-tags, provenance/signature/clean-room results, PyPI distribution hashes and artifact digests. It contains no credentials or private operational topology.
