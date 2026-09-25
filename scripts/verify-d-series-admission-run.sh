#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_SHA="${1:-${TRUYN_CLASS_D_SOURCE_SHA:-${TESTED_COMMIT:-}}}"
RUN_ID="${TRUYN_D_SERIES_ADMISSION_RUN:-}"
REPOSITORY="${GITHUB_REPOSITORY:-inn-media/truyn}"
POLICY="config/d-series-frozen-candidate-policy.json"

fail() {
  echo "TRUYN_D_SERIES_ADMISSION_GATE=FAIL reason=$1${2:+ $2}" >&2
  exit "${3:-1}"
}

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail invalid_candidate_sha "candidate=$SOURCE_SHA" 2
command -v gh >/dev/null || fail gh_missing "" 3
command -v jq >/dev/null || fail jq_missing "" 3
command -v unzip >/dev/null || fail unzip_missing "" 3
[[ -s "$POLICY" ]] || fail policy_missing
node scripts/verify-d-series-frozen-candidate-policy.mjs

# The frozen candidate may intentionally live outside the shallow launch-controller
# checkout. Bind its tree through immutable GitHub commit metadata instead of
# requiring the candidate object to be present in the local main-only clone.
candidate_tree="$(gh api "repos/${REPOSITORY}/commits/${SOURCE_SHA}" --jq .commit.tree.sha)"
[[ "$candidate_tree" =~ ^[0-9a-f]{40}$ ]] || fail candidate_tree_invalid
main_sha="$(gh api "repos/${REPOSITORY}/commits/main" --jq .sha)"
main_tree="$(gh api "repos/${REPOSITORY}/commits/${main_sha}" --jq .commit.tree.sha)"
allowed_trees=("$main_tree")

current_commit="$(gh api "repos/${REPOSITORY}/commits/${main_sha}")"
parent_sha="$(jq -r '.parents[0].sha // empty' <<<"$current_commit")"
if [[ "$parent_sha" =~ ^[0-9a-f]{40}$ ]]; then
  changed_count="$(jq '.files | length' <<<"$current_commit")"
  changed_path="$(jq -r '.files[0].filename // empty' <<<"$current_commit")"
  if [[ "$changed_count" == 1 && "$changed_path" =~ ^\.github/d[0-9]+/launch-[0-9]+\.txt$ ]]; then
    parent_tree="$(gh api "repos/${REPOSITORY}/commits/${parent_sha}" --jq .commit.tree.sha)"
    allowed_trees+=("$parent_tree")
  fi
fi

if [[ -n "$RUN_ID" ]]; then
  [[ "$RUN_ID" =~ ^[1-9][0-9]+$ ]] || fail invalid_run_id "run_id=$RUN_ID" 4
  run_ids=("$RUN_ID")
else
  runs="$(gh api "repos/${REPOSITORY}/actions/workflows/d-series-admission-gate.yml/runs?status=success&per_page=50")"
  mapfile -t run_ids < <(jq -r '.workflow_runs[] | select(.status=="completed" and .conclusion=="success" and .run_attempt==1) | .id' <<<"$runs")
fi

policy_digest="sha256:$(sha256sum "$POLICY" | awk '{print $1}')"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for id in "${run_ids[@]:-}"; do
  [[ "$id" =~ ^[1-9][0-9]+$ ]] || continue
  run="$(gh api "repos/${REPOSITORY}/actions/runs/${id}")" || continue
  jq -e '.name=="D-Series Admission Gate" and .status=="completed" and .conclusion=="success" and .run_attempt==1' <<<"$run" >/dev/null || continue

  artifacts="$(gh api "repos/${REPOSITORY}/actions/runs/${id}/artifacts?per_page=100")" || continue
  artifact_id="$(jq -r --arg name "d-series-admission-manifest-${id}" '[.artifacts[] | select(.name==$name and .expired==false and (.size_in_bytes//0)>0)] | first | .id // empty' <<<"$artifacts")"
  [[ "$artifact_id" =~ ^[1-9][0-9]+$ ]] || continue

  dir="$tmp/$id"
  mkdir -p "$dir"
  if ! gh api "repos/${REPOSITORY}/actions/artifacts/${artifact_id}/zip" >"$dir/artifact.zip" 2>/dev/null; then continue; fi
  if ! unzip -qq "$dir/artifact.zip" -d "$dir/out"; then continue; fi
  manifest="$(find "$dir/out" -type f -name 'd-series-admission-manifest.json' -print -quit)"
  [[ -n "$manifest" ]] || continue

  integration_tree="$(jq -r '.integrationTreeSha // empty' "$manifest")"
  tree_ok=false
  for tree in "${allowed_trees[@]}"; do [[ "$integration_tree" == "$tree" ]] && tree_ok=true; done
  [[ "$tree_ok" == true ]] || continue

  if jq -e --arg candidate "$SOURCE_SHA" --arg candidate_tree "$candidate_tree" --arg policy_digest "$policy_digest" '
      .schema=="truyn.d-series.admission-manifest.v1"
      and .candidateSha==$candidate
      and .candidateTreeSha==$candidate_tree
      and .policyDigest==$policy_digest
      and .decision.admissionRequired==true
      and .decision.admissionPassed==true
      and .decision.status=="PASS_COMPATIBLE"
      and .decision.liveRerunRequired==false
      and .decision.liveRerunSatisfied==true
      and .decision.targetedRequalificationPassed==true
      and .decision.automaticFullRerunForbidden==true
      and .requalification.schema=="truyn.d-series.targeted-requalification.v1"
      and .requalification.mode=="targeted-blocks"
      and .requalification.allPassed==true
      and .requalification.integrationTreeSha==.integrationTreeSha
      and ((.requalification.requiredBlocks|sort)==(.decision.targetedBlocks|sort))
      and ((.requalification.results|keys|sort)==(.decision.targetedBlocks|sort))
      and (if .decision.liveRerunOriginallyRequired==true then (.decision.targetedBlocks|length)>0 else true end)
      and (.requalification.results | to_entries | all(.[];
        .value.status=="PASS"
        and .value.sourceSha==$integration_tree
        and (.value.fingerprint|test("^[0-9a-f]{64}$"))
        and (.value.evidenceDigest|test("^sha256:[0-9a-f]{64}$"))
      ))
      and (.evidence.sanitationSwarmRunId|type)=="number"
      and (.evidence.blockwiseRunId|type)=="number"
    ' "$manifest" >/dev/null; then
    echo "TRUYN_D_SERIES_ADMISSION_GATE=PASS run_id=$id candidate=$SOURCE_SHA integration_tree=$integration_tree current_main=$main_sha"
    exit 0
  fi
done

fail no_fresh_admission_for_candidate "candidate=$SOURCE_SHA current_main=$main_sha"
