#!/usr/bin/env bash

truyn_normalize_sha256_digest() {
  local raw="${1:-}" hex
  hex="${raw#sha256:}"
  [[ "$hex" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
  printf 'sha256:%s\n' "${hex,,}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  truyn_normalize_sha256_digest "${1:-}"
fi
