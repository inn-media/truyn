#!/usr/bin/env bash
set -Eeuo pipefail

CANDIDATE_SHA="${1:-${TESTED_COMMIT:-}}"
RUN_ID="${TRUYN_D_SERIES_ADMISSION_RUN:-}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"

[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=invalid_candidate_sha' >&2; exit 2; }
[[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || { echo 'TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=missing_admission_run' >&2; exit 3; }
command -v gh >/dev/null || { echo 'TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=gh_missing' >&2; exit 4; }
command -v jq >/dev/null || { echo 'TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=jq_missing' >&2; exit 4; }

run="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}")"
jq -e '
  .name == "D-Series Admission Gate" and
  .path == ".github/workflows/d-series-admission-gate.yml" and
  .status == "completed" and
  .conclusion == "success" and
  .run_attempt == 1
' <<<"$run" >/dev/null || {
  echo "TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=admission_run_not_green run_id=$RUN_ID" >&2
  exit 5
}

artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts?per_page=100")"
artifact_name="d-series-admission-${RUN_ID}"
count="$(jq -r --arg n "$artifact_name" '[.artifacts[] | select(.name==$n and .expired==false and (.size_in_bytes//0)>0)] | length' <<<"$artifacts")"
[[ "$count" == 1 ]] || {
  echo "TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=admission_artifact_missing run_id=$RUN_ID" >&2
  exit 6
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh run download "$RUN_ID" -R "$REPOSITORY" -n "$artifact_name" -D "$tmp" >/dev/null
plan="$tmp/d-series-admission-final.json"
[[ -s "$plan" ]] || { echo 'TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=final_plan_missing' >&2; exit 6; }

main_sha="$(gh api "repos/${REPOSITORY}/commits/main" --jq .sha)"
jq -e --arg candidate "$CANDIDATE_SHA" --arg main "$main_sha" '
  .schema == "truyn.d-series.admission-plan.v1" and
  .candidateSha == $candidate and
  .currentMainSha == $main and
  (.integrationTreeSha | test("^[0-9a-f]{40}$")) and
  (
    (.decision == "ADMIT_WITH_FROZEN_EVIDENCE" and (.affectedBlocks|length)==0) or
    (.decision == "ADMIT_AFTER_TARGETED_REQUALIFICATION" and (.affectedBlocks|length)>0 and .targetedRequalification.required==true and .targetedRequalification.passed==true and ((.targetedRequalification.passedBlocks|sort) == (.affectedBlocks|sort)))
  )
' "$plan" >/dev/null || {
  echo "TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=stale_or_invalid_final_plan run_id=$RUN_ID candidate=$CANDIDATE_SHA current_main=$main_sha" >&2
  exit 7
}

echo "TRUYN_D_SERIES_ADMISSION_GATE=PASS run_id=$RUN_ID candidate=$CANDIDATE_SHA current_main=$main_sha decision=$(jq -r .decision "$plan") integration_tree=$(jq -r .integrationTreeSha "$plan")"
