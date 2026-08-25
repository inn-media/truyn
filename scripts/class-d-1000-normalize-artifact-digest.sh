#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib/sha256-digest.sh"

RAW_DIGEST="${1:?usage: class-d-1000-normalize-artifact-digest.sh ARTIFACT_DIGEST}"
CANONICAL_DIGEST="$(truyn_normalize_sha256_digest "$RAW_DIGEST")"

printf '%s\n' "$CANONICAL_DIGEST"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'artifact_digest=%s\n' "$CANONICAL_DIGEST" >>"$GITHUB_OUTPUT"
fi
