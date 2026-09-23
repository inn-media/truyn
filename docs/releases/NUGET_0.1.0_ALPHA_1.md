# NuGet.org `0.1.0-alpha.1` accepted release

**Registry:** NuGet.org  
**Coordinate:** `Truyn.Sdk@0.1.0-alpha.1`  
**Release tag:** `sdk/nuget/v0.1.0-alpha.1`  
**Source SHA:** `953ed548a52e4c3440a414ec2401ea324120155e`  
**CI run:** `35903671988`  
**CodeQL run:** `35903670985`  
**Publication run:** `35904855105`  
**Independent verification run:** `35905748486`  
**Verification artifact:** `truyn-sdk-nuget-alpha1-verification-35905748486`  
**Verification artifact ID:** `10771365435`  
**Verification artifact digest:** `sha256:6eae573830ffa58e8aeada6e07c9c7ce0b075666d0431514fd76e3a31da6deee`  
**Accepted:** 2026-09-23

## Acceptance result

`Truyn.Sdk@0.1.0-alpha.1` is an **accepted immutable public release**.

The package was published to NuGet.org through NuGet Trusted Publishing. The immutable release tag resolves to the exact accepted source SHA above. The post-publication verification run completed successfully and performed no registry mutation.

The canonical verification evidence records:

- `publicationPush: PASS`;
- `repositorySignatureVerification: PASS`;
- `contentIdentityExcludingRepositorySignature: PASS`;
- `cleanRoomRestore: PASS`.

The public NuGet package is repository-signed by NuGet.org, which adds `.signature.p7s`; therefore raw `.nupkg` bytes are expected to differ from the unsigned CI package. All package content excluding that repository signature matched the CI package, and `dotnet nuget verify --all` passed.

A clean-room consumer restored `Truyn.Sdk 0.1.0-alpha.1` directly from NuGet.org using `dotnet add package` and successfully loaded `Truyn.Sdk.TruynClient`.

The original publication workflow had already pushed the package successfully; its final verification step failed only because it used the obsolete `dotnet add package --packages` syntax. The independent verification corrected the verifier by using `NUGET_PACKAGES` and did not republish, overwrite, move, or otherwise mutate the public coordinate.

## Immutability boundary

The coordinate `Truyn.Sdk@0.1.0-alpha.1` and tag `sdk/nuget/v0.1.0-alpha.1` are immutable. Any materially different package source or package content requires a new version and a new release tag.
