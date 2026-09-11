#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
node scripts/check-d200-contract.mjs
node scripts/check-repository-hygiene.mjs
node --check network/runtime.js
bash -n benchmarks/scale/class-d-azure-1000-provision.sh
bash -n benchmarks/scale/class-d-azure-1000-campaign.sh
bash -n scripts/d200-stage-runtime-bundle.sh
node --test tests/d200-canonical-regressions.test.js tests/d200-anti-weakening.test.js tests/d200-staging-robustness.test.js tests/d200-peer-propagation-readiness-barrier.test.js tests/d200-route-repair-acceptance-invariants.test.js tests/class-d-canonical-pin-regression.test.js tests/class-d-accepted-entrypoint-regression.test.js
printf 'TRUYN_D200_PREFLIGHT_QUALIFICATION=PASS canonical_source=true runtime_patching=false\n'
