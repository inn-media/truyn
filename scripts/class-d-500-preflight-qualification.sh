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
mapfile -t active_d500_workflows < <(find .github/workflows -maxdepth 1 -type f \( -iname 'd500*.yml' -o -iname 'd500*.yaml' -o -iname 'd-500*.yml' -o -iname 'd-500*.yaml' \) -printf '%f\n' | sort)

case "$phase" in
  prepare)
    # Support both the original pre-launch tree and the post-attempt-1 repair tree.
    # Attempt 1 is immutable history; attempt 2 must not be launchable yet.
    if [[ "${#active_d500_workflows[@]}" -eq 0 ]]; then
      [[ ! -e .github/d500/launch-01.txt ]]
    elif [[ "${#active_d500_workflows[@]}" -eq 1 && "${active_d500_workflows[0]}" == 'd500-acceptance.yml' ]]; then
      [[ -e .github/d500/launch-01.txt ]]
    else
      printf 'TRUYN_D500_PREFLIGHT=FAIL phase=prepare active_workflows=%s\n' "${active_d500_workflows[*]}" >&2
      exit 1
    fi
    [[ ! -e .github/d500/launch-02.txt ]]
    launchable=false
    ;;
  launch)
    if [[ "${#active_d500_workflows[@]}" -ne 1 || "${active_d500_workflows[0]}" != 'd500-acceptance.yml' ]]; then
      printf 'TRUYN_D500_PREFLIGHT=FAIL phase=launch active_workflows=%s\n' "${active_d500_workflows[*]}" >&2
      exit 1
    fi
    [[ -e .github/d500/launch-01.txt ]]
    [[ ! -e .github/d500/launch-02.txt ]]
    test -f .github/d500/launch-02.template.txt
    grep -Fq "'.github/d500/launch-02.txt'" .github/workflows/d500-acceptance.yml
    grep -Fq 'secrets.AZURE_CLIENT_ID' .github/workflows/d500-acceptance.yml
    grep -Fq 'secrets.AZURE_TENANT_ID' .github/workflows/d500-acceptance.yml
    grep -Fq 'secrets.AZURE_SUBSCRIPTION_ID' .github/workflows/d500-acceptance.yml
    grep -Fq 'TRUYN_D200_LOCATION:' .github/workflows/d500-acceptance.yml
    grep -Fq 'env.TRUYN_D500_LOCATION' .github/workflows/d500-acceptance.yml
    launchable=reviewed-attempt2-workflow-only
    ;;
  *)
    echo "TRUYN_D500_PREFLIGHT=FAIL invalid_phase=${phase}" >&2
    exit 1
    ;;
esac

node --test tests/d500-prelaunch.test.js
printf 'TRUYN_D500_PREFLIGHT_QUALIFICATION=PASS phase=%s topology=20x25 process_target=500 max_peers=32 d200_floor_preserved=true inheritance=true five_patch=true launchable=%s\n' "$phase" "$launchable"
