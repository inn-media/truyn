from pathlib import Path

# Apply route-exact discovery first.
exec(compile(Path('scripts/tmp-patch-origin-lock-v2.py').read_text(), 'tmp-patch-origin-lock-v2.py', 'exec'))

p = Path('scripts/tmp-azure-cloudflare-origin-lock-20260823.sh')
s = p.read_text()
old = "mapfile -t afd_ranges < <(az network list-service-tags --location eastus2 -o json | jq -r '.values[]? | select(.name==\"AzureFrontDoor.Backend\") | .properties.addressPrefixes[]?' | grep -E '^[0-9]+(\\.[0-9]+){3}/[0-9]+$' | sort -u)"
new = '''service_tags="$(az rest --method get --url "https://management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID_VALUE}/providers/Microsoft.Network/locations/eastus2/serviceTags?api-version=2025-05-01")"
mapfile -t afd_ranges < <(jq -r '.values[]? | select(.name=="AzureFrontDoor.Backend") | .properties.addressPrefixes[]?' <<<"$service_tags" | grep -E '^[0-9]+(\\.[0-9]+){3}/[0-9]+$' | sort -u)'''
if old not in s:
    raise SystemExit('service-tag source pattern not found')
s = s.replace(old, new)
p.write_text(s)
