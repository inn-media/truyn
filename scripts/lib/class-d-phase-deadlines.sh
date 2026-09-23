#!/usr/bin/env bash
# Canonical fail-closed Class-D liveness budgets. These are execution deadlines,
# never acceptance thresholds: correctness gates (including <=120s recovery /
# convergence) remain owned by the evaluators and campaign assertions.

class_d_scale_label() {
  case "${NODES_PER_HOST:-${TRUYN_CLASS_D1000_NODES_PER_HOST:-50}}" in
    10) printf '%s\n' 'D-200' ;;
    25) printf '%s\n' 'D-500' ;;
    50) printf '%s\n' 'D-1000' ;;
    *) echo "TRUYN_CLASS_D_LIVENESS invalid nodesPerHost=${NODES_PER_HOST:-${TRUYN_CLASS_D1000_NODES_PER_HOST:-unset}}" >&2; return 2 ;;
  esac
}

class_d_outer_watchdog_minutes() {
  case "$(class_d_scale_label)" in
    D-500) printf '%s\n' 120 ;;
    D-1000) printf '%s\n' 240 ;;
    D-200) printf '%s\n' 180 ;;
  esac
}

class_d_phase_family() {
  case "$1" in
    bootstrap|bootstrap-record-refresh) printf '%s\n' bootstrap ;;
    topology|readiness-barrier|convergence) printf '%s\n' topology ;;
    baseline-routing) printf '%s\n' baseline ;;
    restart-recovery) printf '%s\n' restart ;;
    post-restart-routing|healed-routing) printf '%s\n' recovery ;;
    invalid-signed-state|revoked-receipt|provider-access|durable-writes|packet-partition|write-retention) printf '%s\n' adversarial ;;
    cleanup) printf '%s\n' cleanup ;;
    *) printf '%s\n' "$1" ;;
  esac
}

class_d_phase_deadline_seconds() {
  local phase="$1" class
  class="$(class_d_scale_label)"
  case "${class}:${phase}" in
    D-500:provision) echo 1200 ;; D-500:install) echo 1200 ;;
    D-500:bootstrap-record-refresh) echo 600 ;; D-500:bootstrap) echo 1500 ;;
    D-500:topology) echo 300 ;; D-500:readiness-barrier) echo 600 ;; D-500:convergence) echo 600 ;;
    D-500:baseline-routing) echo 900 ;; D-500:restart-recovery) echo 900 ;;
    D-500:post-restart-routing) echo 600 ;; D-500:healed-routing) echo 600 ;;
    D-500:invalid-signed-state|D-500:revoked-receipt|D-500:provider-access|D-500:durable-writes|D-500:packet-partition|D-500:write-retention) echo 900 ;;
    D-500:resources|D-500:evidence) echo 300 ;; D-500:cleanup) echo 600 ;;

    D-1000:provision) echo 1800 ;; D-1000:install) echo 1800 ;;
    D-1000:bootstrap-record-refresh) echo 900 ;; D-1000:bootstrap) echo 2700 ;;
    D-1000:topology) echo 600 ;; D-1000:readiness-barrier) echo 900 ;; D-1000:convergence) echo 900 ;;
    D-1000:baseline-routing) echo 1500 ;; D-1000:restart-recovery) echo 1800 ;;
    D-1000:post-restart-routing) echo 1200 ;; D-1000:healed-routing) echo 1200 ;;
    D-1000:invalid-signed-state|D-1000:revoked-receipt|D-1000:provider-access|D-1000:durable-writes|D-1000:packet-partition|D-1000:write-retention) echo 1800 ;;
    D-1000:resources|D-1000:evidence) echo 600 ;; D-1000:cleanup) echo 1200 ;;

    D-200:provision|D-200:install) echo 1200 ;;
    D-200:bootstrap-record-refresh) echo 600 ;; D-200:bootstrap) echo 1200 ;;
    D-200:topology|D-200:readiness-barrier|D-200:convergence) echo 600 ;;
    D-200:baseline-routing|D-200:restart-recovery|D-200:post-restart-routing|D-200:healed-routing) echo 900 ;;
    D-200:invalid-signed-state|D-200:revoked-receipt|D-200:provider-access|D-200:durable-writes|D-200:packet-partition|D-200:write-retention) echo 900 ;;
    D-200:resources|D-200:evidence) echo 300 ;; D-200:cleanup) echo 600 ;;
    *) echo 600 ;;
  esac
}

class_d_wait_barrier() {
  local phase="$1" deadline_seconds="$2"; shift 2
  local -a pids=("$@")
  local started now deadline pid rc=0 alive
  started=$(date +%s)
  deadline=$((started + deadline_seconds))
  while :; do
    alive=0
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then alive=$((alive+1)); fi
    done
    [[ "$alive" == 0 ]] && break
    now=$(date +%s)
    if (( now >= deadline )); then
      echo "TRUYN_CLASS_D_PHASE_DEADLINE phase=${phase} family=$(class_d_phase_family "$phase") seconds=${deadline_seconds} active=${alive}" >&2
      for pid in "${pids[@]}"; do
        kill -0 "$pid" 2>/dev/null || continue
        pkill -TERM -P "$pid" 2>/dev/null || true
        kill -TERM "$pid" 2>/dev/null || true
      done
      sleep 2
      for pid in "${pids[@]}"; do
        kill -0 "$pid" 2>/dev/null || continue
        pkill -KILL -P "$pid" 2>/dev/null || true
        kill -KILL "$pid" 2>/dev/null || true
      done
      rc=124
      break
    fi
    sleep 1
  done
  for pid in "${pids[@]}"; do
    if ! wait "$pid" 2>/dev/null; then [[ "$rc" != 124 ]] && rc=1; fi
  done
  now=$(date +%s)
  if [[ "$rc" == 0 ]]; then
    echo "TRUYN_CLASS_D_PHASE_BARRIER phase=${phase} family=$(class_d_phase_family "$phase") workers=${#pids[@]} elapsedSeconds=$((now-started)) deadlineSeconds=${deadline_seconds} status=PASS"
  else
    echo "TRUYN_CLASS_D_PHASE_BARRIER phase=${phase} family=$(class_d_phase_family "$phase") workers=${#pids[@]} elapsedSeconds=$((now-started)) deadlineSeconds=${deadline_seconds} status=RED rc=${rc}" >&2
  fi
  return "$rc"
}
