from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v15.py').read_text(), 'tmp-patch-origin-lock-v15.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('az afd rule delete -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --rule-name "$SANITIZE_RULE"')
end = s.index('echo "AFD_RULESET=PASS routes=${#relay_routes[@]} cloudflare_ranges=${#cf_ranges[@]}"')
end = s.index('\n', end) + 1
new = r'''SANITIZE_URL="https://management.azure.com${RULESET_ID}/rules/${SANITIZE_RULE}?api-version=${AFD_API}"
INJECT_URL="https://management.azure.com${RULESET_ID}/rules/${INJECT_RULE}?api-version=${AFD_API}"
mask "$SANITIZE_URL"; mask "$INJECT_URL"

sanitize_body="$(jq -nc --arg h "$PROOF_HEADER" '{properties:{order:1,conditions:[],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Delete",headerName:$h,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"
inject_body="$(jq -nc --arg h "$PROOF_HEADER" --arg v "$PROOF_SECRET" --argjson vals "$cf_values" '{properties:{order:2,conditions:[{name:"SocketAddr",parameters:{operator:"IPMatch",negateCondition:false,matchValues:$vals,typeName:"DeliveryRuleSocketAddrConditionParameters"}}],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Overwrite",headerName:$h,value:$v,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"

arm_token="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
[[ -n "$arm_token" ]] || fail 'afd_rules_arm_token_missing'
mask "$arm_token"

sanitize_http="$(curl -sS -o /tmp/truyn-sanitize-put.json -w '%{http_code}' -X PUT -H "Authorization: Bearer ${arm_token}" -H 'Content-Type: application/json' --data "$sanitize_body" "$SANITIZE_URL" || true)"
if [[ ! "$sanitize_http" =~ ^2 ]]; then
  sanitize_code="$(jq -r '.error.code // empty' /tmp/truyn-sanitize-put.json 2>/dev/null || true)"
  safe_code="$(printf '%s' "${sanitize_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "afd_sanitize_rule_arm_http_${sanitize_http}_${safe_code:-unknown}"
fi

inject_http="$(curl -sS -o /tmp/truyn-inject-put.json -w '%{http_code}' -X PUT -H "Authorization: Bearer ${arm_token}" -H 'Content-Type: application/json' --data "$inject_body" "$INJECT_URL" || true)"
if [[ ! "$inject_http" =~ ^2 ]]; then
  inject_code="$(jq -r '.error.code // empty' /tmp/truyn-inject-put.json 2>/dev/null || true)"
  safe_code="$(printf '%s' "${inject_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "afd_inject_rule_arm_http_${inject_http}_${safe_code:-unknown}"
fi

rules_ready=0
for _ in $(seq 1 90); do
  sj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$SANITIZE_URL" 2>/dev/null || echo '{}')"
  ij="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$INJECT_URL" 2>/dev/null || echo '{}')"
  sp="$(jq -r '.properties.provisioningState // empty' <<<"$sj")"
  ip="$(jq -r '.properties.provisioningState // empty' <<<"$ij")"
  [[ "$sp" == Succeeded && "$ip" == Succeeded ]] && { rules_ready=1; break; }
  sleep 3
done
[[ "$rules_ready" == 1 ]] || fail 'afd_origin_proof_rules_not_ready'
echo "AFD_RULESET=PASS routes=${#relay_routes[@]} cloudflare_ranges=${#cf_ranges[@]} rules=2"
'''
s = s[:start] + new + s[end:]
p.write_text(s)
