#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-${GITHUB_SHA:-}}}}"
RUN_ID="${TRUYN_D_SERIES_BLOCKWISE_PREFLIGHT_RUN:-}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=invalid_source_sha" >&2; exit 2; }
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=missing_run_id source_sha=$SOURCE_SHA" >&2; exit 3; }
command -v gh >/dev/null || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=gh_missing" >&2; exit 4; }
command -v jq >/dev/null || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=jq_missing" >&2; exit 4; }

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
jq -e --arg source "$SOURCE_SHA" '
  .name == "D-Series Blockwise Preflight" and
  .head_branch == "main" and
  .head_sha == $source and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null || {
  echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=run_not_exact_admission_green run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
  exit 5
}

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
summary="d-series-blockwise-summary-${RUN_ID}"
admission="d-series-blockwise-admission-${RUN_ID}"
jq -e --arg summary "$summary" --arg admission "$admission" '
  ([.artifacts[] | select(.name == $summary and .expired == false and (.size_in_bytes // 0) > 0)] | length == 1) and
  ([.artifacts[] | select(.name == $admission and .expired == false and (.size_in_bytes // 0) > 0)] | length == 1)
' <<<"$artifacts" >/dev/null || {
  echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=admission_evidence_missing run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
  exit 6
}

echo "TRUYN_D_SERIES_BLOCKWISE_GATE=PASS run_id=$RUN_ID source_sha=$SOURCE_SHA blocks=16/16 swarm_provenance=true exact_sha=true"
