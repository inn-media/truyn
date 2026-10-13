#!/usr/bin/env bash
set -Eeuo pipefail
# Only install the archives already byte-verified by the caller. No registry
# publication, private-key extraction, old-version mutation or provider calls.
: "${TRUYN_PACKAGED_STAGE:?}"
: "${TRUYN_PACKAGE_DIST:?}"
: "${GITHUB_WORKSPACE:?}"
root="$GITHUB_WORKSPACE"
version="$(node -p "require('./sdk/release/version.json').release")"
npm_version="$(node -p "require('./sdk/release/version.json').typescript")"
py_version="$(node -p "require('./sdk/release/version.json').python")"
mkdir -p "$TRUYN_PACKAGED_STAGE/npm" "$TRUYN_PACKAGED_STAGE/go-library"
npm install --prefix "$TRUYN_PACKAGED_STAGE/npm" --ignore-scripts --no-audit --no-fund "$TRUYN_PACKAGE_DIST/typescript/truyn-sdk-$npm_version.tgz"
python -m venv "$TRUYN_PACKAGED_STAGE/python-package"
"$TRUYN_PACKAGED_STAGE/python-package/bin/python" -m pip install --disable-pip-version-check "$TRUYN_PACKAGE_DIST/python/truyn_sdk-$py_version-py3-none-any.whl"
python -m venv "$TRUYN_PACKAGED_STAGE/python-source"
"$TRUYN_PACKAGED_STAGE/python-source/bin/python" -m pip install --disable-pip-version-check -e "$root/sdk/python"
python sdk/release/safe-extract.py "$TRUYN_PACKAGE_DIST/go/truyn-sdk-go-$version.tar.gz" "$TRUYN_PACKAGED_STAGE/go-library"
for mode in legacy candidate; do
  directory="$TRUYN_PACKAGED_STAGE/go-role-$mode"
  mkdir -p "$directory"
  cp sdk/conformance/lifecycle-peer/peer.go "$directory/main.go"
  library="$root/sdk/go"; [[ "$mode" != legacy ]] || library="$TRUYN_PACKAGED_STAGE/go-library"
  (cd "$directory"; go mod init "example.com/native-package-$mode"; go mod edit -replace "github.com/inn-media/truyn/sdk/go=$library"; go get github.com/inn-media/truyn/sdk/go; go build -o "/tmp/truyn-lifecycle-$mode-go" main.go)
  mkdir -p "/tmp/truyn-lifecycle-$mode-java"
  cp="$root/sdk/java/target/classes"; [[ "$mode" != legacy ]] || cp="$TRUYN_PACKAGE_DIST/java/truyn-sdk-$version.jar"
  javac -cp "$cp" -d "/tmp/truyn-lifecycle-$mode-java" sdk/conformance/lifecycle-peer/java/LifecyclePeer.java
 done
export NUGET_PACKAGES="$TRUYN_PACKAGED_STAGE/nuget-cache"
dotnet restore sdk/conformance/lifecycle-peer/dotnet/legacy/LegacyLifecycle.csproj "-p:TruynLifecyclePackageVersion=$version" "-p:RestoreAdditionalProjectSources=$TRUYN_PACKAGE_DIST/dotnet"
# Reject a same-coordinate remote package or stale cache before loading its DLL.
cmp "$TRUYN_PACKAGE_DIST/dotnet/Truyn.Sdk.$version.nupkg" "$NUGET_PACKAGES/truyn.sdk/$version/truyn.sdk.$version.nupkg"
dotnet build sdk/conformance/lifecycle-peer/dotnet/legacy/LegacyLifecycle.csproj --configuration Release --nologo --no-restore "-p:TruynLifecyclePackageVersion=$version"
dotnet build sdk/conformance/lifecycle-peer/dotnet/candidate/CandidateLifecycle.csproj --configuration Release --nologo
