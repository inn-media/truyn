#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKSPACE="${GITHUB_WORKSPACE:-$ROOT}"
EVIDENCE="$WORKSPACE/class-d-1000-evidence.json"
EVALUATION="$WORKSPACE/class-d-1000-evaluation.json"
TERMINAL="$WORKSPACE/class-d-1000-terminal.json"
LOG="$WORKSPACE/class-d-1000-strict.log"

rm -f "$EVALUATION" "$TERMINAL" "$LOG"

# Run the existing provision+campaign flow in a child shell. Its EXIT trap owns
# infrastructure cleanup and finalizes cleanup.confirmed/remainingResources in
# the evidence file before this parent performs canonical acceptance checks.
# Keep a machine-readable copy of the strict log so convergence failures that
# happen before final evidence materialization can still produce fail-closed
# partial diagnostics instead of opaque evaluator/terminal rc=99.
set +e
bash scripts/class-d-1000-final-acceptance.sh 2>&1 | tee "$LOG"
campaign_rc=${PIPESTATUS[0]}
set -e

if [[ ! -f "$EVIDENCE" ]]; then
  node benchmarks/scale/class-d-1000-partial-evidence-from-log.js "$LOG" "$EVIDENCE" "$campaign_rc" || true
fi

if [[ ! -f "$EVIDENCE" ]]; then
  printf '%s\n' '{"ok":false,"error":"class_d_1000_evidence_missing"}' >"$EVALUATION"
  printf '%s\n' '{"ok":false,"error":"class_d_1000_terminal_evidence_missing"}' >"$TERMINAL"
  echo "TRUYN_CLASS_D_1000_STRICT=FAIL campaignRc=${campaign_rc} evidence=missing evaluatorRc=99 terminalRc=99"
  exit 1
fi

set +e
node benchmarks/scale/evaluate-class-d-1000-evidence.js "$EVIDENCE" >"$EVALUATION"
evaluator_rc=$?
node benchmarks/scale/verify-class-d-1000-terminal.js "$EVIDENCE" >"$TERMINAL"
terminal_rc=$?
set -e

if [[ "$campaign_rc" -eq 0 && "$evaluator_rc" -eq 0 && "$terminal_rc" -eq 0 ]]; then
  echo "TRUYN_CLASS_D_1000_STRICT=PASS campaignRc=0 evaluatorRc=0 terminalRc=0"
  exit 0
fi

echo "TRUYN_CLASS_D_1000_STRICT=FAIL campaignRc=${campaign_rc} evaluatorRc=${evaluator_rc} terminalRc=${terminal_rc}"
exit 1
