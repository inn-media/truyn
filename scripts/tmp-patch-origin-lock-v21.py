from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v20.py').read_text(), 'tmp-patch-origin-lock-v20.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
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
new = r'''rules_deployed=0
last_route_prov='unknown'; last_route_dep='unknown'; last_ruleset_prov='unknown'; last_ruleset_dep='unknown'; last_rule_dep='unknown'
RULESET_URL="https://management.azure.com${RULESET_ID}?api-version=${AFD_API}"
mask "$RULESET_URL"
for _ in $(seq 1 120); do
  routes_ok=1
  for route_name in "${relay_routes[@]}"; do
    rj="$(az afd route show -g "$AFD_RG" --profile-name "$PROFILE_NAME" --endpoint-name "$ep_name" --route-name "$route_name" -o json 2>/dev/null || echo '{}')"
    prov="$(jq -r '.provisioningState // .properties.provisioningState // empty' <<<"$rj")"
    dep="$(jq -r '.deploymentStatus // .properties.deploymentStatus // empty' <<<"$rj")"
    attached="$(jq -r --arg id "${RULESET_ID,,}" 'any((.ruleSets // .properties.ruleSets // [])[]?; ((.id // "")|ascii_downcase)==$id)' <<<"$rj")"
    last_route_prov="${prov:-empty}"; last_route_dep="${dep:-empty}"
    [[ "$prov" == Succeeded && "$attached" == true ]] || { routes_ok=0; break; }
  done

  rsj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$RULESET_URL" 2>/dev/null || echo '{}')"
  rsp="$(jq -r '.properties.provisioningState // empty' <<<"$rsj")"
  rsd="$(jq -r '.properties.deploymentStatus // empty' <<<"$rsj")"
  last_ruleset_prov="${rsp:-empty}"; last_ruleset_dep="${rsd:-empty}"

  child_ok=1
  child_urls=("$SANITIZE_URL" "${inject_rule_urls[@]}")
  for rule_url in "${child_urls[@]}"; do
    cj="$(curl -sS -H "Authorization: Bearer ${arm_token}" "$rule_url" 2>/dev/null || echo '{}')"
    cp="$(jq -r '.properties.provisioningState // empty' <<<"$cj")"
    cd="$(jq -r '.properties.deploymentStatus // empty' <<<"$cj")"
    last_rule_dep="${cd:-empty}"
    [[ "$cp" == Succeeded && "$cd" == Succeeded ]] || { child_ok=0; break; }
  done

  if [[ "$routes_ok" == 1 && "$rsp" == Succeeded && "$rsd" == Succeeded && "$child_ok" == 1 ]] && public_health; then
    rules_deployed=1
    break
  fi
  sleep 4
done
if [[ "$rules_deployed" != 1 ]]; then
  restore_routes
  fail "afd_rules_not_globally_deployed_routeprov_${last_route_prov}_routedep_${last_route_dep}_rsprov_${last_ruleset_prov}_rsdep_${last_ruleset_dep}_ruledep_${last_rule_dep}_rolled_back"
fi'''
if old not in s:
    raise SystemExit('v20 deployment poll block not found')
s = s.replace(old, new, 1)
p.write_text(s)
