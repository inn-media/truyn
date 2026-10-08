#!/usr/bin/env bash
set -Eeuo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export GITHUB_WORKSPACE="$tmp"
HOST_COUNT=2
VMS=(test-vm-0 test-vm-1)
remote() {
  local vm="$1" guest="$2"
  [[ "$vm" == test-vm-0 || "$vm" == test-vm-1 ]] || return 1
  [[ "$guest" == *D5000_HOST_SNAPSHOT_END* ]] || return 1
  echo D5000_HOST_SNAPSHOT_VERSION=1
  echo D5000_HOST_SNAPSHOT_END
}
source "$repo/scripts/d5000-red-host-snapshot.sh"
d5000_collect_red_host_snapshots
for index in 0 1; do
  [[ "$(cat "$tmp/d5000-red-host-diagnostics/host-$index.status")" == COLLECTED ]]
done
(cd "$tmp/d5000-red-host-diagnostics" && sha256sum -c sha256sums.txt)
remote() { return 71; }
if d5000_collect_red_host_snapshots >/dev/null 2>&1; then
  echo 'TRUYN_D5000_SNAPSHOT_TEST=FAIL reason=guest-error-masked'
  exit 1
fi
for index in 0 1; do
  [[ "$(cat "$tmp/d5000-red-host-diagnostics/host-$index.status")" == UNAVAILABLE ]]
done
echo 'TRUYN_D5000_SNAPSHOT_TEST=PASS bounded_capture=true digest=true remote_failure_failclosed=true'
