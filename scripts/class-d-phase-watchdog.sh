#!/usr/bin/env bash
# Shared Class-D phase watchdog. Deadlines are evidence-derived and fail closed.
# shellcheck shell=bash

CLASS_D_DEADLINE_CONFIG="${CLASS_D_DEADLINE_CONFIG:-config/class-d-phase-deadlines.json}"
CLASS_D_PHASE_EVIDENCE="${CLASS_D_PHASE_EVIDENCE:-${GITHUB_WORKSPACE:-$PWD}/class-d-phase-events.jsonl}"

class_d_scale_key() {
  local raw="${TRUYN_CLASS_D_SCALE:-${CLASS_LABEL:-}}"
  case "${raw,,}" in
    d500|d-500) printf '%s\n' d500 ;;
    d1000|d-1000) printf '%s\n' d1000 ;;
    *)
      case "${NODES_PER_HOST:-}" in
        25) printf '%s\n' d500 ;;
        50) printf '%s\n' d1000 ;;
        *) echo "TRUYN_CLASS_D_PHASE invalid scale raw=${raw:-unset} nodesPerHost=${NODES_PER_HOST:-unset}" >&2; return 2 ;;
      esac
      ;;
  esac
}

class_d_deadline_ms() {
  local phase="$1" scale="${2:-$(class_d_scale_key)}" field
  [[ -f "$CLASS_D_DEADLINE_CONFIG" ]] || { echo "missing deadline contract: $CLASS_D_DEADLINE_CONFIG" >&2; return 2; }
  case "$scale" in
    d500) field=d500DeadlineMs ;;
    d1000) field=d1000DeadlineMs ;;
    *) echo "invalid Class-D scale: $scale" >&2; return 2 ;;
  esac
  jq -er --arg phase "$phase" --arg field "$field" '.phases[$phase][$field] | select(type=="number" and .>0)' "$CLASS_D_DEADLINE_CONFIG"
}

class_d_outer_watchdog_ms() {
  local scale="${1:-$(class_d_scale_key)}"
  jq -er --arg scale "$scale" '.policy[$scale].outerWatchdogMs | select(type=="number" and .>0)' "$CLASS_D_DEADLINE_CONFIG"
}

class_d_phase_event() {
  local phase="$1" status="$2" deadline_ms="$3" elapsed_ms="$4" rc="${5:-0}" detail="${6:-}"
  local now scale tmp
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  scale="$(class_d_scale_key)"
  mkdir -p "$(dirname "$CLASS_D_PHASE_EVIDENCE")"
  tmp="$(mktemp)"
  jq -cn \
    --arg ts "$now" --arg scale "$scale" --arg phase "$phase" --arg status "$status" \
    --argjson deadlineMs "$deadline_ms" --argjson elapsedMs "$elapsed_ms" --argjson rc "$rc" --arg detail "$detail" \
    '{schema:"truyn.class-d.phase-event.v1",ts:$ts,scale:$scale,phase:$phase,status:$status,deadlineMs:$deadlineMs,elapsedMs:$elapsedMs,rc:$rc,detail:($detail|select(length>0)//null)}' >"$tmp"
  cat "$tmp" >>"$CLASS_D_PHASE_EVIDENCE"
  rm -f "$tmp"
  echo "TRUYN_CLASS_D_PHASE scale=$scale phase=$phase status=$status deadlineMs=$deadline_ms elapsedMs=$elapsed_ms rc=$rc${detail:+ detail=$detail}"
}

# Execute an external command under the evidence-derived phase deadline.
class_d_run_with_deadline() {
  local phase="$1"; shift
  local deadline_ms seconds started ended elapsed rc
  deadline_ms="$(class_d_deadline_ms "$phase")" || return $?
  seconds=$(( (deadline_ms + 999) / 1000 ))
  started="$(date +%s%3N)"
  class_d_phase_event "$phase" START "$deadline_ms" 0 0
  set +e
  timeout --foreground --signal=TERM --kill-after=10s "${seconds}s" "$@"
  rc=$?
  set -e
  ended="$(date +%s%3N)"; elapsed=$((ended-started))
  if [[ "$rc" == 0 ]]; then
    class_d_phase_event "$phase" PASS "$deadline_ms" "$elapsed" 0
    return 0
  fi
  if [[ "$rc" == 124 || "$rc" == 137 || "$rc" == 143 ]]; then
    class_d_phase_event "$phase" TIMEOUT "$deadline_ms" "$elapsed" 124 "global phase deadline exceeded"
    return 124
  fi
  class_d_phase_event "$phase" FAIL "$deadline_ms" "$elapsed" "$rc" "phase command returned non-zero"
  return "$rc"
}

# Wait for a fan-out set of background jobs under one global barrier deadline.
# This preserves the required wall-clock model: max(worker duration), never sum.
class_d_wait_pid_barrier() {
  local phase="$1"; shift
  local pids=("$@") deadline_ms seconds started ended elapsed watchdog marker rc=0 timed_out=0 pid
  [[ ${#pids[@]} -gt 0 ]] || { echo "TRUYN_CLASS_D_PHASE empty barrier phase=$phase" >&2; return 2; }
  deadline_ms="$(class_d_deadline_ms "$phase")" || return $?
  seconds=$(( (deadline_ms + 999) / 1000 ))
  started="$(date +%s%3N)"
  marker="$(mktemp)"
  class_d_phase_event "$phase" START "$deadline_ms" 0 0 "fanout=${#pids[@]}"
  (
    sleep "$seconds"
    printf 'timeout\n' >"$marker"
    for pid in "${pids[@]}"; do kill -TERM "$pid" >/dev/null 2>&1 || true; done
    sleep 10
    for pid in "${pids[@]}"; do kill -KILL "$pid" >/dev/null 2>&1 || true; done
  ) &
  watchdog=$!
  set +e
  for pid in "${pids[@]}"; do
    wait "$pid"
    child_rc=$?
    [[ "$child_rc" == 0 ]] || rc="$child_rc"
  done
  set -e
  if [[ -s "$marker" ]]; then timed_out=1; rc=124; fi
  kill "$watchdog" >/dev/null 2>&1 || true
  wait "$watchdog" >/dev/null 2>&1 || true
  rm -f "$marker"
  ended="$(date +%s%3N)"; elapsed=$((ended-started))
  if [[ "$timed_out" == 1 ]]; then
    class_d_phase_event "$phase" TIMEOUT "$deadline_ms" "$elapsed" 124 "global fanout barrier deadline exceeded"
    return 124
  fi
  if [[ "$rc" != 0 ]]; then
    class_d_phase_event "$phase" FAIL "$deadline_ms" "$elapsed" "$rc" "one or more fanout workers failed"
    return "$rc"
  fi
  class_d_phase_event "$phase" PASS "$deadline_ms" "$elapsed" 0 "fanout=${#pids[@]}"
  return 0
}
