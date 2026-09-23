#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-${GITHUB_SHA:-}}}}"
RUN_ID="${TRUYN_D_SERIES_SWARM_RUN:-}"
EXPECTED_SCALE="${TRUYN_D_SERIES_SWARM_SCALE:-all}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"

fail() {
  echo "TRUYN_D_SERIES_SWARM_GATE=FAIL reason=$1 run_id=${RUN_ID:-missing} source_sha=${SOURCE_SHA:-missing} scale=${EXPECTED_SCALE:-missing}" >&2
  exit "${2:-5}"
}

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail invalid_source_sha 2
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || fail missing_run_id 3
case "$EXPECTED_SCALE" in all|d200|d500|d1000) ;; *) fail invalid_scale 3 ;; esac
command -v gh >/dev/null || fail gh_missing 4
command -v jq >/dev/null || fail jq_missing 4
command -v base64 >/dev/null || fail base64_missing 4

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
jq -e '
  .name == "D-Series Sanitation Swarm" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null || fail run_not_green

event="$(jq -r '.event' <<<"$run")"
case "$event" in
  workflow_dispatch)
    jq -e --arg source "$SOURCE_SHA" '
      .path == ".github/workflows/d200-bug-hunt.yml" and
      .head_branch == "main" and
      .head_sha == $source
    ' <<<"$run" >/dev/null || fail manual_run_not_exact
    ;;
  push)
    [[ "$EXPECTED_SCALE" == d500 ]] || fail launch_scale_must_be_d500
    jq -e '
      .path == ".github/workflows/d500-swarm-launch.yml" and
      (.head_branch | startswith("d-series-launch/swarm-d500/"))
    ' <<<"$run" >/dev/null || fail launch_run_identity_invalid

    launch_sha="$(jq -r '.head_sha' <<<"$run")"
    [[ "$launch_sha" =~ ^[0-9a-f]{40}$ ]] || fail launch_sha_invalid
    commit="$(gh api "repos/${REPOSITORY}/commits/${launch_sha}")"
    jq -e --arg source "$SOURCE_SHA" '
      (.parents | length) == 1 and
      .parents[0].sha == $source and
      (.files | length) == 1 and
      .files[0].status == "added" and
      (.files[0].filename | test("^\\.github/d-series-launch/swarm-d500-[A-Za-z0-9._-]+\\.txt$"))
    ' <<<"$commit" >/dev/null || fail launch_commit_provenance_invalid

    token_path="$(jq -r '.files[0].filename' <<<"$commit")"
    token_b64="$(gh api "repos/${REPOSITORY}/contents/${token_path}?ref=${launch_sha}" --jq .content | tr -d '\n')"
    token="$(printf '%s' "$token_b64" | base64 -d)"
    [[ "$(sed -n 's/^MODE=//p' <<<"$token" | tail -1)" == swarm ]] || fail launch_token_mode_invalid
    [[ "$(sed -n 's/^SCALE=//p' <<<"$token" | tail -1)" == d500 ]] || fail launch_token_scale_invalid
    [[ "$(sed -n 's/^SOURCE_SHA=//p' <<<"$token" | tail -1)" == "$SOURCE_SHA" ]] || fail launch_token_source_invalid
    [[ "$(grep -Ec '^(MODE|SCALE|SOURCE_SHA)=' <<<"$token")" -eq 3 ]] || fail launch_token_shape_invalid
    ;;
  *)
    fail unsupported_event
    ;;
esac

main_sha="$(gh api "repos/${REPOSITORY}/commits/main" --jq .sha)"
[[ "$main_sha" == "$SOURCE_SHA" ]] || fail source_not_current_main

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
expected="d-series-swarm-summary-${EXPECTED_SCALE}-${RUN_ID}"
fallback="d-series-swarm-summary-all-${RUN_ID}"
jq -e --arg expected "$expected" --arg fallback "$fallback" '
  [.artifacts[] | select((.name == $expected or .name == $fallback) and .expired == false and (.size_in_bytes // 0) > 0)] | length >= 1
' <<<"$artifacts" >/dev/null || fail summary_artifact_missing 6

echo "TRUYN_D_SERIES_SWARM_GATE=PASS run_id=$RUN_ID source_sha=$SOURCE_SHA scale=$EXPECTED_SCALE event=$event exact_sha=true"
