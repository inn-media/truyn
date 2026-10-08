#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/az" <<'MOCKAZ'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == vm && "$2" == run-command && "$3" == invoke ]] || exit 63
command=''
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" == --scripts ]]; then command="$2"; shift 2; break; fi
  shift
done
[[ -n "$command" ]] || exit 64
if [[ "${D5000_MOCK_MISSING_MARKER:-0}" == 1 ]]; then
  printf 'Enable succeeded:\n[stdout]\nNO_GUEST_TERMINAL\n[stderr]\n'
  exit 0
fi
message="$(bash -c "$command")"
if [[ "${D5000_MOCK_TAMPERED_MARKER:-0}" == 1 ]]; then
  message="$(printf '%s\n' "$message" | sed 's/ rc=0/ rc=9/')"
fi
printf 'Enable succeeded:\n[stdout]\n%s\n[stderr]\n' "$message"
MOCKAZ
chmod +x "$tmp/az"
export PATH="$tmp:$PATH" RG=mock GITHUB_RUN_ID=987654
sed -n '/^remote() {/,/^}/p' "$repo_root/benchmarks/scale/class-d-azure-5000-provision.sh" >"$tmp/remote.sh"
source "$tmp/remote.sh"
output="$(remote test-vm 'printf "HARNESS_OK\n"; exit 0')"
grep -q HARNESS_OK <<<"$output"
grep -q 'TRUYN_D5000_GUEST_TERMINAL nonce=' <<<"$output"
if remote test-vm 'printf "HARNESS_FAILED\n"; exit 9' >/dev/null 2>&1; then
  echo 'TRUYN_D5000_REMOTE_TEST=FAIL case=guest-nonzero-accepted'
  exit 1
fi
if D5000_MOCK_MISSING_MARKER=1 remote test-vm 'exit 0' >/dev/null 2>&1; then
  echo 'TRUYN_D5000_REMOTE_TEST=FAIL case=missing-guest-terminal-accepted'
  exit 1
fi
if D5000_MOCK_TAMPERED_MARKER=1 remote test-vm 'exit 0' >/dev/null 2>&1; then
  echo 'TRUYN_D5000_REMOTE_TEST=FAIL case=tampered-terminal-accepted'
  exit 1
fi
echo 'TRUYN_D5000_REMOTE_TEST=PASS guest-zero=true guest-nonzero-rejected=true missing-terminal-rejected=true tamper-rejected=true'
