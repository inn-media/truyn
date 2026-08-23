from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v8.py').read_text(), 'tmp-patch-origin-lock-v8.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''    az network front-door waf-policy create -g "$AFD_RG" --policy-name "$NEW_WAF_NAME" --sku "$AFD_SKU" --location Global --mode Prevention --disabled false --only-show-errors >/dev/null || fail 'waf_policy_create_failed' '''
new = '''    if ! az network front-door waf-policy create -g "$AFD_RG" --name "$NEW_WAF_NAME" --sku "$AFD_SKU" --mode Prevention --disabled false --only-show-errors >/tmp/truyn-waf-create.out 2>/tmp/truyn-waf-create.err; then
      if grep -qi 'AuthorizationFailed' /tmp/truyn-waf-create.err; then fail 'waf_policy_create_authorization_failed'; fi
      if grep -qi 'MissingSubscriptionRegistration' /tmp/truyn-waf-create.err; then fail 'waf_policy_create_provider_not_registered'; fi
      if grep -qi 'unrecognized arguments' /tmp/truyn-waf-create.err; then fail 'waf_policy_create_unrecognized_arguments'; fi
      if grep -qi 'location' /tmp/truyn-waf-create.err; then fail 'waf_policy_create_location_error'; fi
      fail 'waf_policy_create_failed_generic'
    fi'''
if old not in s:
    raise SystemExit('v8 WAF create pattern not found')
s = s.replace(old, new, 1)
# Use the documented --name alias consistently for the policy resource itself.
s = s.replace('az network front-door waf-policy show -g "$AFD_RG" --policy-name "$NEW_WAF_NAME"', 'az network front-door waf-policy show -g "$AFD_RG" --name "$NEW_WAF_NAME"')
s = s.replace('az network front-door waf-policy update -g "$WAF_RG" --policy-name "$WAF_NAME"', 'az network front-door waf-policy update -g "$WAF_RG" --name "$WAF_NAME"')
p.write_text(s)
