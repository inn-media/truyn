#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# D-500 is an extension of the accepted D-200 path, not a replacement for it.
node scripts/check-d200-contract.mjs
node scripts/check-d500-contract.mjs
node scripts/check-d500-inheritance.mjs
node scripts/check-class-d-five-patches.mjs
node scripts/check-repository-hygiene.mjs

# Keep using the already-proven shared Class-D runtime/provisioning implementation.
bash -n benchmarks/scale/class-d-azure-1000-provision.sh
bash -n benchmarks/scale/class-d-azure-1000-campaign.sh
bash -n benchmarks/scale/d200-restart-recovery-stage.sh
bash -n scripts/d200-stage-isolated-campaign.sh
bash -n scripts/d200-stage-runtime-bundle.sh
node --check network/runtime.js

grep -Fq 'HOST_COUNT=20' benchmarks/scale/class-d-azure-1000-provision.sh
grep -Fq 'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"' benchmarks/scale/class-d-azure-1000-provision.sh
grep -Fq 'TRUYN_CLASS_D1000_NODES_PER_HOST' benchmarks/scale/class-d-azure-1000-provision.sh

# First D-500 gate changes scale only: keep the proven five-node-per-host restart slice.
grep -Fq 'restart_first_node=5' benchmarks/scale/d200-restart-recovery-stage.sh
grep -Fq 'restart_last_node=9' benchmarks/scale/d200-restart-recovery-stage.sh

grep -Fq 'D200_CAMPAIGN_SOURCE=' scripts/d200-stage-isolated-campaign.sh
grep -Fq 'class-d-200-stage-results.json' scripts/d200-stage-isolated-campaign.sh
grep -Fq 'acceptanceWeakened' scripts/d200-stage-isolated-campaign.sh

phase="${D500_PREFLIGHT_PHASE:-prepare}"
# Qualification launchers are pre-admission diagnostics. Immutable D-500 attempt
# history is represented only by the canonical acceptance workflow plus launch tokens.
mapfile -t active_d500_workflows < <(find .github/workflows -maxdepth 1 -type f \( -iname 'd500-acceptance.yml' -o -iname 'd500-acceptance.yaml' -o -iname 'd-500-acceptance.yml' -o -iname 'd-500-acceptance.yaml' \) -printf '%f\n' | sort)

# Treat every prior one-shot launch token as immutable history. Require a contiguous
# 01..N sequence so a future attempt cannot skip, replace, or reuse an identity.
shopt -s nullglob
launch_tokens=(.github/d500/launch-[0-9][0-9].txt)
shopt -u nullglob
if [[ "${#launch_tokens[@]}" -gt 0 ]]; then
  mapfile -t launch_tokens < <(printf '%s\n' "${launch_tokens[@]}" | sort)
fi
latest=0
for token_path in "${launch_tokens[@]}"; do
  token_name="${token_path##*/}"
  token_number="${token_name#launch-}"
  token_number="${token_number%.txt}"
  number=$((10#$token_number))
  expected=$((latest + 1))
  if [[ "$number" -ne "$expected" ]]; then
    printf 'TRUYN_D500_PREFLIGHT=FAIL non_contiguous_history expected=%02d actual=%02d\n' "$expected" "$number" >&2
    exit 1
  fi
  grep -Eq '^TASK_ID=truyn-d500-' "$token_path"
  grep -Eq '^WORKFLOW_BLOB_SHA=[0-9a-f]{40}$' "$token_path"
  latest="$number"
done

launch_name(){ printf 'launch-%02d.txt' "$1"; }
workflow='.github/workflows/d500-acceptance.yml'

case "$phase" in
  prepare)
    # A source tree with no launch history is valid before attempt 1. Once an attempt
    # exists, exactly one D-500 acceptance workflow must remain and must still point at
    # the latest immutable token. Qualification launchers are deliberately excluded.
    if [[ "$latest" -eq 0 ]]; then
      [[ "${#active_d500_workflows[@]}" -eq 0 ]]
    else
      [[ "${#active_d500_workflows[@]}" -eq 1 && "${active_d500_workflows[0]}" == 'd500-acceptance.yml' ]]
      current_token="$(launch_name "$latest")"
      [[ -e ".github/d500/${current_token}" ]]
      grep -Fq "'.github/d500/${current_token}'" "$workflow"
    fi
    next=$((latest + 1))
    next_token="$(launch_name "$next")"
    [[ ! -e ".github/d500/${next_token}" ]]
    launchable=false
    ;;
  launch)
    # Pre-launch review may target only the immediate successor N+1. Historical tokens
    # remain present and immutable; the successor token itself must still be absent.
    [[ "${#active_d500_workflows[@]}" -eq 1 && "${active_d500_workflows[0]}" == 'd500-acceptance.yml' ]]
    next=$((latest + 1))
    next_token="$(launch_name "$next")"
    [[ ! -e ".github/d500/${next_token}" ]]
    grep -Fq "'.github/d500/${next_token}'" "$workflow"
    grep -Fq 'secrets.AZURE_CLIENT_ID' "$workflow"
    for role in TENANT SUBSCRIPTION; do
      secret_name="AZURE_${role}_ID"
      grep -Fq "secrets.${secret_name}" "$workflow"
    done
    grep -Fq 'TRUYN_D200_LOCATION:' "$workflow"
    grep -Fq 'env.TRUYN_D500_LOCATION' "$workflow"
    launchable="reviewed-attempt${next}-workflow-only"
    ;;
  *)
    echo "TRUYN_D500_PREFLIGHT=FAIL invalid_phase=${phase}" >&2
    exit 1
    ;;
esac

node --test tests/d500-prelaunch.test.js
printf 'TRUYN_D500_PREFLIGHT_QUALIFICATION=PASS phase=%s topology=20x25 process_target=500 max_peers=32 d200_floor_preserved=true inheritance=true five_patch=true history_count=%s launchable=%s\n' "$phase" "$latest" "$launchable"
