#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-${GITHUB_SHA:-}}}}"
RUN_ID="${TRUYN_D_SERIES_BLOCKWISE_PREFLIGHT_RUN:-}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"
CALLER_WORKFLOW=".github/workflows/d-series-blockwise-one-shot-launcher.yml"
REQUEST_PATH=".github/d-series-blockwise-dispatch/request.env"

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=invalid_source_sha" >&2; exit 2; }
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=missing_run_id source_sha=$SOURCE_SHA" >&2; exit 3; }
command -v gh >/dev/null || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=gh_missing" >&2; exit 4; }
command -v jq >/dev/null || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=jq_missing" >&2; exit 4; }

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
provenance=''
legacy_admission=false

if jq -e --arg source "$SOURCE_SHA" '
  .name == "D-Series Blockwise Preflight" and
  .path == ".github/workflows/d-series-blockwise-preflight.yml" and
  .head_branch == "main" and
  .head_sha == $source and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null; then
  provenance=direct-workflow-dispatch
  legacy_admission=true
elif jq -e --arg source "$SOURCE_SHA" '
  .name == "D-Series Blockwise Preflight" and
  .path == ".github/workflows/d-series-blockwise-preflight.yml" and
  ((.pull_requests[0].head.sha // .head_sha) == $source) and
  .event == "pull_request" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null; then
  provenance=frozen-candidate-pull-request
else
  jq -e --arg workflow "$CALLER_WORKFLOW" '
    .name == "D-Series Blockwise One-Shot Launcher" and
    .path == $workflow and
    (.head_branch | startswith("automation/d-series-blockwise/")) and
    .event == "push" and
    .status == "completed" and
    .conclusion == "success" and
    .run_attempt == 1 and
    .head_repository.id == .repository.id
  ' <<<"$run" >/dev/null || {
    echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=run_not_exact_admission_green run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
    exit 5
  }

  head_sha="$(jq -r '.head_sha // empty' <<<"$run")"
  branch="$(jq -r '.head_branch // empty' <<<"$run")"
  [[ "$head_sha" =~ ^[0-9a-f]{40}$ && "$head_sha" != "$SOURCE_SHA" ]] || {
    echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=invalid_caller_head run_id=$RUN_ID head_sha=${head_sha:-missing}" >&2
    exit 5
  }

  commit="$(gh api "repos/${REPOSITORY}/commits/${head_sha}")"
  jq -e --arg source "$SOURCE_SHA" '(.parents | length) == 1 and .parents[0].sha == $source' <<<"$commit" >/dev/null || {
    echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_parent_not_exact_main run_id=$RUN_ID source_sha=$SOURCE_SHA head_sha=$head_sha" >&2
    exit 5
  }

  comparison="$(gh api "repos/${REPOSITORY}/compare/${SOURCE_SHA}...${head_sha}")"
  jq -e --arg request "$REQUEST_PATH" '
    .status == "ahead" and .ahead_by == 1 and .total_commits == 1 and
    (.files | length) == 1 and .files[0].filename == $request and
    (.files[0].status == "added" or .files[0].status == "modified")
  ' <<<"$comparison" >/dev/null || {
    echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_delta_not_single_request run_id=$RUN_ID source_sha=$SOURCE_SHA head_sha=$head_sha" >&2
    exit 5
  }

  request_b64="$(gh api "repos/${REPOSITORY}/contents/${REQUEST_PATH}?ref=${head_sha}" --jq '.content // empty' | tr -d '\n')"
  [[ -n "$request_b64" ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_request_missing run_id=$RUN_ID" >&2; exit 5; }
  request="$(printf '%s' "$request_b64" | base64 --decode)"
  request_source="$(sed -n 's/^SOURCE_SHA=//p' <<<"$request")"
  scale="$(sed -n 's/^SCALE=//p' <<<"$request")"
  mode="$(sed -n 's/^MODE=//p' <<<"$request")"
  swarm_run_id="$(sed -n 's/^SWARM_RUN_ID=//p' <<<"$request")"
  [[ "$request_source" == "$SOURCE_SHA" ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_request_source_mismatch" >&2; exit 5; }
  case "$scale" in all|d200|d500|d1000) ;; *) echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_request_scale_invalid" >&2; exit 5 ;; esac
  [[ "$mode" == blockwise ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_request_mode_mismatch" >&2; exit 5; }
  [[ "$swarm_run_id" =~ ^[1-9][0-9]+$ ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_swarm_run_invalid" >&2; exit 5; }
  expected_request="$(printf 'SOURCE_SHA=%s\nSCALE=%s\nMODE=blockwise\nSWARM_RUN_ID=%s' "$SOURCE_SHA" "$scale" "$swarm_run_id")"
  [[ "$request" == "$expected_request" ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_request_mismatch" >&2; exit 5; }
  expected_branch="automation/d-series-blockwise/${SOURCE_SHA:0:8}-${scale}-${swarm_run_id}"
  [[ "$branch" == "$expected_branch" ]] || { echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=caller_branch_mismatch" >&2; exit 5; }

  TRUYN_D_SERIES_SWARM_RUN="$swarm_run_id" TRUYN_D_SERIES_SWARM_SCALE="$scale" \
    bash scripts/verify-d-series-swarm-run.sh "$SOURCE_SHA"
  provenance=canonical-reusable-caller
  legacy_admission=true
fi

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
summary="d-series-blockwise-summary-${RUN_ID}"
jq -e --arg summary "$summary" '([.artifacts[] | select(.name == $summary and .expired == false and (.size_in_bytes // 0) > 0)] | length == 1)' <<<"$artifacts" >/dev/null || {
  echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=summary_evidence_missing run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
  exit 6
}

if [[ "$legacy_admission" == true ]]; then
  admission="d-series-blockwise-admission-${RUN_ID}"
  jq -e --arg admission "$admission" '([.artifacts[] | select(.name == $admission and .expired == false and (.size_in_bytes // 0) > 0)] | length == 1)' <<<"$artifacts" >/dev/null || {
    echo "TRUYN_D_SERIES_BLOCKWISE_GATE=FAIL reason=admission_evidence_missing run_id=$RUN_ID source_sha=$SOURCE_SHA" >&2
    exit 6
  }
fi

# Expensive evidence belongs to the frozen candidate; merge/launch authority comes only from fresh integration Admission.
bash scripts/verify-d-series-admission-run.sh "$SOURCE_SHA"

echo "TRUYN_D_SERIES_BLOCKWISE_GATE=PASS run_id=$RUN_ID source_sha=$SOURCE_SHA blocks=16/16 swarm_provenance=true exact_sha=true admission=true provenance=$provenance"
