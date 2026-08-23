from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v4.py').read_text(), 'tmp-patch-origin-lock-v4.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
start = s.index('# 5. Platform network guard')
end = s.index('# 6. Front Door layer')
new = r'''# 5. Platform network guard via the GA Container Apps access-restriction commands.
# Install under a temporary 0.0.0.0/0 allow rule so public traffic cannot be cut while the list is being built.
existing_rules="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null || echo '[]')"
existing_count="$(jq 'length' <<<"$existing_rules")"
[[ "$existing_count" == 0 ]] || fail "aca_network_dirty_existing_rules_${existing_count}"

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

cleanup_aca_rules(){
  set +e
  local names n
  names="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null | jq -r '.[]? | .name // empty')"
  while IFS= read -r n; do
    [[ "$n" == afd-backend-* || "$n" == truyn-transition-open ]] || continue
    az containerapp ingress access-restriction remove -g "$RG" -n "$APP" --rule-name "$n" --only-show-errors >/dev/null 2>&1 || true
  done <<<"$names"
}

az containerapp ingress access-restriction set -g "$RG" -n "$APP" --rule-name truyn-transition-open --ip-address 0.0.0.0/0 --description 'TRUYN atomic origin-lock transition' --action Allow --only-show-errors >/dev/null || fail 'aca_transition_rule_create_failed'

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
  cleanup_aca_rules
  public_health || true
  fail "aca_network_rule_add_failed_at_${i}_of_${#afd_collapsed[@]}"
fi

installed="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json)"
installed_count="$(jq 'length' <<<"$installed")"
expected_count="$(( ${#afd_collapsed[@]} + 1 ))"
if [[ "$installed_count" != "$expected_count" ]]; then
  cleanup_aca_rules
  public_health || true
  fail "aca_network_rule_count_${installed_count}_expected_${expected_count}"
fi
public_health || { cleanup_aca_rules; fail 'aca_network_transition_public_health_failed'; }

az containerapp ingress access-restriction remove -g "$RG" -n "$APP" --rule-name truyn-transition-open --only-show-errors >/dev/null || { cleanup_aca_rules; fail 'aca_transition_rule_remove_failed'; }

network_ok=0
for _ in $(seq 1 120); do
  final_rules="$(az containerapp ingress access-restriction list -g "$RG" -n "$APP" -o json 2>/dev/null || echo '[]')"
  cnt="$(jq 'length' <<<"$final_rules")"
  direct_h="$(curl -4 -sS --max-time 10 -o /tmp/truyn-direct-health.body -w '%{http_code}' "$ORIGIN/health" || true)"
  if [[ "$cnt" == "${#afd_collapsed[@]}" && "$direct_h" == 403 ]] && public_health; then network_ok=1; break; fi
  sleep 4
done
if [[ "$network_ok" != 1 ]]; then
  # Re-open before cleanup to avoid a service interruption, then restore the no-restriction baseline.
  az containerapp ingress access-restriction set -g "$RG" -n "$APP" --rule-name truyn-transition-open --ip-address 0.0.0.0/0 --description 'TRUYN rollback transition' --action Allow --only-show-errors >/dev/null 2>&1 || true
  cleanup_aca_rules
  public_health || true
  fail 'aca_network_lock_failed_rolled_back'
fi

DIRECT_ORIGIN_HTTP="$(curl -4 -sS --max-time 10 -o /tmp/truyn-origin-http.body -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$ORIGIN/v1/register" || true)"
DIRECT_ORIGIN_WS="$(curl -4 -sS --http1.1 --max-time 10 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dHJ1eW4tb3JpZ2luLWxvY2s=' "$ORIGIN/v1/fast/socket" || true)"
if [[ "$DIRECT_ORIGIN_HTTP" != 403 || "$DIRECT_ORIGIN_WS" != 403 ]]; then
  az containerapp ingress access-restriction set -g "$RG" -n "$APP" --rule-name truyn-transition-open --ip-address 0.0.0.0/0 --description 'TRUYN rollback transition' --action Allow --only-show-errors >/dev/null 2>&1 || true
  cleanup_aca_rules
  fail "direct_origin_not_closed_http_${DIRECT_ORIGIN_HTTP}_ws_${DIRECT_ORIGIN_WS}"
fi
echo "ACA_NETWORK_LOCK=PASS raw_ranges=${#afd_ranges[@]} collapsed_ranges=${#afd_collapsed[@]} direct_http=403 direct_ws=403"

'''
s = s[:start] + new + s[end:]
p.write_text(s)
