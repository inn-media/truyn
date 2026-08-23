from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v10.py').read_text(), 'tmp-patch-origin-lock-v10.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''if ! az rest --method put --url "$WAF_URL" --headers 'Content-Type=application/json' --body "$waf_body" >/tmp/truyn-waf-put.json 2>/tmp/truyn-waf-put.err; then
  if grep -qi 'AuthorizationFailed' /tmp/truyn-waf-put.err; then fail 'waf_arm_authorization_failed'; fi
  if grep -qi 'MissingSubscriptionRegistration' /tmp/truyn-waf-put.err; then fail 'waf_arm_provider_not_registered'; fi
  if grep -qi 'LocationNotAvailable' /tmp/truyn-waf-put.err; then fail 'waf_arm_location_not_available'; fi
  if grep -qi 'Invalid' /tmp/truyn-waf-put.err; then fail 'waf_arm_invalid_request'; fi
  fail 'waf_arm_put_failed'
fi'''
new = '''ARM_WAF_TOKEN="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
[[ -n "$ARM_WAF_TOKEN" ]] || fail 'waf_arm_token_missing'
mask "$ARM_WAF_TOKEN"
waf_http="$(curl -sS -o /tmp/truyn-waf-put.json -w '%{http_code}' -X PUT -H "Authorization: Bearer ${ARM_WAF_TOKEN}" -H 'Content-Type: application/json' --data "$waf_body" "$WAF_URL" || true)"
waf_code="$(jq -r '.error.code // empty' /tmp/truyn-waf-put.json 2>/dev/null || true)"
if [[ ! "$waf_http" =~ ^2 ]]; then
  safe_code="$(printf '%s' "${waf_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "waf_arm_http_${waf_http}_code_${safe_code:-unknown}"
fi'''
if old not in s:
    raise SystemExit('v10 WAF ARM PUT block not found')
s = s.replace(old, new, 1)
p.write_text(s)
