#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_RELAY_URL="${PUBLIC_RELAY_URL:-https://relay.truyn.org}"
RELAY_HOST="${RELAY_HOST:-relay.truyn.org}"
ACA_API='2025-01-01'
AFD_API='2025-04-15'
RULE_NAME='TruynCloudflareSocketOnly'
NEW_WAF_NAME='truyn-relay-cloudflare-only'
NEW_SP_NAME='truyn-relay-cloudflare-only'
RESULT_FILE="${ORIGIN_LOCK_RESULT_FILE:-/tmp/origin-lock-result}"
: >"$RESULT_FILE"

mask(){ [[ -n "${1:-}" ]] && echo "::add-mask::$1"; }
result(){ printf '%s\n' "$1" | tee "$RESULT_FILE"; }
fail(){ result "FAIL $1"; exit 1; }
trap 'rc=$?; [[ $rc -eq 0 || -s "$RESULT_FILE" ]] || printf "FAIL unexpected line=%s rc=%s\n" "$LINENO" "$rc" >"$RESULT_FILE"' ERR

public_health(){
  local code
  code="$(curl -sS --max-time 12 -D /tmp/truyn-public.headers -o /tmp/truyn-public.body -w '%{http_code}' "$PUBLIC_RELAY_URL/health" || true)"
  [[ "$code" == 200 ]] && grep -qi '^cf-ray:' /tmp/truyn-public.headers
}

public_register(){
  curl -sS --max-time 12 -o /tmp/truyn-register.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$PUBLIC_RELAY_URL/v1/register" || true
}

public_ws(){
  curl -sS --http1.1 --max-time 12 -o /tmp/truyn-ws.body -w '%{http_code}' \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dHJ1eW4tb3JpZ2luLWxvY2s=' \
    "$PUBLIC_RELAY_URL/v1/fast/socket?nodeId=origin-lock" || true
}

# 1. Require an already-working Cloudflare public path.
public_health || fail 'public_cloudflare_health_not_200'
BASE_REGISTER="$(public_register)"
BASE_WS="$(public_ws)"
[[ "$BASE_REGISTER" != 000 && ! "$BASE_REGISTER" =~ ^5 ]] || fail "public_register_bad_${BASE_REGISTER}"
[[ "$BASE_WS" != 000 && ! "$BASE_WS" =~ ^5 ]] || fail "public_ws_bad_${BASE_WS}"
echo "BASELINE=PASS health=200 register=${BASE_REGISTER} ws=${BASE_WS} cloudflare=true"

# 2. Resolve the unique Azure Front Door profile that actually serves relay.truyn.org.
: >/tmp/truyn-live-afd.tsv
profiles="$(az resource list --resource-type Microsoft.Cdn/profiles -o json)"
mapfile -t profile_ids < <(jq -r '.[]? | select((.sku.name // "") | test("AzureFrontDoor";"i")) | .id' <<<"$profiles")
for pid in "${profile_ids[@]}"; do
  [[ -n "$pid" ]] || continue
  mask "$pid"
  eps="$(az rest --method get --url "https://management.azure.com${pid}/afdEndpoints?api-version=${AFD_API}" 2>/dev/null || echo '{}')"
  while IFS=$'\t' read -r host enabled eid; do
    [[ "$enabled" == Enabled && -n "$host" ]] || continue
    mask "$host"; mask "$eid"
    code="$(curl -sS --max-time 12 --connect-to "${RELAY_HOST}:443:${host}:443" -o /tmp/truyn-afd-probe.body -w '%{http_code}' "$PUBLIC_RELAY_URL/health" || true)"
    [[ "$code" == 200 ]] && printf '%s\t%s\t%s\n' "$pid" "$host" "$eid" >>/tmp/truyn-live-afd.tsv
  done < <(jq -r '.value[]? | [(.properties.hostName // ""),(.properties.enabledState // ""),(.id // "")] | @tsv' <<<"$eps")
done
mapfile -t live_lines < <(sort -u /tmp/truyn-live-afd.tsv | sed '/^$/d')
[[ "${#live_lines[@]}" == 1 ]] || fail "frontdoor_profile_not_unique_count_${#live_lines[@]}"
IFS=$'\t' read -r PROFILE_ID AFD_ENDPOINT_HOST AFD_ENDPOINT_ID <<<"${live_lines[0]}"
mask "$PROFILE_ID"; mask "$AFD_ENDPOINT_HOST"; mask "$AFD_ENDPOINT_ID"
profile_json="$(az resource show --ids "$PROFILE_ID" --api-version "$AFD_API" -o json)"
PROFILE_NAME="$(jq -r '.name' <<<"$profile_json")"
AFD_RG="$(jq -r '.resourceGroup' <<<"$profile_json")"
AFD_SKU="$(jq -r '.sku.name' <<<"$profile_json")"
FDID="$(jq -r '.properties.frontDoorId // empty' <<<"$profile_json")"
[[ -n "$PROFILE_NAME" && -n "$AFD_RG" && -n "$FDID" ]] || fail 'frontdoor_identity_incomplete'
for v in "$PROFILE_NAME" "$AFD_RG" "$FDID"; do mask "$v"; done

custom_domains="$(az afd custom-domain list -g "$AFD_RG" --profile-name "$PROFILE_NAME" -o json)"
CUSTOM_DOMAIN_ID="$(jq -r --arg h "$RELAY_HOST" '.[]? | select(((.hostName // .properties.hostName // "")|ascii_downcase)==($h|ascii_downcase)) | .id' <<<"$custom_domains" | head -1)"
[[ -n "$CUSTOM_DOMAIN_ID" ]] || fail 'frontdoor_custom_domain_not_found'
mask "$CUSTOM_DOMAIN_ID"
echo 'FRONTDOOR_DISCOVERY=PASS exact_profile=true exact_custom_domain=true'

# 3. Resolve the live relay Container App.
APP=''; RG=''; FQDN=''; APP_ID=''
while IFS=$'\t' read -r n g f; do
  [[ -n "$f" ]] || continue
  j="$(az containerapp show -g "$g" -n "$n" -o json)"
  role="$(jq -r '[.properties.template.containers[0].env[]? | select(.name=="TRUYN_ROLE") | .value][0] // empty' <<<"$j")"
  [[ "$role" == relay || "$n" == *relay* ]] || continue
  APP="$n"; RG="$g"; FQDN="$f"; APP_ID="$(jq -r '.id' <<<"$j")"; break
done < <(az containerapp list --query "[?properties.configuration.ingress.external==\`true\`].[name,resourceGroup,properties.configuration.ingress.fqdn]" -o tsv)
[[ -n "$APP" && -n "$RG" && -n "$FQDN" && -n "$APP_ID" ]] || fail 'relay_containerapp_not_found'
for v in "$APP" "$RG" "$FQDN" "$APP_ID"; do mask "$v"; done
ORIGIN="https://${FQDN}"; mask "$ORIGIN"

# 4. Exact-profile application guard: Front Door injects X-Azure-FDID; direct callers cannot satisfy it by guessing.
SECRET_NAME='truyn-origin-fdid'
mask "$SECRET_NAME"
az containerapp secret set -g "$RG" -n "$APP" --secrets "${SECRET_NAME}=${FDID}" --only-show-errors >/dev/null
az containerapp update -g "$RG" -n "$APP" \
  --remove-env-vars TRUYN_ORIGIN_GUARD_TOKEN_EXPIRES_AT TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN TRUYN_ORIGIN_GUARD_PREVIOUS_TOKEN_EXPIRES_AT \
  --set-env-vars TRUYN_ORIGIN_GUARD=1 TRUYN_ORIGIN_GUARD_HEADER=x-azure-fdid "TRUYN_ORIGIN_GUARD_TOKEN=secretref:${SECRET_NAME}" \
  --only-show-errors >/dev/null

guard_ok=0
for _ in $(seq 1 100); do
  reg="$(public_register)"
  direct="$(curl -sS --max-time 10 -o /tmp/truyn-direct-guard.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$ORIGIN/v1/register" || true)"
  if public_health && [[ "$reg" == "$BASE_REGISTER" && "$direct" == 403 ]]; then guard_ok=1; break; fi
  sleep 3
done
[[ "$guard_ok" == 1 ]] || fail 'fdid_guard_did_not_converge'
fake="$(curl -sS --max-time 10 -o /tmp/truyn-direct-fake.body -w '%{http_code}' -X POST -H 'content-type: application/json' -H 'x-azure-fdid: attacker' --data '{}' "$ORIGIN/v1/register" || true)"
[[ "$fake" == 403 ]] || fail "fdid_fake_header_not_denied_${fake}"
echo 'FDID_APP_GUARD=PASS direct_missing=403 direct_fake=403 public_path_preserved=true'

# 5. Platform network guard: Container App accepts only AzureFrontDoor.Backend IPv4 ranges.
app_json="$(az containerapp show -g "$RG" -n "$APP" -o json)"
INGRESS_BACKUP="$(jq -c '.properties.configuration.ingress' <<<"$app_json")"
mapfile -t afd_ranges < <(az network list-service-tags --location global -o json | jq -r '.values[]? | select(.name=="AzureFrontDoor.Backend") | .properties.addressPrefixes[]?' | grep -E '^[0-9]+(\.[0-9]+){3}/[0-9]+$' | sort -u)
[[ "${#afd_ranges[@]}" -gt 0 && "${#afd_ranges[@]}" -le 300 ]] || fail "afd_service_tag_bad_count_${#afd_ranges[@]}"
for c in "${afd_ranges[@]}"; do mask "$c"; done
rules="$(printf '%s\n' "${afd_ranges[@]}" | jq -Rsc 'split("\n") | map(select(length>0)) | to_entries | map({name:("afd-backend-"+((.key+1)|tostring)),description:"AzureFrontDoor.Backend",ipAddressRange:.value,action:"Allow"})')"
locked_ingress="$(jq --argjson r "$rules" '.ipSecurityRestrictions=$r' <<<"$INGRESS_BACKUP")"
patch="$(jq -nc --argjson i "$locked_ingress" '{properties:{configuration:{ingress:$i}}}')"
ARM_TOKEN="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
mask "$ARM_TOKEN"
patch_code="$(curl -sS -o /tmp/truyn-aca-patch.json -w '%{http_code}' -X PATCH -H "Authorization: Bearer ${ARM_TOKEN}" -H 'Content-Type: application/json' --data "$patch" "https://management.azure.com${APP_ID}?api-version=${ACA_API}" || true)"
[[ "$patch_code" =~ ^2 ]] || fail "aca_network_patch_http_${patch_code}"

network_ok=0
for _ in $(seq 1 120); do
  cur="$(az containerapp show -g "$RG" -n "$APP" -o json 2>/dev/null || echo '{}')"
  cnt="$(jq '(.properties.configuration.ingress.ipSecurityRestrictions // []) | length' <<<"$cur" 2>/dev/null || echo 0)"
  direct_h="$(curl -4 -sS --max-time 10 -o /tmp/truyn-direct-health.body -w '%{http_code}' "$ORIGIN/health" || true)"
  if [[ "$cnt" == "${#afd_ranges[@]}" && "$direct_h" == 403 ]] && public_health; then network_ok=1; break; fi
  sleep 4
done
if [[ "$network_ok" != 1 ]]; then
  restore="$(jq -nc --argjson i "$INGRESS_BACKUP" '{properties:{configuration:{ingress:$i}}}')"
  curl -sS -o /dev/null -X PATCH -H "Authorization: Bearer ${ARM_TOKEN}" -H 'Content-Type: application/json' --data "$restore" "https://management.azure.com${APP_ID}?api-version=${ACA_API}" || true
  fail 'aca_network_lock_failed_rolled_back'
fi
DIRECT_ORIGIN_HTTP="$(curl -4 -sS --max-time 10 -o /tmp/truyn-origin-http.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$ORIGIN/v1/register" || true)"
DIRECT_ORIGIN_WS="$(curl -4 -sS --http1.1 --max-time 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tb3JpZ2luLWxvY2s=' "$ORIGIN/v1/fast/socket" || true)"
[[ "$DIRECT_ORIGIN_HTTP" == 403 && "$DIRECT_ORIGIN_WS" == 403 ]] || fail "direct_origin_not_closed_http_${DIRECT_ORIGIN_HTTP}_ws_${DIRECT_ORIGIN_WS}"
echo "ACA_NETWORK_LOCK=PASS afd_backend_ranges=${#afd_ranges[@]} direct_http=403 direct_ws=403"

# 6. Front Door layer: reuse any existing WAF attached to relay.truyn.org; otherwise attach a dedicated one.
SP_URL="https://management.azure.com${PROFILE_ID}/securityPolicies?api-version=${AFD_API}"
security_policies="$(az rest --method get --url "$SP_URL" 2>/dev/null || echo '{"value":[]}')"
existing_sp="$(jq -c --arg d "${CUSTOM_DOMAIN_ID,,}" '.value[]? | select(any(.properties.parameters.associations[]?.domains[]?; ((.id // "")|ascii_downcase)==$d))' <<<"$security_policies" | head -1)"
NEW_SECURITY_POLICY=0
if [[ -n "$existing_sp" ]]; then
  WAF_ID="$(jq -r '.properties.parameters.wafPolicy.id // empty' <<<"$existing_sp")"
  SECURITY_POLICY_NAME="$(jq -r '.name // empty' <<<"$existing_sp")"
  [[ -n "$WAF_ID" && -n "$SECURITY_POLICY_NAME" ]] || fail 'existing_security_policy_missing_waf'
else
  if ! az network front-door waf-policy show -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" >/dev/null 2>&1; then
    az network front-door waf-policy create -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" --sku "$AFD_SKU" --location Global --mode Prevention --enabled-state Enabled --only-show-errors >/dev/null
  fi
  WAF_ID="$(az network front-door waf-policy show -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" --query id -o tsv)"
  SECURITY_POLICY_NAME="$NEW_SP_NAME"
  NEW_SECURITY_POLICY=1
fi
mask "$WAF_ID"; mask "$SECURITY_POLICY_NAME"
WAF_NAME="${WAF_ID##*/}"
WAF_RG="$(sed -n 's#.*resourceGroups/\([^/]*\)/providers/.*#\1#p' <<<"$WAF_ID")"
[[ -n "$WAF_NAME" && -n "$WAF_RG" ]] || fail 'waf_identity_parse_failed'
mask "$WAF_NAME"; mask "$WAF_RG"

mapfile -t cf_ranges < <({ curl -fsS https://www.cloudflare.com/ips-v4; curl -fsS https://www.cloudflare.com/ips-v6; } | sed '/^[[:space:]]*$/d' | sort -u)
[[ "${#cf_ranges[@]}" -ge 15 ]] || fail "cloudflare_ranges_bad_count_${#cf_ranges[@]}"
for c in "${cf_ranges[@]}"; do mask "$c"; done

az network front-door waf-policy update -g "$WAF_RG" --policy-name "$WAF_NAME" --mode Prevention --enabled-state Enabled --only-show-errors >/dev/null
az network front-door waf-policy rule delete -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --only-show-errors >/dev/null 2>&1 || true
used_priorities="$(az network front-door waf-policy rule list -g "$WAF_RG" --policy-name "$WAF_NAME" -o json 2>/dev/null | jq -r '.[].priority' || true)"
priority=''
for p in $(seq 1 1000); do grep -qx "$p" <<<"$used_priorities" || { priority="$p"; break; }; done
[[ -n "$priority" ]] || fail 'no_free_waf_priority'
az network front-door waf-policy rule create -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --priority "$priority" --rule-type MatchRule --action Block --defer --only-show-errors >/dev/null
az network front-door waf-policy rule match-condition add -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --match-variable SocketAddr --operator IPMatch --values "${cf_ranges[@]}" --negate true --only-show-errors >/dev/null

if [[ "$NEW_SECURITY_POLICY" == 1 ]]; then
  waf_sp_url="https://management.azure.com${PROFILE_ID}/securityPolicies/${SECURITY_POLICY_NAME}?api-version=${AFD_API}"
  sp_body="$(jq -nc --arg w "$WAF_ID" --arg d "$CUSTOM_DOMAIN_ID" '{properties:{parameters:{type:"WebApplicationFirewall",wafPolicy:{id:$w},associations:[{domains:[{id:$d}],patternsToMatch:["/*"]}]}}}')"
  az rest --method put --url "$waf_sp_url" --headers 'Content-Type=application/json' --body "$sp_body" >/dev/null
else
  waf_sp_url="https://management.azure.com${PROFILE_ID}/securityPolicies/${SECURITY_POLICY_NAME}?api-version=${AFD_API}"
fi

# 7. Prove Cloudflare stays open while both direct Azure entry points are closed.
afd_ok=0
for _ in $(seq 1 150); do
  sp="$(az rest --method get --url "$waf_sp_url" 2>/dev/null || echo '{}')"
  prov="$(jq -r '.properties.provisioningState // empty' <<<"$sp")"
  dep="$(jq -r '.properties.deploymentStatus // empty' <<<"$sp")"
  pub="$(public_register)"
  direct_afd="$(curl -sS --max-time 10 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /tmp/truyn-direct-afd.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$PUBLIC_RELAY_URL/v1/register" || true)"
  if public_health && [[ "$pub" == "$BASE_REGISTER" && "$direct_afd" == 403 && "$prov" == Succeeded && "$dep" == Succeeded ]]; then afd_ok=1; break; fi
  sleep 5
done
if [[ "$afd_ok" != 1 ]]; then
  az network front-door waf-policy rule delete -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --only-show-errors >/dev/null 2>&1 || true
  if [[ "$NEW_SECURITY_POLICY" == 1 ]]; then az rest --method delete --url "$waf_sp_url" >/dev/null 2>&1 || true; fi
  fail 'frontdoor_cloudflare_only_rule_failed_rolled_back'
fi

DIRECT_AFD_HTTP="$(curl -sS --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /tmp/truyn-afd-http.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$PUBLIC_RELAY_URL/v1/register" || true)"
DIRECT_AFD_WS="$(curl -sS --http1.1 --max-time 10 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tYWZkLWxvY2s=' "$PUBLIC_RELAY_URL/v1/fast/socket" || true)"
FINAL_REGISTER="$(public_register)"
FINAL_WS="$(public_ws)"
public_health || fail 'final_public_health_failed'
[[ "$FINAL_REGISTER" == "$BASE_REGISTER" && "$FINAL_WS" == "$BASE_WS" ]] || fail "final_public_semantics_changed_reg_${FINAL_REGISTER}_ws_${FINAL_WS}"
[[ "$DIRECT_AFD_HTTP" == 403 && "$DIRECT_AFD_WS" == 403 ]] || fail "direct_afd_not_closed_http_${DIRECT_AFD_HTTP}_ws_${DIRECT_AFD_WS}"
[[ "$DIRECT_ORIGIN_HTTP" == 403 && "$DIRECT_ORIGIN_WS" == 403 ]] || fail 'direct_origin_final_not_closed'

result "PASS cloudflare_path_open direct_afd_http_403 direct_afd_ws_403 direct_origin_http_403 direct_origin_ws_403 aca_rules_${#afd_ranges[@]} cf_ranges_${#cf_ranges[@]}"
