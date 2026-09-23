from pathlib import Path
import json
import re

ACCEPTED = "NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease"
CURRENT = [
    Path("README.md"),
    Path("ROADMAP.md"),
    Path("STRUCTURE.md"),
    Path("docs/architecture/ARCHITECTURE_CONTRACT.md"),
    Path("docs/architecture/IMPLEMENTATION_STATUS.md"),
    Path("docs/architecture/SDK_DEVELOPER_EXPERIENCE.md"),
    Path("docs/compatibility/README.md"),
    Path("docs/compatibility/SDK_COMPATIBILITY.md"),
    Path("docs/compatibility/SDK_PACKAGING.md"),
    Path("docs/getting-started/DX3_SDK.md"),
    Path("docs/operations/DOCUMENTATION_SANITATION_2026-09-23.md"),
    Path("sdk/README.md"),
    Path("examples/README.md"),
    Path("examples/sdk/README.md"),
]

repls = [
    ("NuGet.org status is reconciled independently", ACCEPTED),
    ("NuGet publication status is reconciled independently", ACCEPTED),
    ("NuGet status is reconciled independently", ACCEPTED),
    ("NuGet.org remains open", ACCEPTED),
    ("NuGet remains open", ACCEPTED),
    ("NuGet.org publication remains open", ACCEPTED),
    ("NuGet publication remains open", ACCEPTED),
    ("NuGet.org publication open", "NuGet.org accepted immutable public release"),
    ("NuGet publication open", "NuGet.org accepted immutable public release"),
    ("not yet claimed as a publicly published NuGet release", "published and independently verified as the immutable public NuGet prerelease `Truyn.Sdk 0.1.0-alpha.1`"),
    ("- [ ] NuGet.org publication evidence;", "- [x] NuGet.org publication evidence (`Truyn.Sdk 0.1.0-alpha.1`; independent verification run `35905748486`);"),
    ("- [ ] NuGet.org publication evidence", "- [x] NuGet.org publication evidence (`Truyn.Sdk 0.1.0-alpha.1`; independent verification run `35905748486`)"),
    ("C#/.NET/NuGet.org remain open public-distribution gates", "C#/.NET/NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease"),
    ("Maven Central and NuGet.org remain external release gates", "Maven Central and NuGet.org have accepted immutable public prereleases"),
    ("Maven Central, NuGet and public-site activation remain external release gates", "Maven Central and NuGet.org have accepted immutable public prereleases; public-site activation remains an external release gate"),
]

for p in CURRENT:
    if not p.exists():
        continue
    s = p.read_text()
    old = s
    for a, b in repls:
        s = s.replace(a, b)
    s = re.sub(
        r"^\| NuGet(?:\.org)? \| \*\*(?:OPEN|Status reconciled independently)\*\* \|\s*$",
        "| NuGet.org | **Accepted immutable public release — `Truyn.Sdk 0.1.0-alpha.1`** |",
        s,
        flags=re.M,
    )
    s = re.sub(
        r"^\| NuGet(?:\.org)? \| \*\*Status reconciled independently\*\* \|\s*$",
        "| NuGet.org | **Accepted immutable public release — `Truyn.Sdk 0.1.0-alpha.1`** |",
        s,
        flags=re.M,
    )
    s = re.sub(
        r"NuGet\.org `Truyn\.Sdk 0\.1\.0-alpha\.1` (?:remains|is) (?:an )?open publication gate",
        "NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease",
        s,
    )
    if s != old:
        p.write_text(s)

# Machine-readable authority: preserve Maven accepted and close NuGet from committed public evidence.
p = Path("sdk/release/public-coordinates.json")
data = json.loads(p.read_text())
assert data["coordinates"]["maven"]["publicationState"] == "accepted"
nuget = data["coordinates"]["nuget"]
nuget.update({
    "publicationState": "accepted",
    "tag": "sdk/nuget/v0.1.0-alpha.1",
    "sourceSha": "953ed548a52e4c3440a414ec2401ea324120155e",
    "publicationRunId": "35904855105",
    "verificationRunId": "35905748486",
    "evidence": "sdk/release/evidence/nuget-alpha1-2026-09-23.json",
})
data["statusBoundary"] = "npm, PyPI, Go, Maven Central and NuGet.org are accepted immutable public prereleases/releases at the coordinates recorded above."
p.write_text(json.dumps(data, indent=2) + "\n")

# Canonical publication contract: preserve accepted Maven section, replace terminal NuGet section.
p = Path("sdk/release/PUBLISHING.md")
s = p.read_text()
s = s.replace(
    "**Status:** npm/PyPI alpha registry closure completed on 2026-09-05; Go public prerelease accepted; Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is accepted as an immutable public release; NuGet.org status is reconciled independently  ",
    "**Status:** npm/PyPI/Go/Maven Central/NuGet public prereleases accepted  ",
)
s = s.replace(
    "| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **OPEN** |",
    "| NuGet.org | `Truyn.Sdk` | `0.1.0-alpha.1` | **Accepted immutable public prerelease** |",
)
s = s.replace(
    "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` is an accepted immutable public distribution. NuGet publication status is reconciled independently.",
    "The machine-readable authority for this coordinate-specific boundary is `sdk/release/public-coordinates.json`. Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk@0.1.0-alpha.1` are accepted immutable public distributions backed by committed independent verification evidence.",
)
marker = "## NuGet.org (`Truyn.Sdk`)"
assert marker in s
head = s.split(marker, 1)[0].rstrip()
nuget_section = """## NuGet.org (`Truyn.Sdk`)

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

NuGet.org is no longer an external Developer Release publication gate. Maven Central is also accepted at `org.truyn:truyn-sdk:0.1.0-alpha.1`.
"""
p.write_text(head + "\n\n" + nuget_section)

# .NET consumer README.
p = Path("sdk/dotnet/README.md")
s = p.read_text()
if "Accepted public NuGet prerelease" not in s:
    s += "\n\n## Public NuGet prerelease\n\n**Accepted public NuGet prerelease:** `Truyn.Sdk 0.1.0-alpha.1`, independently verified on NuGet.org.\n\n```bash\ndotnet add package Truyn.Sdk --version 0.1.0-alpha.1\n```\n\nRelease evidence: `../release/evidence/nuget-alpha1-2026-09-23.json`.\n"
p.write_text(s)

# Compatibility matrix current coordinate.
p = Path("spec/compatibility/matrix.md")
s = p.read_text()
s = re.sub(
    r"^\| NuGet `Truyn\.Sdk@0\.1\.0-alpha\.1` \| `1` \| `TRUYN/1` draft \| `truyn\.agent-descriptor/v1` draft \|.*$",
    "| NuGet `Truyn.Sdk@0.1.0-alpha.1` | `1` | `TRUYN/1` draft | `truyn.agent-descriptor/v1` draft | **accepted immutable public release** |",
    s,
    flags=re.M,
)
s = s.replace(
    "Package build/provenance does not by itself prove public registry availability;",
    "Package build/provenance does not by itself prove public registry availability; accepted registry state below is backed by independent public evidence.",
)
p.write_text(s)

# Tighten the release-coordinate regression test now that both external registries are accepted.
p = Path("tests/maven-nuget-publication-workflow.test.js")
s = p.read_text()
pattern = re.compile(r"test\('Maven and NuGet coordinates stay OPEN until real publication evidence exists'.*?\n\}\);\n\n(?=test\('NuGet package carries)", re.S)
replacement = """test('Maven and NuGet coordinates require accepted public evidence', async () => {
  const coords = JSON.parse(await read('sdk/release/public-coordinates.json')).coordinates;
  const pom = await read('sdk/java/pom.xml');
  const csproj = await read('sdk/dotnet/Truyn.Sdk.csproj');
  assert.match(pom, new RegExp(`<version>${coords.maven.version.replaceAll('.', '\\\\.')}</version>`));
  assert.match(csproj, new RegExp(`<Version>${coords.nuget.version.replaceAll('.', '\\\\.')}</Version>`));
  assert.equal(coords.maven.publicationState, 'accepted');
  assert.equal(coords.nuget.publicationState, 'accepted');
  const evidence = JSON.parse(await read('sdk/release/evidence/nuget-alpha1-2026-09-23.json'));
  assert.equal(evidence.coordinate, 'Truyn.Sdk@0.1.0-alpha.1');
  const publishing = await read('sdk/release/PUBLISHING.md');
  assert.match(publishing, /NuGet\\.org is no longer an external Developer Release publication gate/);
  assert.match(publishing, /workflow `publish-nuget\\.yml`/);
  assert.match(publishing, /environment `sdk-release`/);
  assert.match(publishing, /package owner `truyn\\.org`/);
  assert.match(publishing, /namespace `org\\.truyn`/);
});

"""
s2, n = pattern.subn(replacement, s, count=1)
assert n == 1, "release-coordinate test block not found"
p.write_text(s2)

# Current-status assertions: both Maven and NuGet accepted, no stale NuGet-open wording in current docs.
coords = json.loads(Path("sdk/release/public-coordinates.json").read_text())["coordinates"]
assert coords["maven"]["publicationState"] == "accepted"
assert coords["nuget"]["publicationState"] == "accepted"
assert Path("sdk/release/evidence/nuget-alpha1-2026-09-23.json").is_file()

stale_patterns = [
    r"NuGet(?:\.org)? (?:publication )?remain(?:s)? open",
    r"NuGet(?:\.org)? (?:publication )?open",
    r"NuGet(?:\.org)? status is reconciled independently",
    r"NuGet publication status is reconciled independently",
    r"\| NuGet(?:\.org)? \| \*\*(?:OPEN|Status reconciled independently)\*\*",
    r"not yet claimed as a publicly published NuGet release",
    r"\[ \] NuGet\.org publication evidence",
]
stale = []
for p in CURRENT + [Path("sdk/release/PUBLISHING.md"), Path("spec/compatibility/matrix.md")]:
    if not p.exists():
        continue
    text = p.read_text()
    for pat in stale_patterns:
        if re.search(pat, text, re.I):
            stale.append((p.as_posix(), pat))
if stale:
    raise SystemExit("stale current NuGet documentation remains: " + repr(stale))

print("TRUYN_NUGET_CURRENT_MAIN_RECONCILIATION=PASS")
