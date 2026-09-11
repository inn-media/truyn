#!/usr/bin/env bash
set -Eeuo pipefail
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${TRUYN_D200_LOCATION:?TRUYN_D200_LOCATION is required}"
: "${RUNTIME_BUNDLE:?RUNTIME_BUNDLE is required}"
: "${RUNTIME_SHA:?RUNTIME_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
account="td2d200${GITHUB_RUN_ID}"; container=runtime; blob=truyn-d200-runtime.tgz
max_attempts="${TRUYN_D200_STAGING_MAX_ATTEMPTS:-24}"; retry_delay_seconds="${TRUYN_D200_STAGING_RETRY_DELAY_SECONDS:-5}"
[[ ${#account} -le 24 && "$max_attempts" =~ ^[1-9][0-9]*$ && "$retry_delay_seconds" =~ ^[0-9]+$ ]]
retry_command(){ local operation="$1"; shift; local attempt err rc; err="$(mktemp)"; for attempt in $(seq 1 "$max_attempts"); do rc=0; if "$@" 2>"$err"; then rm -f "$err"; printf 'TRUYN_D200_STAGING_READY operation=%s attempt=%s\n' "$operation" "$attempt"; return 0; else rc=$?; fi; printf 'TRUYN_D200_STAGING_RETRY operation=%s attempt=%s max_attempts=%s\n' "$operation" "$attempt" "$max_attempts" >&2; if [[ "$attempt" == "$max_attempts" ]]; then printf 'TRUYN_D200_STAGING_FAILURE operation=%s attempts=%s exit_code=%s\n' "$operation" "$attempt" "$rc" >&2; cat "$err" >&2; rm -f "$err"; return "$rc"; fi; sleep "$retry_delay_seconds"; done; }
retry_capture(){ local __resultvar="$1" operation="$2"; shift 2; local attempt err rc value; err="$(mktemp)"; for attempt in $(seq 1 "$max_attempts"); do rc=0; value=''; if value="$("$@" 2>"$err")"; then if [[ -n "$value" ]]; then rm -f "$err"; printf -v "$__resultvar" '%s' "$value"; printf 'TRUYN_D200_STAGING_READY operation=%s attempt=%s\n' "$operation" "$attempt"; return 0; fi; rc=1; printf 'empty result from successful command\n' >"$err"; else rc=$?; fi; printf 'TRUYN_D200_STAGING_RETRY operation=%s attempt=%s max_attempts=%s\n' "$operation" "$attempt" "$max_attempts" >&2; if [[ "$attempt" == "$max_attempts" ]]; then printf 'TRUYN_D200_STAGING_FAILURE operation=%s attempts=%s exit_code=%s\n' "$operation" "$attempt" "$rc" >&2; cat "$err" >&2; rm -f "$err"; return "$rc"; fi; sleep "$retry_delay_seconds"; done; }
az storage account create -g "$AZURE_RESOURCE_GROUP" -n "$account" -l "$TRUYN_D200_LOCATION" --sku Standard_LRS --kind StorageV2 --https-only true --min-tls-version TLS1_2 --allow-blob-public-access false -o none --only-show-errors
resource_id="$(az storage account show -g "$AZURE_RESOURCE_GROUP" -n "$account" --query id -o tsv --only-show-errors)"; assignee="$(az account show --query user.name -o tsv --only-show-errors)"; [[ -n "$resource_id" && -n "$assignee" ]]
az role assignment create --assignee "$assignee" --role 'Storage Blob Data Contributor' --scope "$resource_id" -o none --only-show-errors
retry_command container_create az storage container create --name "$container" --account-name "$account" --auth-mode login -o none --only-show-errors
retry_command blob_upload az storage blob upload --container-name "$container" --name "$blob" --file "$RUNTIME_BUNDLE" --account-name "$account" --auth-mode login --overwrite true -o none --only-show-errors
expiry="$(date -u -d '+6 hours' '+%Y-%m-%dT%H:%MZ')"; sas=''; retry_capture sas user_delegation_sas az storage blob generate-sas --container-name "$container" --name "$blob" --account-name "$account" --auth-mode login --as-user --permissions r --https-only --expiry "$expiry" -o tsv --only-show-errors
[[ -n "$sas" ]]; printf '::add-mask::%s\n' "$sas"; url="https://${account}.blob.core.windows.net/${container}/${blob}?${sas}"; printf '::add-mask::%s\n' "$url"
env_file="${GITHUB_ENV:-/dev/null}"; printf 'TRUYN_D200_STAGING_ACCOUNT=%s\nTRUYN_D200_STAGING_RESOURCE_ID=%s\nTRUYN_D200_RUNTIME_URL=%s\nTRUYN_D200_RUNTIME_SHA256=%s\n' "$account" "$resource_id" "$url" "$RUNTIME_SHA" >>"$env_file"
printf 'TRUYN_D200_STAGING_COMPLETE account=%s auth=oidc_data_plane max_attempts=%s retry_delay_seconds=%s\n' "$account" "$max_attempts" "$retry_delay_seconds"
