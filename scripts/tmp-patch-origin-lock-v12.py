from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v11.py').read_text(), 'tmp-patch-origin-lock-v11.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''if [[ ! "$waf_http" =~ ^2 ]]; then
  safe_code="$(printf '%s' "${waf_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "waf_arm_http_${waf_http}_code_${safe_code:-unknown}"
fi'''
new = '''if [[ ! "$waf_http" =~ ^2 ]]; then
  safe_code="$(printf '%s' "${waf_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  waf_msg="$(jq -r '.error.message // empty' /tmp/truyn-waf-put.json 2>/dev/null || true)"
  detail_codes="$(jq -r '[.error.details[]?.code // empty] | map(select(length>0)) | join("-")' /tmp/truyn-waf-put.json 2>/dev/null || true)"
  class='other'
  shopt -s nocasematch
  if [[ "$waf_msg" == *location* ]]; then class='location';
  elif [[ "$waf_msg" == *sku* || "$waf_msg" == *tier* ]]; then class='sku';
  elif [[ "$waf_msg" == *socketaddr* || "$waf_msg" == *remoteaddr* || "$waf_msg" == *matchvariable* ]]; then class='match_variable';
  elif [[ "$waf_msg" == *ip*address* || "$waf_msg" == *matchvalue* || "$waf_msg" == *cidr* ]]; then class='match_values';
  elif [[ "$waf_msg" == *managed*rule* ]]; then class='managed_rules';
  elif [[ "$waf_msg" == *custom*rule* ]]; then class='custom_rules';
  elif [[ "$waf_msg" == *policy*setting* ]]; then class='policy_settings';
  elif [[ "$waf_msg" == *already*exist* || "$waf_msg" == *conflict* ]]; then class='existing_resource';
  elif [[ "$waf_msg" == *subscription* || "$waf_msg" == *provider* ]]; then class='provider';
  fi
  shopt -u nocasematch
  safe_details="$(printf '%s' "${detail_codes:-none}" | tr -cd 'A-Za-z0-9_-')"
  fail "waf_arm_http_${waf_http}_code_${safe_code:-unknown}_class_${class}_details_${safe_details:-none}"
fi'''
if old not in s:
    raise SystemExit('v11 WAF failure block not found')
s = s.replace(old, new, 1)
p.write_text(s)
