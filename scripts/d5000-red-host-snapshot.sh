#!/usr/bin/env bash
# Sourceable diagnostic-only helper. Must NOT create/change cloud resources.
d5000_collect_red_host_snapshots() {
  local output_dir="${GITHUB_WORKSPACE:-$PWD}/d5000-red-host-diagnostics" i pid rc
  mkdir -p "$output_dir"
  local -a pids=()
  for i in $(seq 0 $((HOST_COUNT-1))); do
    (
      guest='set -Eeuo pipefail
echo D5000_HOST_SNAPSHOT_VERSION=1
echo D5000_HOST_LOADAVG_BEGIN; cat /proc/loadavg; echo D5000_HOST_LOADAVG_END
for key in MemTotal MemFree MemAvailable SwapTotal SwapFree; do
  grep -m 1 "^${key}:" /proc/meminfo || true
done
for kind in cpu memory io; do
  if [[ -r "/proc/pressure/$kind" ]]; then
    echo "D5000_PRESSURE_KIND=$kind"; cat "/proc/pressure/$kind"
  fi
done
if [[ -r /proc/net/sockstat ]]; then
  echo D5000_SOCKSTAT_BEGIN; cat /proc/net/sockstat; echo D5000_SOCKSTAT_END
fi
echo D5000_PROC_COUNT="$(find /proc -mindepth 1 -maxdepth 1 -regextype posix-extended -regex ".*/[0-9]+" 2>/dev/null | wc -l)"
echo D5000_HOST_SNAPSHOT_END'
      if ! remote "${VMS[$i]}" "$guest" 180 >"$output_dir/host-$i.txt" 2>"$output_dir/host-$i.err"; then
        echo "TRUYN_D5000_RED_SNAPSHOT host=$i status=UNAVAILABLE" >&2
        printf 'UNAVAILABLE\n' >"$output_dir/host-$i.status"
      else
        if ! grep -Fq D5000_HOST_SNAPSHOT_END "$output_dir/host-$i.txt"; then
          printf 'UNAVAILABLE\n' >"$output_dir/host-$i.status"
        else
          printf 'COLLECTED\n' >"$output_dir/host-$i.status"
        fi
      fi
    ) &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid" || true; done
  : >"$output_dir/sha256sums.txt"
  local unavailable=0
  for i in $(seq 0 $((HOST_COUNT-1))); do
    sha256sum "$output_dir/host-$i.status" >>"$output_dir/sha256sums.txt"
    if [[ -f "$output_dir/host-$i.txt" ]]; then sha256sum "$output_dir/host-$i.txt" >>"$output_dir/sha256sums.txt"; fi
    if [[ "$(cat "$output_dir/host-$i.status")" != COLLECTED ]]; then unavailable=$((unavailable+1)); fi
  done
  printf 'TRUYN_D5000_RED_SNAPSHOTS completed=%s unavailable=%s path=%s\n' "$((HOST_COUNT-unavailable))" "$unavailable" "$output_dir"
  [[ "$unavailable" == 0 ]]
}
