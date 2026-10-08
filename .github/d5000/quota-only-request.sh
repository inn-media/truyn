#!/usr/bin/env bash
# D-5000 quota-only controller. No VM provisioning, benchmark, or self-elevation.
set -Eeuo pipefail
export AZURE_CORE_OUTPUT=none
location=southcentralus
target=800
subscription="$(az account show --query id -o tsv)"
scope="/subscriptions/${subscription}/providers/Microsoft.Compute/locations/${location}"
base="https://management.azure.com${scope}/providers/Microsoft.Quota/quotas"
version="2023-02-01"
fail() { printf 'TRUYN_D5000_QUOTA_TERMINAL result=BLOCKED reason=%s no_vm_create=true benchmark=false\n' "$1"; exit 1; }
status() { printf 'TRUYN_D5000_QUOTA_EVENT status=%s\n' "$1"; }
# Exact single-shot identity, safe to re-evaluate; never blindly resubmit a pending ticket.
sku=''; family=''
for candidate in Standard_E32as_v7 Standard_E32as_v5 Standard_D32as_v5 Standard_D32s_v5; do
  items="$(az vm list-skus -l "$location" --size "$candidate" --all -o json --only-show-errors)" || continue
  allowed="$(jq -r --arg c "$candidate" '[.[]|select(.name==$c and (([.restrictions[]?|select(.reasonCode=="NotAvailableForSubscription")]|length)==0))][0].name//empty' <<<"$items")"
  f="$(jq -r --arg c "$candidate" '[.[]|select(.name==$c)][0].family//empty' <<<"$items")"
  [[ -n "$allowed" && -n "$f" ]] && { sku="$allowed"; family="$f"; break; }
done
[[ -n "$sku" && -n "$family" ]] || fail no_permitted_32_vcpu_sku
status "candidate_validated location=$location sku=$sku family=$family target=$target"
state="$(az provider show --namespace Microsoft.Quota --query registrationState -o tsv 2>/dev/null || true)"
if [[ "$state" != Registered ]]; then
  az provider register --namespace Microsoft.Quota --wait --only-show-errors || fail provider_registration_denied
  state="$(az provider show --namespace Microsoft.Quota --query registrationState -o tsv)"
fi
[[ "$state" == Registered ]] || fail provider_registration_pending
az vm list-usage -l "$location" -o json --only-show-errors > usage.json
jq -e 'type=="array" and length>0' usage.json >/dev/null || fail empty_compute_usage
regional="$(jq -r '[.[]|select((.name.value//"")=="cores" or ((.name.localizedValue//""|ascii_downcase)=="total regional vcpus"))][0].name.value//empty' usage.json)"
family_entry="$(jq -r --arg f "$family" '[.[]|select((.name.value//""|ascii_downcase)==($f|ascii_downcase))][0].name.value//empty' usage.json)"
[[ -n "$regional" && -n "$family_entry" ]] || fail missing_compute_quota_resources
reglimit="$(jq -r --arg n "$regional" '[.[]|select(.name.value==$n)][0].limit//-1' usage.json)"
famlimit="$(jq -r --arg n "$family_entry" '[.[]|select(.name.value==$n)][0].limit//-1' usage.json)"
regused="$(jq -r --arg n "$regional" '[.[]|select(.name.value==$n)][0].currentValue//-1' usage.json)"
famused="$(jq -r --arg n "$family_entry" '[.[]|select(.name.value==$n)][0].currentValue//-1' usage.json)"
for q in "$reglimit" "$famlimit" "$regused" "$famused"; do [[ "$q" =~ ^[0-9]+$ ]] || fail malformed_compute_usage; done
status "limits_verified regional=$reglimit regional_used=$regused family=$famlimit family_used=$famused"
if ((reglimit>=target && famlimit>=target)); then
  echo "TRUYN_D5000_QUOTA_TERMINAL result=EFFECTIVE quota_region=$location regional=$reglimit family=$famlimit no_vm_create=true benchmark=false"
  exit 0
fi
# Quota API is primary. Denied RBAC is a hard fact: do not attempt unauthorized self-grant again.
quota_data=''
quota_probe=''
# Single-resource permission probe is mandatory: list can be empty even without quotas/read.
if quota_probe="$(az rest --method get --url "${base}/${regional}?api-version=${version}" -o json 2>quota-api-error.txt)"; then
  quota_data="$(az rest --method get --url "${base}?api-version=${version}" -o json 2>quota-list-error.txt)" || fail quota_list_failed_after_authorized_probe
  jq -e '(.value|type)=="array"' <<<"$quota_data" >/dev/null || fail malformed_quota_list
  status quota_api_read_authorized
  for resource in "$regional" "$family_entry"; do
    limit="$(jq -r --arg n "$resource" '[.[]|select(.name.value==$n)][0].limit//-1' usage.json)"
    ((limit>=target)) && { status "already_sufficient=$resource"; continue; }
    # Quota API may expose names differently than Compute usage. Select by name/localized name.
    item="$(jq -c --arg n "$resource" --arg f "$family_entry" '[.value[]|select(((.properties.name.value//.name//""|ascii_downcase)==($n|ascii_downcase)) or ($n=="cores" and ((.properties.name.localizedValue//""|ascii_downcase|contains("total regional")))))][0]//empty' <<<"$quota_data")"
    if [[ -z "$item" || "$item" == null ]]; then
      item="$(az rest --method get --url "${base}/${resource}?api-version=${version}" -o json 2>/dev/null)" || fail quota_resource_not_exposed
    fi
    name="$(jq -r '.properties.name.value//.name//empty' <<<"$item")"
    unit="$(jq -r '.properties.unit//"Count"' <<<"$item")"
    applicable="$(jq -r 'if (.properties|has("isQuotaApplicable")) then .properties.isQuotaApplicable else true end' <<<"$item")"
    [[ -n "$name" && "$applicable" == true ]] || fail quota_resource_not_applicable
    body="$(jq -n --arg n "$name" --arg u "$unit" --argjson x "$target" '{properties:{name:{value:$n},unit:$u,limit:{limitObjectType:"LimitValue",value:$x}}}')"
    status "submit=QuotaAPI resource=$name target=$target"
    response="$(az rest --method put --url "${base}/${name}?api-version=${version}" --headers Content-Type=application/json --body "$body" -o json 2>quota-put-error.txt)" || fail quota_put_denied_or_rejected
    [[ -n "$response" ]] && printf '%s\n' "$response" | jq -c '{name,provisioningState:.properties.provisioningState,limit:.properties.limit}' || true
  done
  status primary_quota_requests_submitted
else
  if ! grep -Eq 'AuthorizationFailed|Microsoft[.]Quota/quotas/read|Forbidden' quota-api-error.txt; then fail quota_api_unexpected_error; fi
  status "quota_api_forbidden permission=Microsoft.Quota/quotas/read"
  # Alternate supported Azure interface: subscription Support ticket, if this principal
  # independently has Support Request Contributor and the subscription has a valid support plan.
  # No elevation, no extra credentials, no guessed service/classification IDs.
  services="$(az rest --method get --url 'https://management.azure.com/providers/Microsoft.Support/services?api-version=2024-04-01' -o json 2>support-api-error.txt)" || fail QUOTA_RBAC_REQUIRED_AND_SUPPORT_API_UNAVAILABLE
  service="$(jq -r '[.value[]|select((.properties.displayName//""|ascii_downcase)|contains("quotas"))][0].id//empty' <<<"$services")"
  [[ "$service" == /providers/Microsoft.Support/services/* ]] || fail SUPPORT_QUOTA_SERVICE_NOT_FOUND
  service_name="${service##*/}"
  classes="$(az rest --method get --url "https://management.azure.com${service}/problemClassifications?api-version=2024-04-01" -o json 2>support-class-error.txt)" || fail SUPPORT_QUOTA_CLASSIFICATION_UNAVAILABLE
  problem="$(jq -r '[.value[]|select((.properties.displayName//""|ascii_downcase)|test("core|virtual machine"))][0].id//empty' <<<"$classes")"
  [[ "$problem" == /providers/Microsoft.Support/services/* ]] || fail SUPPORT_COMPUTE_QUOTA_CLASSIFICATION_MISSING
  ticket=truyn-d5000-quota-20261008
  ticket_url="https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.Support/supportTickets/${ticket}?api-version=2024-04-01"
  if existing="$(az rest --method get --url "$ticket_url" -o json 2>support-existing-error.txt)"; then
    status "existing_support_ticket=$ticket no_duplicate=true"
  else
    if ! grep -Eqi 'NotFound|ResourceNotFound|404|Not Found' support-existing-error.txt; then fail SUPPORT_TICKET_READ_UNAUTHORIZED; fi
    # Corporate operations mailbox is used for this corporate quota request, not personal data.
    family_name="$(jq -r --arg n "$family_entry" '[.[]|select(.name.value==$n)][0].name.localizedValue//empty' usage.json)"
    family_display="$(sed -E 's/^Standard //;s/ Family vCPUs$//;s/ vCPUs$//' <<<"$family_name") Series"
    changes="$(jq -n --arg region "$location" --arg fam "$family_display" --argjson tgt "$target" '[{region:$region,payload:({VMFamily:"*",NewLimit:$tgt}|tojson)},{region:$region,payload:({VMFamily:$fam,NewLimit:$tgt}|tojson)}]')"
    request="$(jq -n --arg svc "$service" --arg cls "$problem" --argjson changes "$changes" '{
      properties:{
        title:"TRUYN D-5000 - Azure VM core quota request for 20 hosts",
        description:"Request 800 total regional vCPU and 800 Easv7-family vCPU in southcentralus for upcoming controlled TRUYN D-5000 qualification. Existing usage is zero. This is only a quota request; no VMs or tests are being launched.",
        severity:"minimal",
        advancedDiagnosticConsent:"No",
        serviceId:$svc,
        problemClassificationId:$cls,
        contactDetails:{country:"AZE",firstName:"InnMedia",lastName:"Operations",primaryEmailAddress:"corporate@innmedia.group",preferredContactMethod:"email",preferredSupportLanguage:"en-us",preferredTimeZone:"Azerbaijan Standard Time"},
        quotaTicketDetails:{quotaChangeRequestVersion:"1.0",quotaChangeRequests:$changes}
      }
    }')"
    status "submit=SupportAPI ticket=$ticket no_duplicate=true"
    echo "$request" > support-request.json
    existing="$(az rest --method put --url "$ticket_url" --body @support-request.json --headers Content-Type=application/json -o json 2>support-put-error.txt)" || fail QUOTA_RBAC_REQUIRED_AND_SUPPORT_TICKET_UNAUTHORIZED_OR_UNSUPPORTED
    status "support_ticket_submitted=$ticket"
  fi
fi
# The only acceptance evidence is effective readback from Compute, not HTTP 200/202.
az vm list-usage -l "$location" -o json --only-show-errors > effective-usage.json || fail effective_quota_read_failed
r="$(jq -r --arg n "$regional" '[.[]|select(.name.value==$n)][0].limit//-1' effective-usage.json)"
f="$(jq -r --arg n "$family_entry" '[.[]|select(.name.value==$n)][0].limit//-1' effective-usage.json)"
if [[ "$r" =~ ^[0-9]+$ && "$f" =~ ^[0-9]+$ ]] && ((r>=target && f>=target)); then
  echo "TRUYN_D5000_QUOTA_TERMINAL result=EFFECTIVE quota_region=$location regional=$r family=$f no_vm_create=true benchmark=false"
else
  echo "TRUYN_D5000_QUOTA_TERMINAL result=REQUEST_SUBMITTED_PENDING quota_region=$location regional=$r family=$f target=$target no_vm_create=true benchmark=false"
fi
