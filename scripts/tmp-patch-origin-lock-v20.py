from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v19.py').read_text(), 'tmp-patch-origin-lock-v19.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = "mapfile -t cf_ranges < <({ curl -fsS https://www.cloudflare.com/ips-v4; curl -fsS https://www.cloudflare.com/ips-v6; } | sed '/^[[:space:]]*$/d' | sort -u)"
new = r"""mapfile -t cf_ranges < <({ curl -fsS https://www.cloudflare.com/ips-v4; printf '\n'; curl -fsS https://www.cloudflare.com/ips-v6; printf '\n'; } | sed '/^[[:space:]]*$/d' | sort -u)"""
if old not in s:
    raise SystemExit('Cloudflare range loader not found')
s = s.replace(old, new, 1)
p.write_text(s)
