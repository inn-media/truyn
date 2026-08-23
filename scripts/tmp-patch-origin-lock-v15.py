from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v7.py').read_text(), 'tmp-patch-origin-lock-v7.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('# 6. Front Door layer')
new = r'''# 6. Front Door Standard/Premium rule-set gate.
# WAF policy creation can be subscription-feature gated. This gate uses native AFD rules instead:
#   1) delete any caller-supplied proof header on every request;
#   2) overwrite it with a random proof only when the direct TCP SocketAddr belongs to Cloudflare.
# The origin guard then requires that proof. Direct AFD callers cannot preserve or forge the header.
RULESET_NAME='truynCloudflareOriginProof'
SANITIZE_RULE='SanitizeOriginProof'
INJECT_RULE='InjectOriginProofForCloudflare'
PROOF_HEADER='x-truyn-edge-proof'
PROOF_SECRET="$(openssl rand -hex 32)"
PROOF_SECRET_NAME='truyn-origin-edge-proof'
for v in "$PROOF_SECRET" "$PROOF_SECRET_NAME"; do mask "$v"; done

mapfile -t cf_ranges < <({ curl -fsS https://www.cloudflare.com/ips-v4; curl -fsS https://www.cloudflare.com/ips-v6; } | sed '/^[[:space:]]*$/d' | sort -u)
[[ "${#cf_ranges[@]}" -ge 15 ]] || fail "cloudflare_ranges_bad_count_${#cf_ranges[@]}"
for c in "${cf_ranges[@]}"; do mask "$c"; done
cf_values="$(printf '%s\n' "${cf_ranges[@]}" | jq -Rsc 'split("\n") | map(select(length>0))')"

ep_name="${AFD_ENDPOINT_ID##*/}"
[[ -n "$ep_name" ]] || fail 'afd_endpoint_name_empty'
mask "$ep_name"

# Find every route for relay.truyn.org. All must receive the same proof ruleset so no path can bypass it.
routes_json="$(az afd route list -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" -o json)"
mapfile -t relay_routes < <(jq -r --arg d "${CUSTOM_DOMAIN_ID,,}" '.[]? | select(any((.customDomains // .properties.customDomains // [])[]?; ((.id // "")|ascii_downcase)==$d)) | .name' <<<"$routes_json" | sort -u)
[[ "${#relay_routes[@]}" -gt 0 ]] || fail 'relay_custom_domain_routes_empty'
for r in "${relay_routes[@]}"; do mask "$r"; done

# Create or reuse the dedicated ruleset, then replace only our two rules idempotently.
if ! az afd rule-set show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" >/dev/null 2>&1; then
  az afd rule-set create -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --only-show-errors >/dev/null || fail 'afd_ruleset_create_failed'
fi
RULESET_ID="$(az afd rule-set show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --query id -o tsv)"
[[ -n "$RULESET_ID" ]] || fail 'afd_ruleset_id_empty'
mask "$RULESET_ID"

az afd rule delete -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --rule-name "$SANITIZE_RULE" --yes --only-show-errors >/dev/null 2>&1 || true
az afd rule delete -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --rule-name "$INJECT_RULE" --yes --only-show-errors >/dev/null 2>&1 || true

sanitize_actions="$(jq -nc --arg h "$PROOF_HEADER" '[{name:"ModifyRequestHeader",parameters:{headerAction:"Delete",headerName:$h,typeName:"DeliveryRuleHeaderActionParameters"}}]')"
inject_actions="$(jq -nc --arg h "$PROOF_HEADER" --arg v "$PROOF_SECRET" '[{name:"ModifyRequestHeader",parameters:{headerAction:"Overwrite",headerName:$h,value:$v,typeName:"DeliveryRuleHeaderActionParameters"}}]')"
inject_conditions="$(jq -nc --argjson vals "$cf_values" '[{name:"SocketAddr",parameters:{operator:"IPMatch",negateCondition:false,matchValues:$vals,typeName:"DeliveryRuleSocketAddrConditionParameters"}}]')"

az afd rule create -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --rule-name "$SANITIZE_RULE" --order 1 --match-processing-behavior Continue --actions "$sanitize_actions" --conditions '[]' --only-show-errors >/dev/null || fail 'afd_sanitize_rule_create_failed'
az afd rule create -g "$AFD_RG" --profile-name "$PROFILE_NAME" --rule-set-name "$RULESET_NAME" --rule-name "$INJECT_RULE" --order 2 --match-processing-behavior Continue --actions "$inject_actions" --conditions "$inject_conditions" --only-show-errors >/dev/null || fail 'afd_inject_rule_create_failed'

echo "AFD_RULESET=PASS routes=${#relay_routes[@]} cloudflare_ranges=${#cf_ranges[@]}"

# Back up each route's existing rule sets, append ours, and wait for deployment.
mkdir -p /tmp/truyn-route-backups
idx=0
for route_name in "${relay_routes[@]}"; do
  idx=$((idx+1))
  route_json="$(az afd route show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$route_name" -o json)"
  existing_rs="$(jq -c '(.ruleSets // .properties.ruleSets // [])' <<<"$route_json")"
  jq -nc --arg n "$route_name" --argjson rs "$existing_rs" '{name:$n,ruleSets:$rs}' >"/tmp/truyn-route-backups/${idx}.json"
  merged_rs="$(jq -c --arg id "${RULESET_ID,,}" --arg raw "$RULESET_ID" '(.ruleSets // .properties.ruleSets // []) as $old | ($old + (if any($old[]?; ((.id // "")|ascii_downcase)==$id) then [] else [{id:$raw}] end))' <<<"$route_json")"
  az afd route update -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$route_name" --formatted-rule-sets "$merged_rs" --only-show-errors >/dev/null || fail "afd_route_ruleset_attach_failed_${idx}"
done

restore_routes(){
  set +e
  local f rn rs
  for f in /tmp/truyn-route-backups/*.json; do
    [[ -f "$f" ]] || continue
    rn="$(jq -r '.name' "$f")"
    rs="$(jq -c '.ruleSets' "$f")"
    az afd route update -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$rn" --formatted-rule-sets "$rs" --only-show-errors >/dev/null 2>&1 || true
  done
}

rules_deployed=0
for _ in $(seq 1 90); do
  all_ok=1
  for route_name in "${relay_routes[@]}"; do
    rj="$(az afd route show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$route_name" -o json 2>/dev/null || echo '{}')"
    prov="$(jq -r '.provisioningState // .properties.provisioningState // empty' <<<"$rj")"
    dep="$(jq -r '.deploymentStatus // .properties.deploymentStatus // empty' <<<"$rj")"
    attached="$(jq -r --arg id "${RULESET_ID,,}" 'any((.ruleSets // .properties.ruleSets // [])[]?; ((.id // "")|ascii_downcase)==$id)' <<<"$rj")"
    [[ "$prov" == Succeeded && "$dep" == Succeeded && "$attached" == true ]] || { all_ok=0; break; }
  done
  if [[ "$all_ok" == 1 ]] && public_health; then rules_deployed=1; break; fi
  sleep 4
done
if [[ "$rules_deployed" != 1 ]]; then
  restore_routes
  fail 'afd_ruleset_did_not_deploy_rolled_back'
fi

# Switch the origin guard only after the rules are globally deployed.
az containerapp secret set -g "$RG" -n "$APP" --secrets "${PROOF_SECRET_NAME}=${PROOF_SECRET}" --only-show-errors >/dev/null || { restore_routes; fail 'edge_proof_secret_set_failed'; }
az containerapp update -g "$RG" -n "$APP" \
  --remove-env-vars TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT \
  --set-env-vars TRUYN_ORIGIN_GUARD=1 "TRUYN_ORIGIN_GUARD_HEADER=${PROOF_HEADER}" "TRUYN_ORIGIN_GUARD_TOKEN=secretref:${PROOF_SECRET_NAME}" \
  --only-show-errors >/dev/null || { restore_routes; fail 'edge_proof_origin_guard_update_failed'; }

rollback_guard(){
  set +e
  az containerapp update -g "$RG" -n "$APP" \
    --remove-env-vars TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT \
    --set-env-vars TRUYN_ORIGIN_GUARD=1 TRUYN_ORIGIN_GUARD_HEADER=x-azure-fdid "TRUYN_ORIGIN_GUARD_TOKEN=secretref:truyn-origin-fdid" \
    --only-show-errors >/dev/null 2>&1 || true
  restore_routes
}

# Prove public Cloudflare path remains open and direct AFD is denied, including a forged proof header.
gate_ok=0
DIRECT_AFD_HTTP=''; DIRECT_AFD_WS=''; DIRECT_AFD_SPOOF=''
for _ in $(seq 1 120); do
  pub="$(public_register)"
  direct_afd="$(curl -sS --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /tmp/truyn-direct-afd.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$PUBLIC_RELAY_URL/v1/register" || true)"
  spoof_afd="$(curl -sS --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /tmp/truyn-direct-afd-spoof.body -w '%{http_code}' -X POST -H 'content-type: application/json' -H "${PROOF_HEADER}: ${PROOF_SECRET}" --data '{}' "$PUBLIC_RELAY_URL/v1/register" || true)"
  if public_health && [[ "$pub" == "$BASE_REGISTER" && "$direct_afd" == 403 && "$spoof_afd" == 403 ]]; then
    gate_ok=1; DIRECT_AFD_HTTP="$direct_afd"; DIRECT_AFD_SPOOF="$spoof_afd"; break
  fi
  sleep 4
done
if [[ "$gate_ok" != 1 ]]; then
  rollback_guard
  fail 'afd_socket_proof_gate_failed_rolled_back'
fi

DIRECT_AFD_WS="$(curl -sS --http1.1 --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tYWZkLWxvY2s=' "$PUBLIC_RELAY_URL/v1/fast/socket" || true)"
DIRECT_AFD_WS_SPOOF="$(curl -sS --http1.1 --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tYWZkLXNwb29m' -H "${PROOF_HEADER}: ${PROOF_SECRET}" "$PUBLIC_RELAY_URL/v1/fast/socket" || true)"
FINAL_REGISTER="$(public_register)"
FINAL_WS="$(public_ws)"
public_health || { rollback_guard; fail 'final_public_health_failed'; }
if [[ "$FINAL_REGISTER" != "$BASE_REGISTER" || "$FINAL_WS" != "$BASE_WS" ]]; then rollback_guard; fail "final_public_semantics_changed_reg_${FINAL_REGISTER}_ws_${FINAL_WS}"; fi
if [[ "$DIRECT_AFD_HTTP" != 403 || "$DIRECT_AFD_SPOOF" != 403 || "$DIRECT_AFD_WS" != 403 || "$DIRECT_AFD_WS_SPOOF" != 403 ]]; then rollback_guard; fail "direct_afd_not_closed_http_${DIRECT_AFD_HTTP}_spoof_${DIRECT_AFD_SPOOF}_ws_${DIRECT_AFD_WS}_wsspoof_${DIRECT_AFD_WS_SPOOF}"; fi
if [[ "$DIRECT_ORIGIN_HTTP" != 403 || "$DIRECT_ORIGIN_WS" != 403 ]]; then rollback_guard; fail 'direct_origin_final_not_closed'; fi

result "PASS cloudflare_path_open direct_afd_http_403 direct_afd_spoof_403 direct_afd_ws_403 direct_afd_ws_spoof_403 direct_origin_http_403 direct_origin_ws_403 routes_${#relay_routes[@]} cf_ranges_${#cf_ranges[@]}"
'''
s = s[:start] + new
p.write_text(s)
