#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST="$ROOT/sdk/release/dist"
VERSION="0.1.0-alpha.1"

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
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}.jar" "$DIST/java/"
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}-sources.jar" "$DIST/java/"
cp "$ROOT/sdk/java/target/truyn-sdk-${VERSION}-javadoc.jar" "$DIST/java/"
cp "$ROOT/sdk/java/pom.xml" "$DIST/java/truyn-sdk-${VERSION}.pom"

dotnet pack "$ROOT/sdk/dotnet/Truyn.Sdk.csproj" --configuration Release --nologo --output "$DIST/dotnet"

node "$ROOT/sdk/release/write-manifest.mjs" "$DIST"
node "$ROOT/sdk/release/verify-release.mjs" "$DIST"
