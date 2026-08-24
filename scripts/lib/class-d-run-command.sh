#!/usr/bin/env bash

# Class D acceptance-specific Azure RunCommand boundary.
#
# Safety contract:
# - never replay a guest script after Azure has admitted guest execution;
# - a nonce-bound guest terminal marker is authoritative for guest completion;
# - retry only explicit control-plane non-admission conditions;
# - RunCommand-busy uses bounded fixed waits;
# - HTTP 429 / Too Many Requests uses bounded exponential backoff;
# - all other results fail closed immediately.
truyn_class_d_remote() {
  local rg="$1" vm="$2" script="$3" enc remote_script
  local rc=0 out_file err_file
  local busy_attempt=1 throttle_attempt=1
  local busy_max="${TRUYN_AZ_RUN_COMMAND_BUSY_RETRIES:-12}"
  local busy_sleep="${TRUYN_AZ_RUN_COMMAND_BUSY_SLEEP_SECONDS:-10}"
  local throttle_max="${TRUYN_AZ_RUN_COMMAND_429_RETRIES:-6}"
  local throttle_base="${TRUYN_AZ_RUN_COMMAND_429_BASE_DELAY_SECONDS:-2}"
  local throttle_cap="${TRUYN_AZ_RUN_COMMAND_429_MAX_DELAY_SECONDS:-30}"
  local delay=0 admitted=false terminal_rc='' terminal_line=''
  local guest_marker='TRUYN_GUEST_EXECUTION_ADMITTED=1'
  local terminal_nonce terminal_prefix

  terminal_nonce="${RANDOM}${RANDOM}$(date +%s%N)"
  terminal_prefix="TRUYN_GUEST_TERMINAL_${terminal_nonce}="
  enc="$(printf '%s' "$script" | base64 -w0)"
  remote_script="echo ${guest_marker}; printf '%s' '$enc' | base64 -d >/tmp/truyn-d100-run.sh; chmod 700 /tmp/truyn-d100-run.sh; set +e; /bin/bash /tmp/truyn-d100-run.sh; guest_rc=\$?; printf '${terminal_prefix}%s\\n' \"\$guest_rc\"; exit \"\$guest_rc\""
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  while true; do
    : >"$out_file"
    : >"$err_file"
    rc=0

    # Azure RunCommand may report extension success even when the guest shell
    # returned non-zero. Capture all message elements, then evaluate our own
    # nonce-bound guest terminal marker instead of trusting the CLI exit alone.
    if command az vm run-command invoke -g "$rg" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[].message' -o tsv --only-show-errors >"$out_file" 2>"$err_file"; then
      rc=0
    else
      rc=$?
    fi

    admitted=false
    if grep -Fq "$guest_marker" "$out_file" || grep -Fq "$guest_marker" "$err_file"; then
      admitted=true
    fi

    terminal_line="$(grep -F "${terminal_prefix}" "$out_file" "$err_file" 2>/dev/null | tail -1 || true)"
    terminal_rc=''
    if [[ -n "$terminal_line" ]]; then
      terminal_rc="${terminal_line##*${terminal_prefix}}"
      terminal_rc="${terminal_rc%%[^0-9]*}"
    fi

    if [[ "$admitted" == true ]]; then
      # Admission is a no-replay boundary. If the guest completed, its explicit
      # terminal code decides success/failure. If the terminal marker is absent,
      # fail closed: the guest may have run partially and must not be replayed.
      if [[ "$terminal_rc" =~ ^[0-9]+$ ]] && (( terminal_rc >= 0 && terminal_rc <= 255 )); then
        if (( terminal_rc == 0 )); then
          cat "$out_file"
          [[ -s "$err_file" ]] && cat "$err_file" >&2
          rm -f "$out_file" "$err_file"
          return 0
        fi
        cat "$out_file" >&2
        cat "$err_file" >&2
        echo "TRUYN_GUEST_TERMINAL_FAILURE vm=${vm} rc=${terminal_rc}" >&2
        rm -f "$out_file" "$err_file"
        return "$terminal_rc"
      fi

      cat "$out_file" >&2
      cat "$err_file" >&2
      echo "TRUYN_GUEST_TERMINAL_MISSING vm=${vm} azureRc=${rc}" >&2
      rm -f "$out_file" "$err_file"
      return 125
    fi

    # A control-plane success without our admission marker is not proof that the
    # guest ran. Fail closed instead of silently accepting an unobservable run.
    if (( rc == 0 )); then
      cat "$out_file" >&2
      cat "$err_file" >&2
      echo "TRUYN_GUEST_ADMISSION_MISSING vm=${vm}" >&2
      rm -f "$out_file" "$err_file"
      return 125
    fi

    if grep -Fqi 'managed VM RunCommand extension execution is in progress' "$err_file" || \
       grep -Fqi 'Please wait for completion before invoking a run command' "$err_file"; then
      if (( busy_attempt >= busy_max )); then
        cat "$out_file" >&2
        cat "$err_file" >&2
        rm -f "$out_file" "$err_file"
        return "$rc"
      fi
      echo "TRUYN_AZ_RUN_COMMAND_BUSY_WAIT vm=${vm} attempt=${busy_attempt} max=${busy_max}" >&2
      sleep "$busy_sleep"
      busy_attempt=$((busy_attempt + 1))
      continue
    fi

    if [[ ! -s "$out_file" ]] && \
       grep -Eqi 'Too Many Requests|HTTP[^0-9]*429|status[^0-9]*429|\b429\b' "$err_file"; then
      if (( throttle_attempt >= throttle_max )); then
        cat "$out_file" >&2
        cat "$err_file" >&2
        rm -f "$out_file" "$err_file"
        return "$rc"
      fi

      if (( throttle_base > 0 )); then
        delay=$(( throttle_base * (1 << (throttle_attempt - 1)) ))
        (( delay > throttle_cap )) && delay="$throttle_cap"
      else
        delay=0
      fi
      echo "TRUYN_AZ_RUN_COMMAND_429_BACKOFF vm=${vm} attempt=${throttle_attempt} max=${throttle_max} delaySeconds=${delay}" >&2
      sleep "$delay"
      throttle_attempt=$((throttle_attempt + 1))
      continue
    fi

    cat "$out_file" >&2
    cat "$err_file" >&2
    rm -f "$out_file" "$err_file"
    return "$rc"
  done
}
