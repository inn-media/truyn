#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST="$ROOT/sdk/release/dist"
VERSION="$(node -p "require('$ROOT/sdk/release/version.json').release")"

rm -rf "$DIST" "$ROOT/sdk/typescript/dist" "$ROOT/sdk/python/dist" "$ROOT/sdk/java/target" "$ROOT/sdk/dotnet/bin" "$ROOT/sdk/dotnet/obj"
mkdir -p "$DIST"/{typescript,python,go,java,dotnet}

python -m pip install --disable-pip-version-check --quiet build==1.5.0

(
  cd "$ROOT/sdk/typescript"
  npm install --ignore-scripts --no-audit --no-fund
  npm run build
  npm pack --silent --pack-destination "$DIST/typescript" >/dev/null
)

python -m build --outdir "$DIST/python" "$ROOT/sdk/python"

tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --exclude='./.DS_Store' --exclude='./dist' --exclude='./node_modules' \
  -czf "$DIST/go/truyn-sdk-go-${VERSION}.tar.gz" -C "$ROOT/sdk/go" .

mvn -q -f "$ROOT/sdk/java/pom.xml" package
# Attach the required distribution license notices to the Javadoc archive,
# then manifest and publish precisely these CI-qualified archive bytes.
jar uf "$ROOT/sdk/java/target/truyn-sdk-${VERSION}-javadoc.jar" \
  -C "$ROOT/sdk" LICENSE \
  -C "$ROOT/sdk" NOTICE
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}.jar" "$DIST/java/"
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}-sources.jar" "$DIST/java/"
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}-javadoc.jar" "$DIST/java/"
cp "$ROOT/sdk/java/pom.xml" "$DIST/java/truyn-sdk-${VERSION}.pom"

dotnet pack "$ROOT/sdk/dotnet/Truyn.Sdk.csproj" --configuration Release -p:PackageOutputPath="$DIST/dotnet"

node "$ROOT/sdk/release/write-manifest.mjs" "$DIST"
node "$ROOT/sdk/release/verify-release.mjs" "$DIST"
bash "$ROOT/sdk/release/verify-public-maven.sh"
bash "$ROOT/sdk/release/verify-public-nuget.sh"

# Qualify the exact CI archive bytes, not a fresh later rebuild. Local builds
# without Actions identity remain builds only, never accepted public releases.
if [[ -f "$ROOT/sdk/release/native-successor-candidate.json" && "${GITHUB_ACTIONS:-}" == 'true' ]]; then
  node "$ROOT/sdk/conformance/lifecycle-peer/qualify-packaged-successor.mjs"
fi
