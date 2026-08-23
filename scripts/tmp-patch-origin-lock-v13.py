from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v11.py').read_text(), 'tmp-patch-origin-lock-v11.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''if [[ ! "$waf_http" =~ ^2 ]]; then
  safe_code="$(printf '%s' "${waf_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "waf_arm_http_${waf_http}_code_${safe_code:-unknown}"
fi'''
new = r'''if [[ ! "$waf_http" =~ ^2 ]]; then
  safe_code="$(printf '%s' "${waf_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  waf_msg="$(jq -r '.error.message // empty' /tmp/truyn-waf-put.json 2>/dev/null || true)"
  # Redact every known live identifier before producing a short public diagnostic fingerprint.
  for secretish in "${AZURE_SUBSCRIPTION_ID_VALUE:-}" "${AFD_RG:-}" "${PROFILE_NAME:-}" "${WAF_NAME:-}" "${RELAY_HOST:-}" "${APP:-}" "${RG:-}" "${FQDN:-}"; do
    [[ -n "$secretish" ]] || continue
    waf_msg="${waf_msg//$secretish/[redacted]}"
  done
  safe_msg="$(printf '%s' "$waf_msg" \
    | sed -E 's#https?://[^ ]+#[url]#g; s#/subscriptions/[^ ]+#[resource]#g; s/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,36}/[guid]/g' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-88)"
  fail "waf_arm_${waf_http}_${safe_code:-unknown}_${safe_msg:-no_message}"
fi'''
if old not in s:
    raise SystemExit('v11 failure block not found')
s = s.replace(old, new, 1)
p.write_text(s)
