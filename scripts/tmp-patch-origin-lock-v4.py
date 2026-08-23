from pathlib import Path

exec(compile(Path('scripts/tmp-patch-origin-lock-v2.py').read_text(), 'tmp-patch-origin-lock-v2.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = "mapfile -t afd_ranges < <(az network list-service-tags --location eastus2 -o json | jq -r '.values[]? | select(.name==\"AzureFrontDoor.Backend\") | .properties.addressPrefixes[]?' | grep -E '^[0-9]+(\\.[0-9]+){3}/[0-9]+$' | sort -u)"
new = r'''page="$(curl -fsSL 'https://www.microsoft.com/en-us/download/confirmation.aspx?id=56519' || curl -fsSL 'https://www.microsoft.com/en-us/download/details.aspx?id=56519')"
download="$(printf '%s' "$page" | grep -Eo 'https://download\.microsoft\.com/download/[^"&<> ]+/ServiceTags_Public_[0-9]{8}\.json' | sort -u | tail -n1 || true)"
[[ "$download" =~ ^https://download\.microsoft\.com/download/.*/ServiceTags_Public_([0-9]{8})\.json$ ]] || fail 'service_tag_official_download_url_not_found'
file_date="${BASH_REMATCH[1]}"
file_epoch="$(date -u -d "${file_date:0:4}-${file_date:4:2}-${file_date:6:2}" +%s)"
age_days="$(( ($(date -u +%s)-file_epoch)/86400 ))"
[[ "$age_days" -ge 0 && "$age_days" -le 14 ]] || fail "service_tag_file_stale_age_${age_days}"
mask "$download"
curl -fsSL "$download" -o /tmp/truyn-service-tags.json
jq -e '.values | type=="array"' /tmp/truyn-service-tags.json >/dev/null || fail 'service_tag_json_invalid'
mapfile -t afd_ranges < <(jq -r '.values[]? | select(.name=="AzureFrontDoor.Backend") | .properties.addressPrefixes[]?' /tmp/truyn-service-tags.json | grep -E '^[0-9]+(\.[0-9]+){3}/[0-9]+$' | sort -u)
echo "SERVICE_TAG_SOURCE=PASS date=${file_date} age_days=${age_days}"'''
if old not in s:
    raise SystemExit('service-tag source pattern not found')
s = s.replace(old, new)
p.write_text(s)
