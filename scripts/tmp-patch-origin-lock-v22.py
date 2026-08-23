from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v20.py').read_text(), 'tmp-patch-origin-lock-v20.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()

# Add non-secret response markers used only to prove that the exact AFD rules are live on the edge
# before changing the origin guard. They reveal no credential or resource identifier.
old = "PROOF_HEADER='x-truyn-edge-proof'\nPROOF_SECRET=\"$(openssl rand -hex 32)\""
new = "PROOF_HEADER='x-truyn-edge-proof'\nSANITIZE_READY_HEADER='x-truyn-sanitize-ready'\nCLOUDFLARE_READY_HEADER='x-truyn-cloudflare-ready'\nPROOF_SECRET=\"$(openssl rand -hex 32)\""
if old not in s:
    raise SystemExit('proof header block not found')
s = s.replace(old, new, 1)

old = r'''sanitize_body="$(jq -nc --arg h "$PROOF_HEADER" '{properties:{order:1,conditions:[],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Delete",headerName:$h,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"'''
new = r'''sanitize_body="$(jq -nc --arg h "$PROOF_HEADER" --arg rh "$SANITIZE_READY_HEADER" '{properties:{order:1,conditions:[],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Delete",headerName:$h,typeName:"DeliveryRuleHeaderActionParameters"}},{name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:$rh,value:"1",typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"'''
if old not in s:
    raise SystemExit('sanitize body not found')
s = s.replace(old, new, 1)

old = r'''  inject_body="$(jq -nc --arg h "$PROOF_HEADER" --arg v "$PROOF_SECRET" --argjson vals "$chunk_values" --argjson ord "$rule_order" '{properties:{order:$ord,conditions:[{name:"SocketAddr",parameters:{operator:"IPMatch",negateCondition:false,matchValues:$vals,typeName:"DeliveryRuleSocketAddrConditionParameters"}}],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Overwrite",headerName:$h,value:$v,typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"'''
new = r'''  inject_body="$(jq -nc --arg h "$PROOF_HEADER" --arg v "$PROOF_SECRET" --arg rh "$CLOUDFLARE_READY_HEADER" --argjson vals "$chunk_values" --argjson ord "$rule_order" '{properties:{order:$ord,conditions:[{name:"SocketAddr",parameters:{operator:"IPMatch",negateCondition:false,matchValues:$vals,typeName:"DeliveryRuleSocketAddrConditionParameters"}}],actions:[{name:"ModifyRequestHeader",parameters:{headerAction:"Overwrite",headerName:$h,value:$v,typeName:"DeliveryRuleHeaderActionParameters"}},{name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:$rh,value:"1",typeName:"DeliveryRuleHeaderActionParameters"}}],matchProcessingBehavior:"Continue"}}')"'''
if old not in s:
    raise SystemExit('inject body not found')
s = s.replace(old, new, 1)

old = r'''rules_deployed=0
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
fi'''
new = r'''# Control-plane acceptance: Azure must persist the exact ruleset association and all resources must provision.
# deploymentStatus is intentionally NOT used as a blocker; Microsoft documents that it can remain NotStarted
# even when the config is active. The next phase proves edge activation through the real data plane.
control_ready=0
for _ in $(seq 1 120); do
  routes_ok=1
  for route_name in "${relay_routes[@]}"; do
    rj="$(az afd route show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$route_name" -o json 2>/dev/null || echo '{}')"
    prov="$(jq -r '.provisioningState // .properties.provisioningState // empty' <<<"$rj")"
    attached="$(jq -r --arg id "${RULESET_ID,,}" 'any((.ruleSets // .properties.ruleSets // [])[]?; ((.id // "")|ascii_downcase)==$id)' <<<"$rj")"
    [[ "$prov" == Succeeded && "$attached" == true ]] || { routes_ok=0; break; }
  done
  rsj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "https://management.azure.com${RULESET_ID}?api-version=${AFD_API}" 2>/dev/null || echo '{}')"
  rsp="$(jq -r '.properties.provisioningState // empty' <<<"$rsj")"
  child_ok=1
  child_urls=("$SANITIZE_URL" "${inject_rule_urls[@]}")
  for rule_url in "${child_urls[@]}"; do
    cj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$rule_url" 2>/dev/null || echo '{}')"
    cp="$(jq -r '.properties.provisioningState // empty' <<<"$cj")"
    [[ "$cp" == Succeeded ]] || { child_ok=0; break; }
  done
  if [[ "$routes_ok" == 1 && "$rsp" == Succeeded && "$child_ok" == 1 ]]; then control_ready=1; break; fi
  sleep 3
done
if [[ "$control_ready" != 1 ]]; then
  restore_routes
  fail 'afd_control_plane_association_not_ready_rolled_back'
fi

# Data-plane readiness: prove both rule classes are active BEFORE changing the origin guard.
# Through Cloudflare, both markers must be present. Direct to AFD, only the unconditional sanitize marker
# may be present; the Cloudflare SocketAddr marker must be absent.
edge_ready=0
for _ in $(seq 1 450); do
  nonce="$(date +%s%N)"
  pub_code="$(curl -sS --max-time 12 -D /tmp/truyn-edge-public.headers -o /dev/null -w '%{http_code}' "${PUBLIC_RELAY_URL}/health?edgeproof=${nonce}" || true)"
  pub_sanitize="$(awk -F': *' 'tolower($1)=="x-truyn-sanitize-ready" {gsub("\\r", "", $2); print $2}' /tmp/truyn-edge-public.headers | tail -n1)"
  pub_cf="$(awk -F': *' 'tolower($1)=="x-truyn-cloudflare-ready" {gsub("\\r", "", $2); print $2}' /tmp/truyn-edge-public.headers | tail -n1)"
  pub_ray="$(awk -F': *' 'tolower($1)=="cf-ray" {gsub("\\r", "", $2); print $2}' /tmp/truyn-edge-public.headers | tail -n1)"

  direct_code="$(curl -sS --max-time 12 --connect-to "${RELAY_HOST}:443:${AFD_ENDPOINT_HOST}:443" -D /tmp/truyn-edge-direct.headers -o /dev/null -w '%{http_code}' "${PUBLIC_RELAY_URL}/health?edgeproof=${nonce}" || true)"
  direct_sanitize="$(awk -F': *' 'tolower($1)=="x-truyn-sanitize-ready" {gsub("\\r", "", $2); print $2}' /tmp/truyn-edge-direct.headers | tail -n1)"
  direct_cf="$(awk -F': *' 'tolower($1)=="x-truyn-cloudflare-ready" {gsub("\\r", "", $2); print $2}' /tmp/truyn-edge-direct.headers | tail -n1)"

  if [[ "$pub_code" == 200 && -n "$pub_ray" && "$pub_sanitize" == 1 && "$pub_cf" == 1 && "$direct_code" == 200 && "$direct_sanitize" == 1 && -z "$direct_cf" ]]; then
    edge_ready=1
    break
  fi
  sleep 4
done
if [[ "$edge_ready" != 1 ]]; then
  restore_routes
  fail 'afd_edge_markers_not_converged_rolled_back'
fi
echo 'AFD_EDGE_MARKERS=PASS cloudflare_both direct_sanitize_only'
'''
if old not in s:
    raise SystemExit('v20 deployment poll block not found')
s = s.replace(old, new, 1)

p.write_text(s)
