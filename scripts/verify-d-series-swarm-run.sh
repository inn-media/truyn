#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-${GITHUB_SHA:-}}}}"
RUN_ID="${TRUYN_D_SERIES_SWARM_RUN:-}"
EXPECTED_SCALE="${TRUYN_D_SERIES_SWARM_SCALE:-all}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=invalid_source_sha" >&2; exit 2; }
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=missing_run_id source_sha=$SOURCE_SHA" >&2; exit 3; }
case "$EXPECTED_SCALE" in all|d200|d500|d1000) ;; *) echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=invalid_scale scale=$EXPECTED_SCALE" >&2; exit 3 ;; esac
command -v gh >/dev/null || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=gh_missing" >&2; exit 4; }
command -v jq >/dev/null || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=jq_missing" >&2; exit 4; }

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
jq -e --arg source "$SOURCE_SHA" '
  .name == "D-Series Sanitation Swarm" and
  .head_branch == "main" and
  .head_sha == $source and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null || {
  echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=run_not_exact_green run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
  exit 5
}

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
expected="d-series-swarm-summary-${EXPECTED_SCALE}-${RUN_ID}"
fallback="d-series-swarm-summary-all-${RUN_ID}"
jq -e --arg expected "$expected" --arg fallback "$fallback" '
  [.artifacts[] | select((.name == $expected or .name == $fallback) and .expired == false and (.size_in_bytes // 0) > 0)] | length >= 1
' <<<"$artifacts" >/dev/null || {
  echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=summary_artifact_missing run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE" >&2
  exit 6
}

echo "TRUYN_D_SERIES_SWARM_GATE=PASS run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE exact_sha=true"
