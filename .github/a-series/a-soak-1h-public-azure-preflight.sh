#!/usr/bin/env bash
# Copy of the PUBLIC Class-D 2-VM eligibility methodology, adapted to A-SOAK.
# This preflight is strictly read-only; it never reserves or provisions cloud VMs.
set -Eeuo pipefail
[[ "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_RUN_ATTEMPT:-}" == 1 ]] || { echo 'ASOAK_AZURE_ADMISSION=BLOCKED_UNTRUSTED_REF'; exit 71; }
evidence=a-soak-1h-public-azure-evidence.json
jq -n --arg source "$GITHUB_SHA" --arg run "$GITHUB_RUN_ID" \
  '{schema:"truyn.assurance.a-soak1h.public-azure-readonly.v1",sourceSha:$source,preflightRunId:$run,liveAttempt: "NOT_LAUNCHED",requestedAzureVMs:2,requestedGcpVMs:2,nodesPerVM:8,rf:3,azureCandidates:[],azureEligible:false,gcpComputeEligible:false,crossCloudEligible:false,cloudMutations:0}' > "$evidence"
locations=(eastus2 eastus westus2 centralus northcentralus southcentralus westeurope northeurope)
sizes=(Standard_D4as_v5 Standard_D4s_v5 Standard_E2as_v7)
azure_eligible=false
selected_region=none
selected_sku=none
for region in "${locations[@]}"; do
  if ! usage="$(timeout 120 az vm list-usage --location "$region" --output json --only-show-errors 2>/dev/null)"; then
    echo "ASOAK_AZURE_PROBE region=$region reason=usage_api_failed"
    continue
  fi
  jq -e 'type=="array" and length>0' <<<"$usage" >/dev/null || continue
  regional_limit="$(jq -r '[.[]|select((.name.value//"")=="cores" or ((.name.localizedValue//""|ascii_downcase)|contains("total regional vcpus")))|(.limit|tonumber?)][0]//-1' <<<"$usage")"
  regional_used="$(jq -r '[.[]|select((.name.value//"")=="cores" or ((.name.localizedValue//""|ascii_downcase)|contains("total regional vcpus")))|(.currentValue|tonumber?)][0]//-1' <<<"$usage")"
  [[ "$regional_limit" =~ ^[0-9]+$ && "$regional_used" =~ ^[0-9]+$ ]] || continue
  for sku in "${sizes[@]}"; do
    if ! rows="$(timeout 120 az vm list-skus --location "$region" --size "$sku" --all --output json --only-show-errors 2>/dev/null)"; then continue; fi
    row="$(jq -c --arg target "$sku" '[.[]|select(.name==$target)][0]//empty' <<<"$rows")"
    [[ -n "$row" && "$row" != null ]] || continue
    family="$(jq -r '.family//empty' <<<"$row")"
    cores="$(jq -r '[.capabilities[]?|select(.name=="vCPUs")|(.value|tonumber?)][0]//-1' <<<"$row")"
    denied="$(jq '[.restrictions[]?|select(.type=="Location" and .reasonCode=="NotAvailableForSubscription")]|length' <<<"$row")"
    [[ "$cores" =~ ^[0-9]+$ && "$cores" -ge 2 && -n "$family" ]] || continue
    family_limit="$(jq -r --arg f "$family" '[.[]|select((.name.value//""|ascii_downcase)==($f|ascii_downcase))|(.limit|tonumber?)][0]//-1' <<<"$usage")"
    family_used="$(jq -r --arg f "$family" '[.[]|select((.name.value//""|ascii_downcase)==($f|ascii_downcase))|(.currentValue|tonumber?)][0]//-1' <<<"$usage")"
    [[ "$family_limit" =~ ^[0-9]+$ && "$family_used" =~ ^[0-9]+$ ]] || continue
    required=$((2*cores))
    regional_free=$((regional_limit-regional_used))
    family_free=$((family_limit-family_used))
    jq --arg region "$region" --arg sku "$sku" --arg family "$family" \
      --argjson needed "$required" --argjson regional "$regional_free" --argjson familyFree "$family_free" --argjson restricted "$denied" \
      '.azureCandidates += [{region:$region,sku:$sku,family:$family,requiredVcpus:$needed,regionalVcpusFree:$regional,familyVcpusFree:$familyFree,locationRestrictions:$restricted}]' "$evidence" > "$evidence.tmp"
    mv "$evidence.tmp" "$evidence"
    echo "ASOAK_AZURE_CAPACITY region=$region sku=$sku need=$required regionalFree=$regional_free familyFree=$family_free restrictions=$denied"
    if ((denied==0 && regional_free>=required && family_free>=required)); then
      azure_eligible=true
      selected_region="$region"
      selected_sku="$sku"
      break 2
    fi
  done
done
jq --argjson azure "$azure_eligible" --arg region "$selected_region" --arg sku "$selected_sku" \
  '.azureEligible=$azure | .selectedAzureRegion=$region | .selectedAzureSku=$sku' "$evidence" > "$evidence.tmp"
mv "$evidence.tmp" "$evidence"
# Reconcile shared cloud campaign without touching it. A-SOAK never reuses its resources.
active="$(gh api repos/inn-media/truyn/actions/runs/37824934693 --jq .status)" || { echo 'ASOAK_AZURE_ADMISSION=BLOCKED_D5000_STATE_UNKNOWN'; exit 73; }
jq --arg state "$active" '.d5000RunStatus=$state' "$evidence" > "$evidence.tmp"
mv "$evidence.tmp" "$evidence"
[[ "$active" == completed ]] || { echo 'ASOAK_AZURE_ADMISSION=BLOCKED_D5000_ACTIVE'; exit 74; }
[[ "$azure_eligible" == true ]] || { echo 'ASOAK_AZURE_ADMISSION=BLOCKED_NO_2VM_ELIGIBLE_CAPACITY'; exit 75; }
echo "ASOAK_AZURE_ONLY_PREFLIGHT=PASS region=$selected_region sku=$selected_sku"
echo 'ASOAK_CROSS_CLOUD=NOT_READY A_SOAK_1H_ATTEMPT1=NOT_LAUNCHED cloudMutations=0'
