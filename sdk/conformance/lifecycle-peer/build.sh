#!/usr/bin/env bash
set -Eeuo pipefail
# Only roles are compiled here. Verified public packages were installed by the
# existing exact-byte gate; no package is patched, overwritten or published.
for mode in legacy candidate; do
  test -d "/tmp/truyn-wire-go-$mode"
  cp sdk/conformance/lifecycle-peer/peer.go "/tmp/truyn-wire-go-$mode/lifecycle.go"
  (cd "/tmp/truyn-wire-go-$mode" && go build -o "/tmp/truyn-lifecycle-$mode-go" lifecycle.go)
  mkdir -p "/tmp/truyn-lifecycle-$mode-java"
  if [[ "$mode" = legacy ]]; then cp="$TRUYN_LEGACY_JAVA_CP"; else cp="$TRUYN_CANDIDATE_JAVA_CP"; fi
  javac -cp "$cp" -d "/tmp/truyn-lifecycle-$mode-java" sdk/conformance/lifecycle-peer/java/LifecyclePeer.java
  project=sdk/conformance/lifecycle-peer/dotnet/$mode
  dotnet build "$project/$(if [[ "$mode" = legacy ]]; then echo LegacyLifecycle; else echo CandidateLifecycle; fi).csproj" --configuration Release --nologo
 done
