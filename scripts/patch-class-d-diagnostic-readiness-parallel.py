#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-readiness-parallel.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

host_gate = '"\\$hosts" -ge 2'
host_gate_replacement = '"\\$hosts" -eq ${HOST_COUNT}'
if text.count(host_gate) != 1:
    raise SystemExit(f'unexpected readiness host-diversity gate count: {text.count(host_gate)}')
text = text.replace(host_gate, host_gate_replacement, 1)

head = '''readiness_min_hosts=999999; readiness_max_hosts=0
readiness_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
head_replacement = '''readiness_min_hosts=999999; readiness_max_hosts=0
readiness_dir=$(mktemp -d)
readiness_pids=()
readiness_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
if text.count(head) != 1:
    raise SystemExit(f'unexpected readiness loop head count: {text.count(head)}')
text = text.replace(head, head_replacement, 1)

tail = '''  out=$(remote "${VMS[$i]}" "$script")
  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)
  [[ "$ready" == "$NODES_PER_HOST" ]]
  [[ "$total" == "$NODES_PER_HOST" ]]
  readiness_ready=$((readiness_ready+ready)); readiness_total=$((readiness_total+total))
  min_valid=$(marker "$out" READINESS_MIN_VALID); max_valid=$(marker "$out" READINESS_MAX_VALID)
  min_buckets=$(marker "$out" READINESS_MIN_BUCKETS); max_buckets=$(marker "$out" READINESS_MAX_BUCKETS)
  min_hosts=$(marker "$out" READINESS_MIN_HOSTS); max_hosts=$(marker "$out" READINESS_MAX_HOSTS)
  if [[ "$min_valid" -lt "$readiness_min_valid" ]]; then readiness_min_valid="$min_valid"; fi
  if [[ "$max_valid" -gt "$readiness_max_valid" ]]; then readiness_max_valid="$max_valid"; fi
  if [[ "$min_buckets" -lt "$readiness_min_buckets" ]]; then readiness_min_buckets="$min_buckets"; fi
  if [[ "$max_buckets" -gt "$readiness_max_buckets" ]]; then readiness_max_buckets="$max_buckets"; fi
  if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]; then readiness_min_hosts="$min_hosts"; fi
  if [[ "$max_hosts" -gt "$readiness_max_hosts" ]]; then readiness_max_hosts="$max_hosts"; fi
  echo "TRUYN_CLASS_D_1000 stage=readiness-barrier host=$i ready=${ready}/${total} validMin=${min_valid} validMax=${max_valid} bucketsMin=${min_buckets} bucketsMax=${max_buckets} remoteHostsMin=${min_hosts} remoteHostsMax=${max_hosts} status=PASS"
done
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
'''
replacement = r'''  readiness_result_file=/tmp/truyn-d200-readiness-result
  readiness_status_file=/tmp/truyn-d200-readiness-status
  wrapped_script="set -Eeuo pipefail
result_file='$readiness_result_file'
status_file='$readiness_status_file'
result_tmp=\"\${result_file}.tmp\"
status_tmp=\"\${status_file}.tmp\"
rm -f \"\$result_file\" \"\$result_tmp\" \"\$status_file\" \"\$status_tmp\"
set +e
(
  set -Eeuo pipefail
  {
${script}
  } | tee \"\$result_tmp\"
)
probe_rc=\$?
set -e
if [[ -f \"\$result_tmp\" ]]; then mv \"\$result_tmp\" \"\$result_file\"; fi
printf 'READINESS_PROBE_RC=%s\\n' \"\$probe_rc\" > \"\$status_tmp\"
mv \"\$status_tmp\" \"\$status_file\"
exit \"\$probe_rc\""
  (remote "${VMS[$i]}" "$wrapped_script" >"$readiness_dir/$i") &
  readiness_pids+=("$!")
done
readiness_failed=0
for pid in "${readiness_pids[@]}"; do
  if ! wait "$pid"; then readiness_failed=1; fi
done
readiness_markers_present() {
  local text="$1" key
  for key in READINESS_READY READINESS_TOTAL READINESS_MIN_VALID READINESS_MAX_VALID READINESS_MIN_BUCKETS READINESS_MAX_BUCKETS READINESS_MIN_HOSTS READINESS_MAX_HOSTS; do
    [[ -n "$(marker "$text" "$key")" ]] || return 1
  done
}
readiness_collection_attempts=4
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$readiness_dir/$i")"
  if ! readiness_markers_present "$out"; then
    recovered=''
    if recovered="$(remote "${VMS[$i]}" "set -Eeuo pipefail; cat /tmp/truin-d200-readiness-result")"; then
      :
    fi
    if ! readiness_markers_present "$recovered"; then
      for attempt in $(seq 1 "$readiness_collection_attempts"); do
        recovered=''
        if recovered="$(remote "${VMS[$i]}" "set -Eeuo pipefail; s=/tmp/truyn-d200-readiness-status; r=/tmp/truyn-d200-readiness-result; [[ -f \"\$s\" ]]; cat \"\$s\"; [[ -f \"\$r\" ]]; cat \"\$r\"")"; then
          :
        fi
        probe_rc="$(marker "$recovered" READINESS_PROBE_RC)"
        if readiness_markers_present "$recovered"; then break; fi
        if [[ -n "$probe_rc" && "$probe_rc" != 0 ]]; then
          echo "TRUYN_D200_READINESS_OBSERVATION_ERROR readiness_probe_failed_without_complete_observation host=$i rc=$probe_rc" >&2
          rm -rf "$readiness_dir"
          false
        fi
        [[ "$attempt" == "$readiness_collection_attempts" ]] || sleep 1
      done
    fi
    if ! readiness_markers_present "$recovered"; then
      echo "TRUYN_D200_READINESS_OBSERVATION_ERROR readiness_observation_missing host=$i launch_failure=$readiness_failed" >&2
      rm -rf "$readiness_dir"
      false
    fi
    out="$recovered"
    echo "TRUYN_CLASS_D_1000 stage=readiness-observation-recovery host=$i mode=read-only status=PASS"
  fi
  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)
  [[ "$ready" == "$NODES_PER_HOST" ]]
  [[ "$total" == "$NODES_PER_HOST" ]]
  readiness_ready=$((readiness_ready+ready)); readiness_total=$((readiness_total+total))
  min_valid=$(marker "$out" READINESS_MIN_VALID); max_valid=$(marker "$out" READINESS_MAX_VALID)
  min_buckets=$(marker "$out" READINESS_MIN_BUCKETS); max_buckets=$(marker "$out" READINESS_MAX_BUCKETS)
  min_hosts=$(marker "$out" READINESS_MIN_HOSTS); max_hosts=$(marker "$out" READINESS_MAX_HOSTS)
  if [[ "$min_valid" -lt "$readiness_min_valid" ]]; then readiness_min_valid="$min_valid"; fi
  if [[ "$max_valid" -gt "$readiness_max_valid" ]]; then readiness_max_valid="$max_valid"; fi
  if [[ "$min_buckets" -lt "$readiness_min_buckets" ]]; then readiness_min_buckets="$min_buckets"; fi
  if [[ "$max_buckets" -gt "$readiness_max_buckets" ]]; then readiness_max_buckets="$max_buckets"; fi
  if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]; then readiness_min_hosts="$min_hosts"; fi
  if [[ "$max_hosts" -gt "$readiness_max_hosts" ]]; then readiness_max_hosts="$max_hosts"; fi
  echo "TRUYN_CLASS_D_1000 stage=readiness-barrier host=$i mode=parallel-hosts ready=${ready}/${total} validMin=${min_valid} validMax=${max_valid} bucketsMin=${min_buckets} bucketsMax=${max_buckets} remoteHostsMin=${min_hosts} remoteHostsMax=${max_hosts} status=PASS"
done
rm -rf "$readiness_dir"
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
'''
replacement = replacement.replace('/tmp/truin-d200-readiness-result', '/tmp/truyn-d200-readiness-result')
if text.count(tail) != 1:
    raise SystemExit(f'unexpected readiness loop tail count: {text.count(tail)}')
text = text.replace(tail, replacement, 1)

readiness_start = text.find('STAGE=readiness-barrier')
convergence_start = text.find('STAGE=convergence')
if readiness_start < 0 or convergence_start <= readiness_start:
    raise SystemExit('readiness/convergence stage boundaries not found')
readiness_block = text[readiness_start:convergence_start]
if '/need' in readiness_block:
    raise SystemExit('readiness barrier must not issue application /need calls')
if host_gate_replacement not in readiness_block:
    raise SystemExit('readiness barrier must require full HOST_COUNT endpoint diversity')
if 'READINESS_PROBE_RC=' not in readiness_block:
    raise SystemExit('readiness barrier must persist guest probe exit status')
if 'readiness_collection_attempts=4' not in readiness_block:
    raise SystemExit('readiness observation recovery must stay bounded')
if 'readiness_probe_failed_without_complete_observation host=$i rc=$probe_rc' not in readiness_block:
    raise SystemExit('readiness observation recovery must distinguish incomplete probe failure from a complete failed observation')
if readiness_block.index('if readiness_markers_present "$recovered"; then break; fi') > readiness_block.index('readiness_probe_failed_without_complete_observation'):
    raise SystemExit('complete persisted observations must be preserved before probe rc is interpreted')

path.write_text(text)
