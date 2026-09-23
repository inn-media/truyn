from pathlib import Path
import json
import re
import subprocess

ACCEPTED = "NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease"
CURRENT_STATUS_FILES = {
    "README.md",
    "ROADMAP.md",
    "STRUCTURE.md",
    "docs/architecture/ARCHITECTURE_CONTRACT.md",
    "docs/architecture/IMPLEMENTATION_STATUS.md",
    "docs/architecture/SDK_DEVELOPER_EXPERIENCE.md",
    "docs/compatibility/README.md",
    "docs/compatibility/SDK_COMPATIBILITY.md",
    "docs/compatibility/SDK_PACKAGING.md",
    "docs/getting-started/DX3_SDK.md",
    "docs/operations/DOCUMENTATION_SANITATION_2026-09-23.md",
    "sdk/README.md",
}

EXACT = [
    ("Maven Central and NuGet.org publication remain open.", f"{ACCEPTED}; Maven Central publication remains open."),
    ("Maven Central and NuGet.org remain open.", f"{ACCEPTED}; Maven Central remains open."),
    ("Maven Central and NuGet remain open.", f"Maven Central remains open; {ACCEPTED}."),
    ("Maven Central and NuGet remain open", f"Maven Central remains open; {ACCEPTED}"),
    ("Maven Central/NuGet.org remain open", f"Maven Central remains open; {ACCEPTED}"),
    ("Maven Central/NuGet remain open", f"Maven Central remains open; {ACCEPTED}"),
    ("Maven Central and NuGet.org remain external release gates", f"Maven Central remains an external release gate; {ACCEPTED}"),
    ("Maven Central, NuGet and public-site activation remain external release gates", "NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public release; Maven Central and public-site activation remain external release gates"),
    ("Maven Central/NuGet.org publication gates", "Maven Central publication gate"),
    ("Maven Central / NuGet publication gates", "Maven Central publication gate"),
    ("NuGet.org publication open", "NuGet.org accepted immutable public release"),
    ("NuGet publication open", "NuGet.org accepted immutable public release"),
    ("not yet claimed as a publicly published NuGet release", "published and independently verified as the immutable public NuGet prerelease `Truyn.Sdk 0.1.0-alpha.1`"),
    ("- [ ] NuGet.org publication evidence;", "- [x] NuGet.org publication evidence (`Truyn.Sdk 0.1.0-alpha.1`; independent verification run `35905748486`);"),
    ("- [ ] NuGet.org publication evidence", "- [x] NuGet.org publication evidence (`Truyn.Sdk 0.1.0-alpha.1`; independent verification run `35905748486`)"),
    ("PyPI, Go and npm alpha.2 have accepted immutable public evidence.", "PyPI, Go, npm alpha.2 and NuGet alpha.1 have accepted immutable public evidence."),
    ("PyPI, Go and npm alpha.2 public alphas are accepted immutable releases;", "PyPI, Go, npm alpha.2 and NuGet alpha.1 public alphas are accepted immutable releases;"),
    ("npm alpha.2, PyPI alpha and Go alpha are separately accepted from observed immutable public evidence, while Maven Central and NuGet.org remain open.", "npm alpha.2, PyPI alpha, Go alpha and NuGet alpha.1 are separately accepted from observed immutable public evidence, while Maven Central remains open."),
]

md_files = [Path(p) for p in subprocess.check_output(["git", "ls-files", "*.md"], text=True).splitlines()]
for p in md_files:
    s = p.read_text()
    old = s
    for a, b in EXACT:
        s = s.replace(a, b)
    s = re.sub(
        r"npm, PyPI and Go have accepted immutable public (releases|evidence), while Maven Central(?:,| and) NuGet(?:\.org)?(?: and public-site activation)? remain[^.]*\.",
        lambda m: f"npm, PyPI, Go and NuGet.org have accepted immutable public {m.group(1)}; Maven Central remains open.",
        s,
    )
    s = re.sub(
        r"^\| Maven Central / NuGet \| \*\*OPEN\*\* \|\s*$",
        "| Maven Central | **OPEN** |\n| NuGet.org `Truyn.Sdk 0.1.0-alpha.1` | **Accepted immutable public release** |",
        s,
        flags=re.M,
    )
    s = re.sub(
        r"^\| Maven Central / NuGet \| \*\*OPEN\*\* \|([^\n]*)$",
        lambda m: f"| Maven Central | **OPEN** |{m.group(1)}\n| NuGet.org `Truyn.Sdk 0.1.0-alpha.1` | **Accepted immutable public release** | publication + independent verification evidence PASS |",
        s,
        flags=re.M,
    )
    if p.as_posix() in CURRENT_STATUS_FILES:
        s = re.sub(r"NuGet\.org remains open", ACCEPTED, s, flags=re.I)
        s = re.sub(r"NuGet remains open", ACCEPTED, s, flags=re.I)
    if s != old:
        p.write_text(s)

# Canonical publication contract: replace the historical OPEN NuGet section with accepted evidence.
p = Path("sdk/release/PUBLISHING.md")
s = p.read_text()
s = s.replace("| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **OPEN** |", "| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **Accepted immutable public prerelease** |")
s = s.replace(
    "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. Maven and NuGet coordinates above are reserved target coordinates, not accepted public distributions until their real registry publication and independent verification evidence is accepted.",
    "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. NuGet.org `Truyn.Sdk@0.1.0-alpha.1` is accepted from real public publication plus independent verification evidence; Maven Central remains a reserved target coordinate until its own public publication and independent verification are accepted.",
)
marker = "## NuGet.org (`Truyn.Sdk`)"
if marker not in s:
    raise SystemExit("NuGet section marker missing in PUBLISHING.md")
head = s.split(marker, 1)[0].rstrip()
nuget = """## NuGet.org (`Truyn.Sdk`)

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
"""
p.write_text(head + "\n\n" + nuget)

# .NET consumer README: make the accepted public coordinate directly installable.
p = Path("sdk/dotnet/README.md")
s = p.read_text()
if "Accepted public NuGet prerelease" not in s:
    anchor = "Truyn.Sdk 0.1.0-alpha.1\n```"
    if anchor in s:
        s = s.replace(anchor, anchor + "\n\n**Accepted public NuGet prerelease:** independently verified on NuGet.org.\n\n```bash\ndotnet add package Truyn.Sdk --version 0.1.0-alpha.1\n```\n\nRelease evidence: `../release/evidence/nuget-alpha1-2026-09-23.json`.", 1)
    p.write_text(s)

# Compatibility matrix exact accepted state.
p = Path("spec/compatibility/matrix.md")
s = p.read_text()
s = s.replace(
    "| NuGet `Truyn.Sdk@0.1.0-alpha.1` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | source/build/conformance proven; NuGet.org accepted immutable public release |",
    "| NuGet `Truyn.Sdk@0.1.0-alpha.1` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |",
)
p.write_text(s)

# Future release verifier: replace obsolete --packages syntax without weakening acceptance.
p = Path(".github/workflows/publish-nuget.yml")
s = p.read_text()
old = '          dotnet add package "$NUGET_ID" --version "$VERSION" --packages "$clean/packages"'
new = '          export NUGET_PACKAGES="$clean/packages"\n          dotnet add package "$NUGET_ID" --version "$VERSION" --source "$NUGET_SOURCE"'
if old not in s:
    raise SystemExit("expected obsolete NuGet clean-room syntax not found")
p.write_text(s.replace(old, new, 1))

# Validation: NuGet accepted, Maven still open, evidence present, no stale current-status claims.
coords = json.loads(Path("sdk/release/public-coordinates.json").read_text())
assert coords["coordinates"]["nuget"]["publicationState"] == "accepted"
assert coords["coordinates"]["maven"]["publicationState"] == "open"
assert Path("sdk/release/evidence/nuget-alpha1-2026-09-23.json").is_file()
assert '--packages "$clean/packages"' not in Path(".github/workflows/publish-nuget.yml").read_text()
patterns = [
    r"NuGet(?:\.org)? publication open",
    r"NuGet(?:\.org)? remain(?:s)? open",
    r"Maven Central / NuGet \| \*\*OPEN\*\*",
    r"not yet claimed as a publicly published NuGet release",
    r"\[ \] NuGet\.org publication evidence",
]
stale = []
for p in md_files:
    text = p.read_text()
    for pat in patterns:
        if re.search(pat, text, re.I):
            stale.append((p.as_posix(), pat))
if stale:
    raise SystemExit("stale NuGet documentation remains: " + repr(stale))

print("TRUYN_NUGET_DOC_SANITATION=PASS")
