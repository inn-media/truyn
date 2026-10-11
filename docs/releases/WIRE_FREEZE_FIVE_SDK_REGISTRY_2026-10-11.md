# TRUYN five-SDK Wire Freeze prerelease — registry closure (2026-10-11)

**Status: ACCEPTED / five public registries verified (not stable v1, not WAN admission).**

## Immutable frozen authority

- Frozen public source SHA: `57971b134a41c3e3ea4b42f68e86a7d117036006`.
- Accepted CI release bundle: Actions run `38154701595`, hosted CodeQL `38154701311`.
- npm publisher PR #1019, merged public main `74587a9c73aaafcae732fce69455b392cdef77c2`.
- npm publication run `38168871589` completed **SUCCESS**, evidence artifact id `11713985002`. Uses protected `sdk-release` environment, GitHub Actions OIDC and `publish-npm.yml`; no classic registry credentials.
- The former npm OIDC exchange failure `38164044619` is immutable historical evidence; it occurred before the now-accepted Trusted Publisher validated. No package version was overwritten.
- Release packages were consumed from the **frozen accepted CI artifacts**, not rebuilt during publication.

## Immutable public ecosystem coordinates

| Language | Registry | Accepted immutable prerelease |
|---|---|---|
| JavaScript/TypeScript | npm | `@truyn/sdk@0.1.0-alpha.5` |
| Python | PyPI | `truyn-sdk==0.1.0a2` |
| Go | Go proxy / sumDB | `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2` |
| Java | Maven Central | `org.truyn:truyn-sdk:0.1.0-alpha.2` |
| C#/.NET | NuGet.org | `Truyn.Sdk 0.1.0-alpha.2` |

Independent release qualification on these coordinates reported **6/6 PASS**: frozen source, npm, PyPI, Go, Maven Central and NuGet. npm independently checked published exact tarball bytes and SHA-256 against frozen CI, dist-tag `alpha`, provenance attestation, signature audit and a clean-room import of `TruynClient` and `TruynLocalNodeClient`. Historical prereleases remain immutable. Installing `@truyn/sdk` without a version might use a different `latest` tag: use `@truyn/sdk@0.1.0-alpha.5` explicitly.

## Private consumer boundary

The private release-only verifier separately accepted all six registry/source proofs, issued an **immutable digest pin evidence artifact**, and completed five-language **shadow-only** consumers. This public ledger deliberately omits private operational topology and control IDs. Private production deployment/canary was **not** activated. Verified public packages are prerequisites, not production access authority.

## Limitations

This closes the immutable **five-SDK pre-release distribution** gate. It does not establish stable v1, full Agent Descriptor lifecycle parity, production WAN admission, paid provider access, network-scale operational readiness or mainnet readiness. Those remain separately gated. No test thresholds were waived, no registry package was retagged to substitute different bytes, and no prior error evidence was deleted.
