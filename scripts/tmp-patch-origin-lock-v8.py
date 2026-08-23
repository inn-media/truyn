from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v7.py').read_text(), 'tmp-patch-origin-lock-v7.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
replacements = {
'''    az network front-door waf-policy create -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" --sku "$AFD_SKU" --location Global --mode Prevention --enabled-state Enabled --only-show-errors >/dev/null''':
'''    az network front-door waf-policy create -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" --sku "$AFD_SKU" --location Global --mode Prevention --disabled false --only-show-errors >/dev/null || fail 'waf_policy_create_failed' ''',
'''az network front-door waf-policy update -g "$WAF_RG" --policy-name "$WAF_NAME" --mode Prevention --enabled-state Enabled --only-show-errors >/dev/null''':
'''az network front-door waf-policy update -g "$WAF_RG" --policy-name "$WAF_NAME" --mode Prevention --disabled false --only-show-errors >/dev/null || fail 'waf_policy_update_failed' ''',
'''az network front-door waf-policy rule create -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --priority "$priority" --rule-type MatchRule --action Block --defer --only-show-errors >/dev/null''':
'''az network front-door waf-policy rule create -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --priority "$priority" --rule-type MatchRule --action Block --defer --only-show-errors >/dev/null || fail 'waf_rule_create_failed' ''',
'''az network front-door waf-policy rule match-condition add -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --match-variable SocketAddr --operator IPMatch --values "${cf_ranges[@]}" --negate true --only-show-errors >/dev/null''':
'''az network front-door waf-policy rule match-condition add -g "$WAF_RG" --policy-name "$WAF_NAME" --name "$RULE_NAME" --match-variable SocketAddr --operator IPMatch --values "${cf_ranges[@]}" --negate true --only-show-errors >/dev/null || fail 'waf_match_condition_add_failed' ''',
'''  az rest --method put --url "$waf_sp_url" --headers 'Content-Type=application/json' --body "$sp_body" >/dev/null''':
'''  az rest --method put --url "$waf_sp_url" --headers 'Content-Type=application/json' --body "$sp_body" >/dev/null || fail 'waf_security_policy_attach_failed' ''',
}
for old, new in replacements.items():
    if old not in s:
        raise SystemExit(f'expected WAF pattern not found: {old[:80]}')
    s = s.replace(old, new, 1)
p.write_text(s)
