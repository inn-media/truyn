from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v5.py').read_text(), 'tmp-patch-origin-lock-v5.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('# 5. Platform network guard')
end = s.index('# 6. Front Door layer')
new = r'''# 5. Platform network guard. Validate any already-persisted AFD rules before changing them.
printf '%s\n' "${afd_ranges[@]}" >/tmp/truyn-afd-ranges.txt
python - <<'PY2'
import ipaddress
from pathlib import Path
nets=[ipaddress.ip_network(x.strip()) for x in Path('/tmp/truyn-afd-ranges.txt').read_text().splitlines() if x.strip()]
collapsed=list(ipaddress.collapse_addresses(nets))
Path('/tmp/truyn-afd-collapsed.txt').write_text(''.join(f'{n}\n' for n in collapsed))
PY2
mapfile -t afd_collapsed < <(sed '/^$/d' /tmp/truyn-afd-collapsed.txt)
[[ "${#afd_collapsed[@]}" -gt 0 ]] || fail 'aca_network_collapsed_ranges_empty'
for c in "${afd_collapsed[@]}"; do mask "$c"; done
echo "ACA_NETWORK_PLAN=PASS raw_ranges=${#afd_ranges[@]} collapsed_ranges=${#afd_collapsed[@]}"

cleanup_aca_owned_rules(){
  set +e
  local names n
  names="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null | jq -r '.[]? | .name // empty')"
  while IFS= read -r n; do
    [[ "$n" == afd-backend-* || "$n" == truyn-transition-open ]] || continue
    az containerapp ingress access-restriction remove -g "$RG" -n "$APP" --rule-name "$n" --only-show-errors >/dev/null 2>&1 || true
  done <<<"$names"
}

existing_rules="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null || echo '[]')"
existing_count="$(jq 'length' <<<"$existing_rules")"
foreign_count="$(jq '[.[]? | select((((.name // "") | startswith("afd-backend-")) or (.name // "") == "truyn-transition-open") | not)] | length' <<<"$existing_rules")"
bad_action_count="$(jq '[.[]? | select((.action // "Allow") != "Allow")] | length' <<<"$existing_rules")"
[[ "$foreign_count" == 0 ]] || fail "aca_network_foreign_rules_${foreign_count}"
[[ "$bad_action_count" == 0 ]] || fail "aca_network_non_allow_rules_${bad_action_count}"

printf '%s\n' "${afd_collapsed[@]}" | sort -u >/tmp/truyn-desired-ranges.txt
jq -r '.[]? | select((.name // "") | startswith("afd-backend-")) | (.ipAddress // .ipAddressRange // empty)' <<<"$existing_rules" | sed '/^$/d' | sort -u >/tmp/truyn-existing-ranges.txt
existing_owned_count="$(wc -l </tmp/truyn-existing-ranges.txt | tr -d ' ')"
range_diff="$(comm -3 /tmp/truyn-desired-ranges.txt /tmp/truyn-existing-ranges.txt || true)"

if [[ "$existing_count" -gt 0 && -z "$range_diff" && "$existing_owned_count" == "${#afd_collapsed[@]}" ]]; then
  echo "ACA_NETWORK_EXISTING=PASS exact_afd_backend_set=true rules=${existing_owned_count}"
else
  # Rebuild only TRUYN-owned rules, with a temporary open Allow rule to preserve availability.
  az containerapp ingress access-restriction set -g "$RG" -n "$APP" --rule-name truyn-transition-open --ip-address 0.0.0.0/0 --description 'TRUYN atomic origin-lock transition' --action Allow --only-show-errors >/dev/null || fail 'aca_transition_rule_create_failed'

  if [[ "$existing_count" -gt 0 ]]; then
    names="$(jq -r '.[]? | select((.name // "") | startswith("afd-backend-")) | .name' <<<"$existing_rules")"
    while IFS= read -r n; do
      [[ -n "$n" ]] || continue
      az containerapp ingress access-restriction remove -g "$RG" -n "$APP" --rule-name "$n" --only-show-errors >/dev/null || { cleanup_aca_owned_rules; fail "aca_old_rule_remove_failed_${n}"; }
    done <<<"$names"
  fi

  i=0
  add_ok=1
  for cidr in "${afd_collapsed[@]}"; do
    i=$((i+1))
    if ! az containerapp ingress access-restriction set -g "$RG" -n "$APP" --rule-name "afd-backend-${i}" --ip-address "$cidr" --description 'AzureFrontDoor.Backend' --action Allow --only-show-errors >/dev/null; then
      add_ok=0
      break
    fi
  done
  if [[ "$add_ok" != 1 ]]; then
    cleanup_aca_owned_rules
    public_health || true
    fail "aca_network_rule_add_failed_at_${i}_of_${#afd_collapsed[@]}"
  fi

  installed="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json)"
  installed_owned="$(jq '[.[]? | select((.name // "") | startswith("afd-backend-"))] | length' <<<"$installed")"
  [[ "$installed_owned" == "${#afd_collapsed[@]}" ]] || { cleanup_aca_owned_rules; fail "aca_network_rule_count_${installed_owned}_expected_${#afd_collapsed[@]}"; }
  public_health || { cleanup_aca_owned_rules; fail 'aca_network_transition_public_health_failed'; }
  az containerapp ingress access-restriction remove -g "$RG" -n "$APP" --rule-name truyn-transition-open --only-show-errors >/dev/null || { cleanup_aca_owned_rules; fail 'aca_transition_rule_remove_failed'; }
fi

network_ok=0
for _ in $(seq 1 120); do
  final_rules="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null || echo '[]')"
  final_owned="$(jq '[.[]? | select((.name // "") | startswith("afd-backend-"))] | length' <<<"$final_rules")"
  direct_h="$(curl -4 -sS --max-time 10 -o /tmp/truyn-direct-health.body -w '%{http_code}' "$ORIGIN/health" || true)"
  if [[ "$final_owned" == "${#afd_collapsed[@]}" && "$direct_h" == 403 ]] && public_health; then network_ok=1; break; fi
  sleep 4
done
[[ "$network_ok" == 1 ]] || fail 'aca_network_lock_not_proven'

DIRECT_ORIGIN_HTTP="$(curl -4 -sS --max-time 10 -o /tmp/truyn-origin-http.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$ORIGIN/v1/register" || true)"
DIRECT_ORIGIN_WS="$(curl -4 -sS --http1.1 --max-time 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tb3JpZ2luLWxvY2s=' "$ORIGIN/v1/fast/socket" || true)"
[[ "$DIRECT_ORIGIN_HTTP" == 403 && "$DIRECT_ORIGIN_WS" == 403 ]] || fail "direct_origin_not_closed_http_${DIRECT_ORIGIN_HTTP}_ws_${DIRECT_ORIGIN_WS}"
echo "ACA_NETWORK_LOCK=PASS rules=${#afd_collapsed[@]} direct_http=403 direct_ws=403"

'''
s = s[:start] + new + s[end:]
p.write_text(s)
