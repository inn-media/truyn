#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-${GITHUB_SHA:-}}}}"
RUN_ID="${TRUYN_D_SERIES_SWARM_RUN:-}"
EXPECTED_SCALE="${TRUYN_D_SERIES_SWARM_SCALE:-all}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"
CALLER_WORKFLOW=".github/workflows/d-series-swarm-one-shot-launcher.yml"
REQUEST_PATH=".github/d-series-dispatch/request.env"

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=invalid_source_sha" >&2; exit 2; }
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=missing_run_id source_sha=$SOURCE_SHA" >&2; exit 3; }
case "$EXPECTED_SCALE" in all|d200|d500|d1000) ;; *) echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=invalid_scale scale=$EXPECTED_SCALE" >&2; exit 3 ;; esac
command -v gh >/dev/null || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=gh_missing" >&2; exit 4; }
command -v jq >/dev/null || { echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=jq_missing" >&2; exit 4; }

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
provenance=''

if jq -e --arg source "$SOURCE_SHA" '
  .name == "D-Series Sanitation Swarm" and
  .path == ".github/workflows/d200-bug-hunt.yml" and
  .head_sha == $source and
  ((.head_commit.id // .head_sha) == $source) and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null; then
  provenance=direct-workflow-dispatch
else
  expected_branch="automation/d-series-dispatch/${SOURCE_SHA:0:8}-${EXPECTED_SCALE}-swarm"
  jq -e --arg branch "$expected_branch" --arg workflow "$CALLER_WORKFLOW" '
    .name == "D-Series Swarm One-Shot Launcher" and
    .path == $workflow and
    .head_branch == $branch and
    .event == "push" and
    .status == "completed" and
    .conclusion == "success" and
    .run_attempt == 1 and
    .head_repository.id == .repository.id
  ' <<<"$run" >/dev/null || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=run_not_exact_green run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
    exit 5
  }

  head_sha="$(jq -r '.head_sha // empty' <<<"$run")"
  [[ "$head_sha" =~ ^[0-9a-f]{40}$ && "$head_sha" != "$SOURCE_SHA" ]] || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=invalid_caller_head run_id=$RUN_ID head_sha=${head_sha:-missing}" >&2
    exit 5
  }

  commit="$(gh api "repos/${REPOSITORY}/commits/${head_sha}")"
  jq -e --arg source "$SOURCE_SHA" '(.parents | length) == 1 and .parents[0].sha == $source' <<<"$commit" >/dev/null || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=caller_parent_not_source run_id=$RUN_ID source_sha=$SOURCE_SHA head_sha=$head_sha" >&2
    exit 5
  }

  comparison="$(gh api "repos/${REPOSITORY}/compare/${SOURCE_SHA}...${head_sha}")"
  jq -e --arg request "$REQUEST_PATH" '
    .status == "ahead" and
    .ahead_by == 1 and
    .total_commits == 1 and
    (.files | length) == 1 and
    .files[0].filename == $request and
    (.files[0].status == "added" or .files[0].status == "modified")
  ' <<<"$comparison" >/dev/null || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=caller_delta_not_single_request run_id=$RUN_ID source_sha=$SOURCE_SHA head_sha=$head_sha" >&2
    exit 5
  }

  request_b64="$(gh api "repos/${REPOSITORY}/contents/${REQUEST_PATH}?ref=${head_sha}" --jq '.content // empty' | tr -d '\n')"
  [[ -n "$request_b64" ]] || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=caller_request_missing run_id=$RUN_ID" >&2
    exit 5
  }
  request="$(printf '%s' "$request_b64" | base64 --decode)"
  expected_request="$(printf 'SOURCE_SHA=%s\nSCALE=%s\nMODE=swarm' "$SOURCE_SHA" "$EXPECTED_SCALE")"
  [[ "$request" == "$expected_request" ]] || {
    echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=caller_request_mismatch run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE" >&2
    exit 5
  }
  provenance=canonical-reusable-caller
fi

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
expected="d-series-swarm-summary-${EXPECTED_SCALE}-${RUN_ID}"
fallback="d-series-swarm-summary-all-${RUN_ID}"
jq -e --arg expected "$expected" --arg fallback "$fallback" '
  [.artifacts[] | select((.name == $expected or .name == $fallback) and .expired == false and (.size_in_bytes // 0) > 0)] | length >= 1
' <<<"$artifacts" >/dev/null || {
  echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=summary_artifact_missing run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE" >&2
  exit 6
}

echo "TRUYN_D_SERIES_SWARM_GATE=PASS run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE exact_sha=true provenance=$provenance"
