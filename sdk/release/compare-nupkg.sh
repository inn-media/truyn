#!/usr/bin/env bash
# Compare a CI-built .nupkg with the copy served by nuget.org.
# nuget.org repository-signs every package by adding `.signature.p7s`, so the container bytes
# differ by design. Every other entry must be present in both and byte-identical.
#
# Usage: compare-nupkg.sh <ci.nupkg> <registry.nupkg>
set -euo pipefail
ci="${1:?ci nupkg}"; registry="${2:?registry nupkg}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
unzip -q "$ci" -d "$work/ci"
unzip -q "$registry" -d "$work/registry"
rm -f "$work/registry/.signature.p7s"
test ! -e "$work/ci/.signature.p7s" || { echo "CI package unexpectedly carries a signature" >&2; exit 1; }
diff -r "$work/ci" "$work/registry"
echo "NUPKG_CONTENT_IDENTITY=PASS"
