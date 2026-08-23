from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v16.py').read_text(), 'tmp-patch-origin-lock-v16.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('SANITIZE_URL="https://management.azure.com${RULESET_ID}/rules/${SANITIZE_RULE}?api-version=${AFD_API}"')
marker = 'echo "AFD_RULESET=PASS routes=${#relay_routes[@]} cloudflare_ranges=${#cf_ranges[@]} rules=2"'
end = s.index(marker, start)
end = s.index('\n', end) + 1
new = r'''SANITIZE_URL="https://management.azure.com${RULESET_ID}/rules/${SANITIZE_RULE}?api-version=${AFD_API}"
mask "$SANITIZE_URL"
sanitize_body="$(jq -nc --arg h "$PROOF_HEADER" '{properties:{order:1,conditions:[],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Delete",headerName:$h,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"

arm_token="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
[[ -n "$arm_token" ]] || fail 'afd_rules_arm_token_missing'
mask "$arm_token"

sanitize_http="$(curl -sS -o /tmp/truyn-sanitize-put.json -w '%{http_code}' -X PUT -H "Authorization: Bearer ${arm_token}" -H 'Content-Type: application/json' --data "$sanitize_body" "$SANITIZE_URL" || true)"
if [[ ! "$sanitize_http" =~ ^2 ]]; then
  sanitize_code="$(jq -r '.error.code // empty' /tmp/truyn-sanitize-put.json 2>/dev/null || true)"
  safe_code="$(printf '%s' "${sanitize_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
  fail "afd_sanitize_rule_arm_http_${sanitize_http}_${safe_code:-unknown}"
fi

# Rule-set matchValues are capped at 10. Split Cloudflare CIDRs into multiple OR-equivalent rules.
chunk_size=10
chunk_count=$(( (${#cf_ranges[@]} + chunk_size - 1) / chunk_size ))
[[ "$chunk_count" -gt 0 && "$chunk_count" -le 10 ]] || fail "afd_inject_chunk_count_bad_${chunk_count}"

# Remove the old single-rule name from the failed pre-chunk attempt, if Azure materialized it partially.
OLD_INJECT_URL="https://management.azure.com${RULESET_ID}/rules/${INJECT_RULE}?api-version=${AFD_API}"
curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer ${arm_token}" "$OLD_INJECT_URL" >/dev/null 2>&1 || true

inject_rule_names=()
inject_rule_urls=()
for ((chunk=0; chunk<chunk_count; chunk++)); do
  first=$((chunk * chunk_size))
  vals=("${cf_ranges[@]:first:chunk_size}")
  rule_index=$((chunk + 1))
  rule_name="${INJECT_RULE}${rule_index}"
  rule_order=$((rule_index + 1))
  rule_url="https://management.azure.com${RULESET_ID}/rules/${rule_name}?api-version=${AFD_API}"
  mask "$rule_name"; mask "$rule_url"
  chunk_values="$(printf '%s\n' "${vals[@]}" | jq -Rsc 'split("\n") | map(select(length>0))')"
  value_count="$(jq 'length' <<<"$chunk_values")"
  [[ "$value_count" -gt 0 && "$value_count" -le 10 ]] || fail "afd_inject_chunk_${rule_index}_value_count_${value_count}"
  inject_body="$(jq -nc --arg h "$PROOF_HEADER" --arg v "$PROOF_SECRET" --argjson vals "$chunk_values" --argjson ord "$rule_order" '{properties:{order:$ord,conditions:[{name:"SocketAddr",parameters:{operator:"IPMatch",negateCondition:false,matchValues:$vals,typeName:"DeliveryRuleSocketAddrConditionParameters"}}],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Overwrite",headerName:$h,value:$v,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"
  inject_http="$(curl -sS -o "/tmp/truyn-inject-put-${rule_index}.json" -w '%{http_code}' -X PUT -H "Authorization: Bearer ${arm_token}" -H 'Content-Type: application/json' --data "$inject_body" "$rule_url" || true)"
  if [[ ! "$inject_http" =~ ^2 ]]; then
    inject_code="$(jq -r '.error.code // empty' "/tmp/truyn-inject-put-${rule_index}.json" 2>/dev/null || true)"
    safe_code="$(printf '%s' "${inject_code:-unknown}" | tr -cd 'A-Za-z0-9_-')"
    fail "afd_inject_rule_${rule_index}_arm_http_${inject_http}_${safe_code:-unknown}"
  fi
  inject_rule_names+=("$rule_name")
  inject_rule_urls+=("$rule_url")
done

rules_ready=0
for _ in $(seq 1 90); do
  sj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$SANITIZE_URL" 2>/dev/null || echo '{}')"
  sp="$(jq -r '.properties.provisioningState // empty' <<<"$sj")"
  all_inject_ready=1
  for rule_url in "${inject_rule_urls[@]}"; do
    ij="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$rule_url" 2>/dev/null || echo '{}')"
    ip="$(jq -r '.properties.provisioningState // empty' <<<"$ij")"
    [[ "$ip" == Succeeded ]] || { all_inject_ready=0; break; }
  done
  [[ "$sp" == Succeeded && "$all_inject_ready" == 1 ]] && { rules_ready=1; break; }
  sleep 3
done
[[ "$rules_ready" == 1 ]] || fail 'afd_origin_proof_rules_not_ready'
echo "AFD_RULESET=PASS routes=${#relay_routes[@]} cloudflare_ranges=${#cf_ranges[@]} inject_rules=${chunk_count}"
'''
s = s[:start] + new + s[end:]
p.write_text(s)
