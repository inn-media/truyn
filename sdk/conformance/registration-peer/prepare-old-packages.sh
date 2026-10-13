#!/usr/bin/env bash
set -Eeuo pipefail
: "${TRUYN_OLD_NEW_STAGE:?}"
: "${GITHUB_WORKSPACE:?}"
root="$GITHUB_WORKSPACE"
stage="$TRUYN_OLD_NEW_STAGE"
mkdir -p "$stage/downloads" "$stage/receipts" "$stage/old-npm" "$stage/old-go" "$stage/old-java"
npm pack '@truyn/sdk@0.1.0-alpha.5' --ignore-scripts --pack-destination "$stage/downloads" --json > "$stage/downloads/npm.json"
python3 scripts/verify-five-sdk-interop.py artifact typescript "$stage/downloads/truyn-sdk-0.1.0-alpha.5.tgz" --output "$stage/receipts/typescript.json"
npm install --prefix "$stage/old-npm" --ignore-scripts --no-audit --no-fund "$stage/downloads/truyn-sdk-0.1.0-alpha.5.tgz"
python -m venv "$stage/old-python"
"$stage/old-python/bin/pip" download --disable-pip-version-check --no-deps --only-binary=:all: --dest "$stage/downloads" 'truyn-sdk==0.1.0a2'
python3 scripts/verify-five-sdk-interop.py artifact python "$stage/downloads/truyn_sdk-0.1.0a2-py3-none-any.whl" --output "$stage/receipts/python.json"
"$stage/old-python/bin/pip" install --disable-pip-version-check "$stage/downloads/truyn_sdk-0.1.0a2-py3-none-any.whl"
cp sdk/conformance/lifecycle-peer/peer.go "$stage/old-go/main.go"
(
  cd "$stage/old-go"
  go mod init example.com/truyn-exact-old-package
  go get github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2
  go mod download -json github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2 > "$stage/downloads/go.json"
  archive="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["Zip"])' "$stage/downloads/go.json")"
  python3 "$root/scripts/verify-five-sdk-interop.py" artifact go "$archive" --output "$stage/receipts/go.json"
  go build -o "$stage/old-go/peer" main.go
)
mvn -q dependency:get -Dartifact=org.truyn:truyn-sdk:0.1.0-alpha.2 -Dtransitive=false
old_jar="$HOME/.m2/repository/org/truyn/truyn-sdk/0.1.0-alpha.2/truyn-sdk-0.1.0-alpha.2.jar"
python3 scripts/verify-five-sdk-interop.py artifact java "$old_jar" --output "$stage/receipts/java.json"
cp "$old_jar" "$stage/old-java/sdk.jar"
javac -cp "$stage/old-java/sdk.jar" -d "$stage/old-java" sdk/conformance/lifecycle-peer/java/LifecyclePeer.java
export NUGET_PACKAGES="$stage/old-nuget"
project=sdk/conformance/lifecycle-peer/dotnet/legacy/LegacyLifecycle.csproj
dotnet restore "$project" -p:TruynLifecyclePackageVersion=0.1.0-alpha.2
archive="$NUGET_PACKAGES/truyn.sdk/0.1.0-alpha.2/truyn.sdk.0.1.0-alpha.2.nupkg"
dotnet nuget verify "$archive" --all
python3 scripts/verify-five-sdk-interop.py artifact dotnet "$archive" --output "$stage/receipts/dotnet.json"
dotnet build "$project" --configuration Release --nologo --no-restore -p:TruynLifecyclePackageVersion=0.1.0-alpha.2
