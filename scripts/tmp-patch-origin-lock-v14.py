from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v13.py').read_text(), 'tmp-patch-origin-lock-v13.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
needle = '''  fail "waf_arm_${waf_http}_${safe_code:-unknown}_${safe_msg:-no_message}"
fi'''
replacement = r'''  if grep -qi 'ArmResourceId has incorrect formatting' <<<"$waf_msg"; then
    feature_state="$(az feature show --namespace Microsoft.Network --name AllowFrontdoor --query properties.state -o tsv 2>/dev/null || echo Unknown)"
    feature_state="${feature_state:-Unknown}"
    if [[ "$feature_state" != Registered ]]; then
      az feature register --namespace Microsoft.Network --name AllowFrontdoor --only-show-errors >/dev/null 2>&1 || true
      for _ in $(seq 1 30); do
        feature_state="$(az feature show --namespace Microsoft.Network --name AllowFrontdoor --query properties.state -o tsv 2>/dev/null || echo Unknown)"
        [[ "$feature_state" == Registered ]] && break
        sleep 5
      done
    fi
    if [[ "$feature_state" == Registered ]]; then
      az provider register --namespace Microsoft.Network --only-show-errors >/dev/null 2>&1 || true
      waf_http="$(curl -sS -o /tmp/truyn-waf-put.json -w '%{http_code}' -X PUT -H "Authorization: Bearer ${ARM_WAF_TOKEN}" -H 'Content-Type: application/json' --data "$waf_body" "$WAF_URL" || true)"
      waf_code="$(jq -r '.error.code // empty' /tmp/truyn-waf-put.json 2>/dev/null || true)"
      [[ "$waf_http" =~ ^2 ]] || fail "waf_allowfrontdoor_registered_but_put_http_${waf_http}_${waf_code:-unknown}"
    else
      safe_state="$(printf '%s' "$feature_state" | tr -cd 'A-Za-z0-9_-')"
      fail "waf_allowfrontdoor_feature_${safe_state:-Unknown}"
    fi
  else
    fail "waf_arm_${waf_http}_${safe_code:-unknown}_${safe_msg:-no_message}"
  fi
fi'''
if needle not in s:
    raise SystemExit('v13 terminal WAF failure block not found')
s = s.replace(needle, replacement, 1)
p.write_text(s)
