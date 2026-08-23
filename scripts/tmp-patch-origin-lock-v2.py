from pathlib import Path

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('# 2. Resolve the unique Azure Front Door profile')
end = s.index('# 4. Exact-profile application guard')
new = r'''# 2-3. Resolve exact custom domain -> route -> origin group -> relay Container App.
: >/tmp/truyn-relay-apps.tsv
while IFS=$'\t' read -r n g f; do
  [[ -n "$f" ]] || continue
  j="$(az containerapp show -g "$g" -n "$n" -o json)"
  role="$(jq -r '[.properties.template.containers[0].env[]? | select(.name=="TRUYN_ROLE") | .value][0] // empty' <<<"$j")"
  [[ "$role" == relay || "$n" == *relay* ]] || continue
  appid="$(jq -r '.id' <<<"$j")"
  printf '%s\t%s\t%s\t%s\n' "$f" "$n" "$g" "$appid" >>/tmp/truyn-relay-apps.tsv
done < <(az containerapp list --query "[?properties.configuration.ingress.external==\`true\`].[name,resourceGroup,properties.configuration.ingress.fqdn]" -o tsv)
[[ -s /tmp/truyn-relay-apps.tsv ]] || fail 'relay_containerapp_candidates_empty'

: >/tmp/truyn-route-exact.tsv
profiles="$(az resource list --resource-type Microsoft.Cdn/profiles -o json)"
while IFS=$'\t' read -r pid pname prg sku; do
  [[ -n "$pid" && -n "$pname" && -n "$prg" ]] || continue
  [[ "$sku" == *AzureFrontDoor* ]] || continue
  pjson="$(az resource show --ids "$pid" --api-version "$AFD_API" -o json 2>/dev/null || echo '{}')"
  fdid="$(jq -r '.properties.frontDoorId // empty' <<<"$pjson")"
  [[ -n "$fdid" ]] || continue
  domains="$(az afd custom-domain list -g "$prg" --profile-name "$pname" -o json 2>/dev/null || echo '[]')"
  cdid="$(jq -r --arg h "$RELAY_HOST" '.[]? | select(((.hostName // .properties.hostName // "")|ascii_downcase)==($h|ascii_downcase)) | .id' <<<"$domains" | head -1)"
  [[ -n "$cdid" ]] || continue
  endpoints="$(az afd endpoint list -g "$prg" --profile-name "$pname" -o json 2>/dev/null || echo '[]')"
  while IFS=$'\t' read -r ep eph epid; do
    [[ -n "$ep" && -n "$eph" && -n "$epid" ]] || continue
    routes="$(az afd route list -g "$prg" --profile-name "$pname" --endpoint-name "$ep" -o json 2>/dev/null || echo '[]')"
    while IFS= read -r route; do
      [[ -n "$route" ]] || continue
      has_domain="$(jq -r --arg d "${cdid,,}" 'any(.customDomains[]?; ((.id // "")|ascii_downcase)==$d)' <<<"$route")"
      [[ "$has_domain" == true ]] || continue
      ogid="$(jq -r '.originGroup.id // empty' <<<"$route")"
      [[ -n "$ogid" ]] || continue
      og="${ogid##*/}"
      origins="$(az afd origin list -g "$prg" --profile-name "$pname" --origin-group-name "$og" -o json 2>/dev/null || echo '[]')"
      while IFS= read -r origin_host; do
        [[ -n "$origin_host" ]] || continue
        while IFS=$'\t' read -r fqdn app arg appid; do
          [[ "${origin_host,,}" == "${fqdn,,}" ]] || continue
          printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$pname" "$prg" "$sku" "$fdid" "$eph" "$epid" "$cdid" "$app" "$arg" "$fqdn" "$appid" >>/tmp/truyn-route-exact.tsv
        done </tmp/truyn-relay-apps.tsv
      done < <(jq -r '.[]? | select((.enabledState // .properties.enabledState // "Enabled") == "Enabled") | (.hostName // .properties.hostName // empty)' <<<"$origins")
    done < <(jq -c '.[]?' <<<"$routes")
  done < <(jq -r '.[]? | [(.name // ""),(.hostName // .properties.hostName // ""),(.id // "")] | @tsv' <<<"$endpoints")
done < <(jq -r '.[]? | [(.id // ""),(.name // ""),(.resourceGroup // ""),(.sku.name // "")] | @tsv' <<<"$profiles")

mapfile -t exact < <(sort -u /tmp/truyn-route-exact.tsv | sed '/^$/d')
[[ "${#exact[@]}" == 1 ]] || fail "frontdoor_route_origin_not_unique_count_${#exact[@]}"
IFS=$'\t' read -r PROFILE_ID PROFILE_NAME AFD_RG AFD_SKU FDID AFD_ENDPOINT_HOST AFD_ENDPOINT_ID CUSTOM_DOMAIN_ID APP RG FQDN APP_ID <<<"${exact[0]}"
for v in "$PROFILE_ID" "$PROFILE_NAME" "$AFD_RG" "$FDID" "$AFD_ENDPOINT_HOST" "$AFD_ENDPOINT_ID" "$CUSTOM_DOMAIN_ID" "$APP" "$RG" "$FQDN" "$APP_ID"; do mask "$v"; done
ORIGIN="https://${FQDN}"; mask "$ORIGIN"
echo 'FRONTDOOR_DISCOVERY=PASS exact_custom_domain_route_origin_app=true'

'''
s = s[:start] + new + s[end:]
s = s.replace('az network list-service-tags --location global', 'az network list-service-tags --location eastus2')
p.write_text(s)
