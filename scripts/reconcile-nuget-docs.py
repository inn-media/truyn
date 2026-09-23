#!/usr/bin/env python3
import json
from pathlib import Path

BASE_MAIN_SHA = "d15046f549e9b0bf0480bb1960f84e3daecc3dfc"
SOURCE_SHA = "953ed548a52e4c3440a414ec2401ea324120155e"
RELEASE_TAG = "sdk/nuget/v0.1.0-alpha.1"
CI_RUN = "35903671988"
CODEQL_RUN = "35903670985"
PUBLICATION_RUN = "35904855105"
VERIFICATION_RUN = "35905748486"
VERIFICATION_ARTIFACT = "truyn-sdk-nuget-alpha1-verification-35905748486"
VERIFICATION_ARTIFACT_ID = "10771365435"
VERIFICATION_ARTIFACT_DIGEST = "sha256:6eae573830ffa58e8aeada6e07c9c7ce0b075666d0431514fd76e3a31da6deee"

root = Path(".")
coords_path = root / "sdk/release/public-coordinates.json"
coords = json.loads(coords_path.read_text())
nuget = coords["coordinates"]["nuget"]
assert nuget["coordinate"] == "Truyn.Sdk@0.1.0-alpha.1"
assert nuget["version"] == "0.1.0-alpha.1"
nuget["publicationState"] = "accepted"
coords["reconciledOnMainSha"] = BASE_MAIN_SHA
coords["statusBoundary"] = "npm, PyPI, Go, Maven Central and NuGet.org are accepted immutable public releases."
coords_path.write_text(json.dumps(coords, indent=2) + "\n")

evidence = f"""# NuGet.org `0.1.0-alpha.1` accepted release

**Registry:** NuGet.org  
**Coordinate:** `Truyn.Sdk@0.1.0-alpha.1`  
**Release tag:** `{RELEASE_TAG}`  
**Source SHA:** `{SOURCE_SHA}`  
**CI run:** `{CI_RUN}`  
**CodeQL run:** `{CODEQL_RUN}`  
**Publication run:** `{PUBLICATION_RUN}`  
**Independent verification run:** `{VERIFICATION_RUN}`  
**Verification artifact:** `{VERIFICATION_ARTIFACT}`  
**Verification artifact ID:** `{VERIFICATION_ARTIFACT_ID}`  
**Verification artifact digest:** `{VERIFICATION_ARTIFACT_DIGEST}`  
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

The coordinate `Truyn.Sdk@0.1.0-alpha.1` and tag `{RELEASE_TAG}` are immutable. Any materially different package source or package content requires a new version and a new release tag.
"""

evidence_path = root / "docs/releases/NUGET_0.1.0_ALPHA_1.md"
evidence_path.parent.mkdir(parents=True, exist_ok=True)
evidence_path.write_text(evidence)

targets = [
    "README.md",
    "ROADMAP.md",
    "docs/README.md",
    "docs/architecture/IMPLEMENTATION_STATUS.md",
    "docs/architecture/SDK_DEVELOPER_EXPERIENCE.md",
    "docs/compatibility/SDK_PACKAGING.md",
    "docs/getting-started/DX3_SDK.md",
    "docs/getting-started/SDK_QUICKSTART.md",
    "docs/getting-started/MVP_QUICKSTART.md",
    "examples/README.md",
    "examples/sdk/README.md",
    "sdk/README.md",
    "sdk/release/PUBLISHING.md",
    "spec/compatibility/matrix.md",
]

replacements = [
    ("NuGet status is reconciled independently.", "NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is an **accepted immutable public release**."),
    ("NuGet.org status is reconciled independently", "NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is an accepted immutable public release"),
    ("NuGet publication status is reconciled independently.", "NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is an **accepted immutable public release**."),
    (".NET/NuGet status is reconciled independently.", ".NET/NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is an accepted immutable public release."),
    ("NuGet.org publication open", "NuGet.org publication is accepted (`Truyn.Sdk@0.1.0-alpha.1`)"),
    ("Maven Central and NuGet.org publication remain open", "Maven Central and NuGet.org are accepted immutable public releases"),
    ("Maven Central and NuGet publication remain open", "Maven Central and NuGet.org are accepted immutable public releases"),
    ("completion of the still-open Maven Central/NuGet.org publication gates", "completion of the remaining Developer Release gates"),
    ("Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an accepted immutable public release; NuGet status is reconciled independently native-publication gates.", "Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk@0.1.0-alpha.1` are accepted immutable public releases."),
    ("Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an accepted immutable public release; NuGet status is reconciled independently publication gates.", "Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk@0.1.0-alpha.1` are accepted immutable public releases."),
    ("Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an **accepted immutable public release**. NuGet status is reconciled independently.", "Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk@0.1.0-alpha.1` are **accepted immutable public releases**."),
]

for rel in targets:
    p = root / rel
    if not p.exists():
        continue
    s = p.read_text()
    before = s
    for old, new in replacements:
        s = s.replace(old, new)

    if rel == "README.md":
        s = s.replace(
            "| NuGet | **Status reconciled independently** |",
            "| NuGet | **Accepted immutable public release — `Truyn.Sdk@0.1.0-alpha.1`** |",
        )

    if rel == "docs/architecture/IMPLEMENTATION_STATUS.md":
        s = s.replace(
            "| NuGet | **Status reconciled independently** | public publication evidence |",
            "| NuGet | **Accepted immutable public release — `Truyn.Sdk@0.1.0-alpha.1`** | — |",
        )
        old = "Five first-party clients and shared executable conformance already exist. Accepted immutable releases remain PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, and npm `@truyn/sdk@0.1.0-alpha.2`. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an **accepted immutable public release**. NuGet status is reconciled independently."
        new = "Five first-party clients and shared executable conformance already exist. All five required ecosystem releases are accepted and immutable: npm `@truyn/sdk@0.1.0-alpha.2`, PyPI `truyn-sdk==0.1.0a1`, Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`, Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1`, and NuGet.org `Truyn.Sdk@0.1.0-alpha.1`."
        s = s.replace(old, new)

    if rel == "docs/architecture/SDK_DEVELOPER_EXPERIENCE.md":
        s = s.replace(
            "**Status:** Developer Release Layer implementation complete in source/build form; npm, PyPI and Go have accepted immutable public releases, while Maven Central, NuGet and public-site activation remain external release gates.",
            "**Status:** Developer Release Layer implementation is source/build complete; all five required ecosystem prereleases (npm, PyPI, Go, Maven Central and NuGet.org) have accepted immutable public releases. Public-site activation and remaining release-hardening gates remain separate.",
        )
        s = s.replace("- [ ] Maven Central publication evidence;", "- [x] Maven Central publication evidence;")
        s = s.replace("- [ ] NuGet.org publication evidence;", "- [x] NuGet.org publication evidence;")
        s = s.replace(
            "Therefore: **DX-3 runtime/API core is closed; npm/PyPI/Go public alphas are accepted, while Maven Central, NuGet, Descriptor completion, archive scanning and live-site activation remain the Developer Release closure gates.**",
            "Therefore: **DX-3 runtime/API core is closed and all five required SDK ecosystem prereleases are accepted; Descriptor completion, archive scanning and live-site activation remain separate Developer Release closure gates.**",
        )

    if rel == "ROADMAP.md":
        s = s.replace(
            "| SDK/DX | **Five clients/conformance implemented; PyPI + Go + npm alpha.2 accepted** | Maven/NuGet + Descriptor/site completeness |",
            "| SDK/DX | **Five clients/conformance implemented; all five native public prereleases accepted** | Descriptor/site completeness + remaining release hardening |",
        )

    if rel == "sdk/release/PUBLISHING.md":
        s = s.replace(
            "| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **OPEN** |",
            "| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **Accepted immutable public prerelease** |",
        )
        s = s.replace(
            "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an accepted immutable public distribution. NuGet publication status is reconciled independently.",
            "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk@0.1.0-alpha.1` are accepted immutable public distributions.",
        )
        s = s.replace(
            "**State:** OPEN. `dotnet pack`",
            "**State:** ACCEPTED IMMUTABLE PUBLIC RELEASE. `Truyn.Sdk@0.1.0-alpha.1` was published to NuGet.org and independently verified on 2026-09-23. Canonical evidence: `docs/releases/NUGET_0.1.0_ALPHA_1.md`. `dotnet pack`",
        )

    if rel == "sdk/README.md":
        s = s.replace("- Maven Central and NuGet immutable public native package publication;\n", "")

    if s != before:
        p.write_text(s)

stale_tokens = [
    "NuGet.org publication open",
    "NuGet status is reconciled independently",
    "NuGet publication status is reconciled independently",
    "NuGet.org status is reconciled independently",
    "still-open Maven Central/NuGet.org publication gates",
    "Maven Central and NuGet.org publication remain open",
    "Maven Central and NuGet publication remain open",
]
failures = []
for rel in targets:
    p = root / rel
    if not p.exists():
        continue
    text = p.read_text()
    for token in stale_tokens:
        if token in text:
            failures.append(f"{rel}: {token}")
if failures:
    raise SystemExit("stale NuGet status remains:\n" + "\n".join(failures))

coords2 = json.loads(coords_path.read_text())
assert coords2["coordinates"]["nuget"]["publicationState"] == "accepted"
assert coords2["statusBoundary"] == "npm, PyPI, Go, Maven Central and NuGet.org are accepted immutable public releases."
print("NUGET_DOC_RECONCILIATION=PASS")
