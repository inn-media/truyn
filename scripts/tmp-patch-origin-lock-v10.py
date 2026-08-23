from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v7.py').read_text(), 'tmp-patch-origin-lock-v7.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('# 6. Front Door layer')
end = s.index('# 7. Prove Cloudflare stays open')
new = r'''# 6. Front Door layer via direct ARM REST: dedicated Cloudflare-only WAF policy.
mapfile -t cf_ranges < <({ curl -fsS https://www.cloudflare.com/ips-v4; curl -fsS https://www.cloudflare.com/ips-v6; } | sed '/^[[:space:]]*$/d' | sort -u)
[[ "${#cf_ranges[@]}" -ge 15 ]] || fail "cloudflare_ranges_bad_count_${#cf_ranges[@]}"
for c in "${cf_ranges[@]}"; do mask "$c"; done
cf_values="$(printf '%s\n' "${cf_ranges[@]}" | jq -Rsc 'split("\n") | map(select(length>0))')"

WAF_API='2025-03-01'
WAF_NAME="$NEW_WAF_NAME"
WAF_RG="$AFD_RG"
WAF_ID="/subscriptions/${AZURE_SUBSCRIPTION_ID_VALUE}/resourceGroups/${WAF_RG}/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/${WAF_NAME}"
WAF_URL="https://management.azure.com${WAF_ID}?api-version=${WAF_API}"
mask "$WAF_ID"; mask "$WAF_URL"; mask "$WAF_NAME"; mask "$WAF_RG"

waf_body="$(jq -nc --arg sku "$AFD_SKU" --arg rn "$RULE_NAME" --argjson vals "$cf_values" '{location:"global",sku:{name:$sku},properties:{policySettings:{enabledState:"Enabled",mode:"Prevention"},customRules:{rules:[{name:$rn,priority:1,enabledState:"Enabled",ruleType:"MatchRule",action:"Block",matchConditions:[{matchVariable:"SocketAddr",operator:"IPMatch",negateCondition:true,matchValue:$vals,transforms:[]}]}]},managedRules:{managedRuleSets:[]}}}')"
if ! az rest --method put --url "$WAF_URL" --headers 'Content-Type=application/json' --body "$waf_body" >/tmp/truyn-waf-put.json 2>/tmp/truyn-waf-put.err; then
  if grep -qi 'AuthorizationFailed' /tmp/truyn-waf-put.err; then fail 'waf_arm_authorization_failed'; fi
  if grep -qi 'MissingSubscriptionRegistration' /tmp/truyn-waf-put.err; then fail 'waf_arm_provider_not_registered'; fi
  if grep -qi 'LocationNotAvailable' /tmp/truyn-waf-put.err; then fail 'waf_arm_location_not_available'; fi
  if grep -qi 'Invalid' /tmp/truyn-waf-put.err; then fail 'waf_arm_invalid_request'; fi
  fail 'waf_arm_put_failed'
fi

waf_ready=0
for _ in $(seq 1 60); do
  wj="$(az rest --method get --url "$WAF_URL" 2>/dev/null || echo '{}')"
  wid="$(jq -r '.id // empty' <<<"$wj")"
  enabled="$(jq -r '.properties.policySettings.enabledState // empty' <<<"$wj")"
  mode="$(jq -r '.properties.policySettings.mode // empty' <<<"$wj")"
  rule_count="$(jq '(.properties.customRules.rules // []) | length' <<<"$wj" 2>/dev/null || echo 0)"
  if [[ -n "$wid" && "$enabled" == Enabled && "$mode" == Prevention && "$rule_count" == 1 ]]; then waf_ready=1; break; fi
  sleep 3
done
[[ "$waf_ready" == 1 ]] || fail 'waf_arm_policy_not_ready'
echo "FRONTDOOR_WAF_POLICY=PASS cloudflare_ranges=${#cf_ranges[@]}"

# Attach only to relay.truyn.org custom domain. Reuse our dedicated security-policy name idempotently.
SECURITY_POLICY_NAME="$NEW_SP_NAME"
waf_sp_url="https://management.azure.com${PROFILE_ID}/securityPolicies/${SECURITY_POLICY_NAME}?api-version=${AFD_API}"
sp_body="$(jq -nc --arg w "$WAF_ID" --arg d "$CUSTOM_DOMAIN_ID" '{properties:{parameters:{type:"WebApplicationFirewall",wafPolicy:{id:$w},associations:[{domains:[{id:$d}],patternsToMatch:["/*"]}]}}}')"
if ! az rest --method put --url "$waf_sp_url" --headers 'Content-Type=application/json' --body "$sp_body" >/tmp/truyn-sp-put.json 2>/tmp/truyn-sp-put.err; then
  fail 'waf_security_policy_attach_failed'
fi
NEW_SECURITY_POLICY=1

'''
s = s[:start] + new + s[end:]
p.write_text(s)
