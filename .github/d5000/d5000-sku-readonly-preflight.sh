#!/usr/bin/env bash
# D-5000 READ ONLY: actual regional/family quota, VM SKU and restriction checks.
set -Eeuo pipefail
region=southcentralus
hosts=20
vcpus_per_host=32
required=$((hosts*vcpus_per_host))
echo "TRUYN_D5000_SKU_PREFLIGHT_STARTED region=$region hosts=$hosts required=$required"
az vm list-usage --location "$region" --output json --only-show-errors >usage.json
jq -e 'type=="array" and length>0' usage.json >/dev/null
regional="$(jq -r '[.[]|select((.name.value//"")=="cores")][0].limit//-1' usage.json)"
regional_used="$(jq -r '[.[]|select((.name.value//"")=="cores")][0].currentValue//-1' usage.json)"
[[ "$regional" =~ ^[0-9]+$ && "$regional_used" =~ ^[0-9]+$ ]] || { echo "TRUYN_D5000_SKU_PREFLIGHT=BLOCKED reason=invalid_regional_usage"; exit 1; }
regional_free=$((regional-regional_used))
echo "TRUYN_D5000_REGIONAL_QUOTA limit=$regional used=$regional_used available=$regional_free required=$required"
jq -n --arg region "$region" --argjson total "$regional" --argjson used "$regional_used" --argjson required "$required" '{region:$region,totalRegionalQuota:$total,totalRegionalUsed:$used,requiredVcpus:$required,candidates:[]}' >d5000-sku-readonly-evidence.json
((regional_free>=required)) || { echo "TRUYN_D5000_SKU_PREFLIGHT=BLOCKED reason=regional_quota_insufficient"; exit 1; }
eligible=0
for candidate in Standard_E32ds_v6 Standard_D32ds_v6 Standard_D32lds_v6; do
  echo "TRUYN_D5000_SKU_CHECK candidate=$candidate"
  if ! az vm list-skus --location "$region" --size "$candidate" --all --output json --only-show-errors >sku.json; then
    echo "TRUYN_D5000_SKU_RESULT sku=$candidate status=QUERY_FAILED"
    continue
  fi
  row="$(jq -c --arg n "$candidate" '[.[]|select(.name==$n)][0]//empty' sku.json)"
  if [[ -z "$row" || "$row" == null ]]; then
    echo "TRUYN_D5000_SKU_RESULT sku=$candidate status=NOT_LISTED"
    continue
  fi
  family="$(jq -r '.family//empty' <<<"$row")"
  cpu="$(jq -r '[.capabilities[]?|select(.name=="vCPUs")|.value][0]//"0"' <<<"$row")"
  memory="$(jq -r '[.capabilities[]?|select(.name=="MemoryGB")|.value][0]//"0"' <<<"$row")"
  restriction="$(jq -r '[.restrictions[]?|select(.type=="Location" and .reasonCode=="NotAvailableForSubscription")]|length' <<<"$row")"
  zones="$(jq -c '[.restrictions[]?|select(.type=="Zone" and .reasonCode=="NotAvailableForSubscription")|.restrictionInfo.zones[]?]|unique' <<<"$row")"
  family_limit="$(jq -r --arg f "$family" '[.[]|select((.name.value//""|ascii_downcase)==($f|ascii_downcase))][0].limit//-1' usage.json)"
  family_used="$(jq -r --arg f "$family" '[.[]|select((.name.value//""|ascii_downcase)==($f|ascii_downcase))][0].currentValue//-1' usage.json)"
  family_free=-1
  [[ "$family_limit" =~ ^[0-9]+$ && "$family_used" =~ ^[0-9]+$ ]] && family_free=$((family_limit-family_used))
  label=BLOCKED
  if [[ "$cpu" == 32 && "$restriction" == 0 && "$family_free" -ge "$required" ]]; then
    label=QUOTA_SKU_ELIGIBLE
    eligible=$((eligible+1))
  fi
  jq -n --arg sku "$candidate" --arg family "$family" --arg statusLabel "$label" --argjson vcpus "$cpu" --arg memory "$memory" --argjson familyLimit "$family_limit" --argjson familyUsed "$family_used" --argjson restriction "$restriction" --argjson zones "$zones" '{sku:$sku,family:$family,status:$statusLabel,vcpus:$vcpus,memoryGB:$memory,familyQuota:$familyLimit,familyUsed:$familyUsed,locationRestrictionCount:$restriction,restrictedZones:$zones}' >candidate.json
  jq --slurpfile e candidate.json '.candidates+=[$e[0]]' d5000-sku-readonly-evidence.json >tmp.json && mv tmp.json d5000-sku-readonly-evidence.json
  echo "TRUYN_D5000_SKU_RESULT sku=$candidate family=$family vcpus=$cpu memoryGB=$memory family_limit=$family_limit family_used=$family_used family_available=$family_free location_restrictions=$restriction zone_restrictions=$zones status=$label"
done
((eligible>0)) || { echo "TRUYN_D5000_SKU_PREFLIGHT=BLOCKED reason=no_allowed_candidate"; exit 1; }
echo "TRUYN_D5000_SKU_PREFLIGHT=QUOTA_SKU_PASS eligible_candidates=$eligible regional_limit=$regional region=$region no_vm_created=true benchmark_launched=false"
echo "TRUYN_D5000_PLACEMENT_CAPACITY=NOT_TESTED"
