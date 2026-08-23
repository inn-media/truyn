from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v17.py').read_text(), 'tmp-patch-origin-lock-v17.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''  if [[ ! "$inject_http" =~ ^2 ]]; then
    inject_code="$(jq -r '.error.code // empty' "/tmp/truyn-inject-put-${rule_index}.json" 2>/dev/null || true)"
    safe_code="$(printf '%s' "${inject_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
    fail "afd_inject_rule_${rule_index}_arm_http_${inject_http}_${safe_code:-unknown}"
  fi'''
new = r'''  if [[ ! "$inject_http" =~ ^2 ]]; then
    inject_code="$(jq -r '.error.code // empty' "/tmp/truyn-inject-put-${rule_index}.json" 2>/dev/null || true)"
    safe_code="$(printf '%s' "${inject_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
    inject_msg="$(jq -r '.error.message // empty' "/tmp/truyn-inject-put-${rule_index}.json" 2>/dev/null || true)"
    for secretish in "${AZURE_SUBSCRIPTION_ID_VALUE:-}" "${AFD_RG:-}" "${PROFILE_NAME:-}" "${RULESET_NAME:-}" "${rule_name:-}" "${PROOF_SECRET:-}" "${RELAY_HOST:-}"; do
      [[ -n "$secretish" ]] || continue
      inject_msg="${inject_msg//$secretish/[redacted]}"
    done
    safe_msg="$(printf '%s' "$inject_msg" | sed -E 's#https?://[^ ]+#[url]#g; s#/subscriptions/[^ ]+#[resource]#g; s/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,36}/[guid]/g' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-96)"
    fail "afd_inject_rule_${rule_index}_${inject_http}_${safe_code:-unknown}_${safe_msg:-no_message}"
  fi'''
if old not in s:
    raise SystemExit('v17 inject failure block not found')
s = s.replace(old, new, 1)
p.write_text(s)
