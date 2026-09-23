from pathlib import Path

p = Path('docs/getting-started/DX3_SDK.md')
s = p.read_text()
s = s.replace(
    'Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` and NuGet.org `Truyn.Sdk 0.1.0-alpha.1` remain open publication gates.',
    'Maven Central `org.truyn:truyn-sdk:0.1.0-alpha.1` remains an open publication gate; NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease.'
)
s = s.replace(
    'Java/Maven Central and C#/.NET/NuGet.org remain open public-distribution gates.',
    'Java/Maven Central remains an open public-distribution gate; C#/.NET/NuGet.org `Truyn.Sdk 0.1.0-alpha.1` is an accepted immutable public prerelease.'
)
s = s.replace(
    '- Maven Central and NuGet.org immutable public publication with observed provenance;',
    '- Maven Central immutable public publication with observed provenance;'
)
p.write_text(s)
