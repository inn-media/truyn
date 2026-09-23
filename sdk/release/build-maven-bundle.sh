#!/usr/bin/env bash
# Build a Maven Central Portal upload bundle from the EXACT CI-built Java artifacts.
#
# Usage: build-maven-bundle.sh <ci-dist-dir> <version> <out.zip>
#
# Input  (from sdk/release/build-release.sh, CI artifact truyn-sdk-release-<run>):
#   <ci-dist-dir>/java/truyn-sdk-<v>.jar, -sources.jar, -javadoc.jar, truyn-sdk-<v>.pom
# Output: a zip in Maven repository layout org/truyn/truyn-sdk/<v>/ containing every
#   file plus .asc (detached ASCII-armoured OpenPGP signature), .md5 and .sha1
#   (required by Central), and .sha256/.sha512.
#
# Signing key: must already be imported into the active GNUPGHOME. Set
#   MAVEN_GPG_KEY_ID      — long key id / fingerprint to sign with (required)
#   MAVEN_GPG_PASSPHRASE  — passphrase (optional; read from env, never from argv)
#
# The script never rebuilds or modifies the jars: bytes on Central == bytes CI tested.
set -euo pipefail

dist="${1:?ci dist dir}"
version="${2:?version}"
out="${3:?output zip}"
: "${MAVEN_GPG_KEY_ID:?MAVEN_GPG_KEY_ID is required}"

group_path="org/truyn"
artifact="truyn-sdk"
src="$dist/java"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
dest="$work/$group_path/$artifact/$version"
mkdir -p "$dest"

files=(
  "$artifact-$version.jar"
  "$artifact-$version-sources.jar"
  "$artifact-$version-javadoc.jar"
  "$artifact-$version.pom"
)

for f in "${files[@]}"; do
  test -s "$src/$f" || { echo "missing CI artifact: java/$f" >&2; exit 1; }
  cp "$src/$f" "$dest/$f"
done

# The POM must declare exactly the coordinate being published.
pom="$dest/$artifact-$version.pom"
grep -q "<groupId>org.truyn</groupId>" "$pom"
grep -q "<artifactId>$artifact</artifactId>" "$pom"
grep -q "<version>$version</version>" "$pom"

sign() {
  if [[ -n "${MAVEN_GPG_PASSPHRASE:-}" ]]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
      --local-user "$MAVEN_GPG_KEY_ID" --armor --detach-sign --output "$1.asc" "$1" <<<"$MAVEN_GPG_PASSPHRASE"
  else
    gpg --batch --yes --local-user "$MAVEN_GPG_KEY_ID" --armor --detach-sign --output "$1.asc" "$1"
  fi
  gpg --batch --verify "$1.asc" "$1" 2>/dev/null
}

for f in "${files[@]}"; do
  p="$dest/$f"
  sign "$p"
  md5sum    "$p" | awk '{printf "%s", $1}' > "$p.md5"
  sha1sum   "$p" | awk '{printf "%s", $1}' > "$p.sha1"
  sha256sum "$p" | awk '{printf "%s", $1}' > "$p.sha256"
  sha512sum "$p" | awk '{printf "%s", $1}' > "$p.sha512"
done

rm -f "$out"
out_abs="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
# Deterministic ordering and timestamps for the bundle container.
(cd "$work" && find . -type f -print | LC_ALL=C sort | sed 's#^\./##' \
  | TZ=UTC xargs touch -d '1980-01-01T00:00:00' \
  && find . -type f -print | LC_ALL=C sort | sed 's#^\./##' | zip -q -X -@ "$out_abs")

unzip -Z1 "$out_abs"
