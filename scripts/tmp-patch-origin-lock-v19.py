from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v18.py').read_text(), 'tmp-patch-origin-lock-v18.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = '''    safe_msg="$(printf '%s' "$inject_msg" | sed -E 's#https?://[^ ]+#[url]#g; s#/subscriptions/[^ ]+#[resource]#g; s/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,36}/[guid]/g' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-96)"
    fail "afd_inject_rule_${rule_index}_${inject_http}_${safe_code:-unknown}_${safe_msg:-no_message}"'''
new = r'''    inject_detail="$(printf '%s' "$inject_msg" | sed -E 's/^Rules validation failed\.?[[:space:]]*(More information:?)?[[:space:]]*//I')"
    safe_msg="$(printf '%s' "$inject_detail" | sed -E 's#https?://[^ ]+#[url]#g; s#/subscriptions/[^ ]+#[resource]#g; s/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,36}/[guid]/g' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-110)"
    fail "inject_${safe_msg:-no_validation_detail}"'''
if old not in s:
    raise SystemExit('v18 diagnostic block not found')
s = s.replace(old, new, 1)
p.write_text(s)
