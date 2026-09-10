#!/usr/bin/env bash
set -Eeuo pipefail

TASK_ID='truyn-d200-repository-sanitation-2609102033-8f2c'
BASE_SHA='bae2a3ac4776bc4c89bdb53eb835d6b9d49cab37'
BRANCH='automation/d200-repository-sanitation-260910'
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ "${GITHUB_REF_NAME:-$BRANCH}" == "$BRANCH" ]]
git merge-base --is-ancestor "$BASE_SHA" HEAD
mkdir -p docs/operations/d200/sanitation config

python3 - <<'PY'
import hashlib,json,os,subprocess
from pathlib import Path
root=Path('.')
files=subprocess.check_output(['git','ls-files'],text=True).splitlines()
def classify(p):
    q=p.lower()
    if p.startswith('docs/benchmarks/') or '/evidence' in q: return 'EVIDENCE_KEEP'
    if p=='_tmp_parts' or p.startswith('_tmp_parts/') or p=='.github/workflows/.gitkeep' or p=='.github/pull_request_template.md': return 'DELETE'
    if p.startswith('scripts/patch-class-d-diagnostic-') or p.startswith('scripts/patch-d200-'): return 'CANONICALIZE_THEN_DELETE'
    if p.startswith('.github/workflows/diag-d200-'): return 'DELETE'
    if p.startswith('tests/') and ('d200' in q or 'class-d' in q): return 'REGRESSION'
    if p.startswith(('network/','benchmarks/scale/','scripts/','config/')): return 'CANONICAL'
    if p.startswith(('README','ROADMAP','docs/','.github/','tests/','sdk/')): return 'KEEP'
    return 'UNKNOWN'
inv={'taskId':'truyn-d200-repository-sanitation-2609102033-8f2c','baseSha':'bae2a3ac4776bc4c89bdb53eb835d6b9d49cab37','files':[{'path':p,'classification':classify(p)} for p in files]}
Path('docs/operations/d200/sanitation/inventory-pre.json').write_text(json.dumps(inv,indent=2)+'\n')
entries=[]
for p in sorted(x for x in files if x.startswith('docs/benchmarks/')):
    b=Path(p).read_bytes(); entries.append({'path':p,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
Path('docs/operations/d200/sanitation/evidence-ledger-pre.json').write_text(json.dumps({'policy':'redact-not-delete','entries':entries},indent=2)+'\n')
PY

# Prove the legacy patch machinery still expresses its intended semantics before replacing it.
node --test tests/class-d-diagnostic-*.test.js tests/d200-recovery-budget.test.js tests/d200-baseline-production-recovery.test.js tests/class-d-200-preflight-qualification.test.js

python3 - <<'PY'
import hashlib,json,glob
from pathlib import Path
provision={'bootstrap-timeout','bootstrap-parallel','peer-lease-freshness','bandwidth-meter-parallel','local-fault-control','failure-evidence'}
wrapper={'composed-heal-evidence'}
rows=[]
for p in sorted(glob.glob('scripts/patch-class-d-diagnostic-*.py')+glob.glob('scripts/patch-d200-*.py')):
    name=Path(p).name
    if name.startswith('patch-d200-recovery-budget'): target=['network/runtime.js','benchmarks/scale/class-d-azure-1000-provision.sh']
    elif name.startswith('patch-d200-baseline-production-recovery'): target=['benchmarks/scale/class-d-azure-1000-campaign.sh']
    else:
        key=name[len('patch-class-d-diagnostic-'):-3]
        if key in wrapper: target=['benchmarks/scale/class-d-azure-1000-provision.sh','benchmarks/scale/class-d-azure-1000-campaign.sh']
        elif key in provision: target=['benchmarks/scale/class-d-azure-1000-provision.sh']
        else: target=['benchmarks/scale/class-d-azure-1000-campaign.sh']
    rows.append({'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest(),'disposition':'CANONICALIZE_THEN_DELETE','canonicalTargets':target})
Path('docs/operations/d200/sanitation/patcher-disposition.json').write_text(json.dumps({'taskId':'truyn-d200-repository-sanitation-2609102033-8f2c','patchers':rows},indent=2)+'\n')
PY

# Materialize the accepted patch chain directly into maintained canonical source.
python3 scripts/patch-d200-recovery-budget.py network/runtime.js benchmarks/scale/class-d-azure-1000-provision.sh
for x in bootstrap-timeout bootstrap-parallel peer-lease-freshness bandwidth-meter-parallel; do
  python3 "scripts/patch-class-d-diagnostic-${x}.py" benchmarks/scale/class-d-azure-1000-provision.sh
done
for x in readiness-parallel readiness-window readiness-evidence readiness-transport baseline-parallel restart-parallel post-restart-origin; do
  python3 "scripts/patch-class-d-diagnostic-${x}.py" benchmarks/scale/class-d-azure-1000-campaign.sh
done
python3 - <<'PY'
from pathlib import Path
p=Path('benchmarks/scale/class-d-azure-1000-campaign.sh'); s=p.read_text()
if s.count('seq 10 14') != 3 or s.count('range(10,15)') != 1: raise SystemExit('unexpected restart range before canonicalization')
p.write_text(s.replace('seq 10 14','seq 5 9').replace('range(10,15)','range(5,10)'))
PY
python3 scripts/patch-class-d-diagnostic-composed-heal-evidence.py benchmarks/scale/class-d-azure-1000-provision.sh benchmarks/scale/class-d-azure-1000-campaign.sh
python3 scripts/patch-d200-baseline-production-recovery.py benchmarks/scale/class-d-azure-1000-campaign.sh

# Canonical path sanitation is intentionally limited to maintained D-1000/D-200 execution source, not historical evidence/negative fixtures.
python3 - <<'PY'
from pathlib import Path
paths=['benchmarks/scale/class-d-azure-1000-provision.sh','benchmarks/scale/class-d-azure-1000-campaign.sh','scripts/build-class-d-1000-runtime-bundle.sh','scripts/class-d-1000-vm-smoke-preflight.sh']
for name in paths:
    p=Path(name); s=p.read_text(); s=s.replace('truyqn','truyn').replace('truqyn','truyn').replace('truinyn','truyn')
    p.write_text(s)
PY
node --check network/runtime.js
bash -n benchmarks/scale/class-d-azure-1000-provision.sh
bash -n benchmarks/scale/class-d-azure-1000-campaign.sh

cat > config/d200-contract.json <<'EOF'
{
  "schema": "truyn.d200.contract.v1",
  "hostsRequired": 20,
  "processTarget": 200,
  "nodesPerHost": 10,
  "maxPeers": 32,
  "allToAllForbidden": true,
  "routingAcceptanceMinimum": 0.99,
  "convergenceMaximumMs": 120000,
  "recoveryMaximumMs": 120000,
  "acknowledgedWritesRequired": 100,
  "acknowledgedWriteLossAllowed": 0,
  "safetyViolationsAllowed": 0,
  "cleanupRemainingAllowed": 0,
  "stagingCleanupRemainingAllowed": 0,
  "peerRecordTtlMs": 1800000,
  "bootstrapMinPeerLeaseRemainingMs": 900000
}
EOF

cat > scripts/check-d200-contract.mjs <<'EOF'
#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const SAFETY_FLOOR = Object.freeze({hostsRequired:20,processTarget:200,nodesPerHost:10,maxPeers:32,routingAcceptanceMinimum:0.99,convergenceMaximumMs:120000,recoveryMaximumMs:120000,acknowledgedWritesRequired:100,acknowledgedWriteLossAllowed:0,safetyViolationsAllowed:0,cleanupRemainingAllowed:0,stagingCleanupRemainingAllowed:0,peerRecordTtlMs:1800000,bootstrapMinPeerLeaseRemainingMs:900000});
export function validate(c){
  const e=[]; const f=SAFETY_FLOOR;
  if(c.schema!=='truyn.d200.contract.v1')e.push('schema');
  for(const k of ['hostsRequired','processTarget','nodesPerHost','acknowledgedWritesRequired','peerRecordTtlMs','bootstrapMinPeerLeaseRemainingMs']) if(c[k]<f[k])e.push(k);
  for(const k of ['maxPeers','convergenceMaximumMs','recoveryMaximumMs','acknowledgedWriteLossAllowed','safetyViolationsAllowed','cleanupRemainingAllowed','stagingCleanupRemainingAllowed']) if(c[k]>f[k])e.push(k);
  if(c.routingAcceptanceMinimum<f.routingAcceptanceMinimum)e.push('routingAcceptanceMinimum');
  if(c.allToAllForbidden!==true)e.push('allToAllForbidden');
  if(c.processTarget!==c.hostsRequired*c.nodesPerHost)e.push('topologyProduct');
  if(e.length) throw new Error(`D-200 safety floor violation: ${[...new Set(e)].join(',')}`);
  return true;
}
export function main(argv=process.argv.slice(2)){const p=argv[0]||'config/d200-contract.json';validate(JSON.parse(fs.readFileSync(p,'utf8')));console.log('TRUYN_D200_CONTRACT=PASS');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
EOF
chmod +x scripts/check-d200-contract.mjs

cat > scripts/d200-stage-runtime-bundle.sh <<'EOF'
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
EOF
chmod +x scripts/d200-stage-runtime-bundle.sh

cat > tests/d200-staging-robustness.test.js <<'EOF'
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawnSync} from 'node:child_process'; import test from 'node:test';
const helper=path.resolve('scripts/d200-stage-runtime-bundle.sh');
function mock(dir,mode='transient'){const s=`#!/usr/bin/env bash\nset -Eeuo pipefail\nstate="\${MOCK_AZ_STATE}"; touch "$state"; key="$*"; count(){ grep -Fxc "$1" "$state"||true; }; mark(){ printf '%s\\n' "$1">>"$state"; }\nif [[ "$key" == storage\\ account\\ create* ]];then exit 0;fi\nif [[ "$key" == storage\\ account\\ show* ]];then printf '/subscriptions/test/resourceGroups/truyn/providers/Microsoft.Storage/storageAccounts/mock\\n';exit 0;fi\nif [[ "$key" == account\\ show* ]];then printf 'oidc-principal\\n';exit 0;fi\nif [[ "$key" == role\\ assignment\\ create* ]];then [[ "$key" == *"Storage Blob Data Contributor"* && "$key" == *"--scope /subscriptions/test/resourceGroups/truyn/providers/Microsoft.Storage/storageAccounts/mock"* ]];exit 0;fi\nfor op in 'storage container create' 'storage blob upload' 'storage blob generate-sas';do if [[ "$key" == $op* ]];then [[ "$key" == *"--auth-mode login"* ]];n=$(count "$op");mark "$op";if [[ '${mode}' == always-fail ]];then exit 3;fi;if [[ '${mode}' == empty-sas && "$op" == 'storage blob generate-sas' ]];then exit 0;fi;limit=0;[[ "$op" == 'storage container create' ]]&&limit=2;[[ "$op" == 'storage blob upload' ]]&&limit=1;[[ "$op" == 'storage blob generate-sas' ]]&&limit=2;if ((n<limit));then exit 3;fi;[[ "$op" == 'storage blob generate-sas' ]]&&printf 'sig=masked-test-token\\n';exit 0;fi;done;exit 90\n`;const p=path.join(dir,'az');fs.writeFileSync(p,s,{mode:0o755});}
function run(mode='transient',attempts='4'){const d=fs.mkdtempSync(path.join(os.tmpdir(),'truyn-stage-')),bin=path.join(d,'bin');fs.mkdirSync(bin);mock(bin,mode);const bundle=path.join(d,'runtime.tgz'),envFile=path.join(d,'env'),state=path.join(d,'state');fs.writeFileSync(bundle,'runtime');const result=spawnSync('bash',[helper],{encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`,MOCK_AZ_STATE:state,AZURE_RESOURCE_GROUP:'truyn',TRUYN_D200_LOCATION:'eastus2',RUNTIME_BUNDLE:bundle,RUNTIME_SHA:'a'.repeat(64),GITHUB_RUN_ID:'123456789',GITHUB_ENV:envFile,TRUYN_D200_STAGING_MAX_ATTEMPTS:attempts,TRUYN_D200_STAGING_RETRY_DELAY_SECONDS:'0'}});return{result,state,envFile};}
test('staging recovers bounded transient data-plane races',()=>{const{result,state,envFile}=run();assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(state,'utf8').match(/storage container create/g)?.length,3);assert.match(fs.readFileSync(envFile,'utf8'),/TRUYN_D200_RUNTIME_URL=/);});
test('staging preserves failing child exit status and stops',()=>{const{result,state}=run('always-fail','3');assert.equal(result.status,3);assert.doesNotMatch(fs.readFileSync(state,'utf8'),/storage blob upload|storage blob generate-sas/);});
test('empty SAS fails closed',()=>{const{result}=run('empty-sas','2');assert.notEqual(result.status,0);assert.match(result.stderr,/operation=user_delegation_sas/);});
test('staging is private OIDC least privilege only',()=>{const s=fs.readFileSync(helper,'utf8');assert.match(s,/Storage Blob Data Contributor/);assert.match(s,/--auth-mode login/);assert.match(s,/--as-user/);assert.match(s,/--allow-blob-public-access false/);assert.doesNotMatch(s,/account-key|--auth-mode key|allow-blob-public-access true|Storage Blob Data Owner/);});
EOF

cat > tests/d200-anti-weakening.test.js <<'EOF'
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawnSync} from 'node:child_process'; import test from 'node:test';
const base=JSON.parse(fs.readFileSync('config/d200-contract.json','utf8'));
function rejects(patch){const d=fs.mkdtempSync(path.join(os.tmpdir(),'truyn-floor-')),p=path.join(d,'c.json');fs.writeFileSync(p,JSON.stringify({...base,...patch}));return spawnSync(process.execPath,['scripts/check-d200-contract.mjs',p],{encoding:'utf8'}).status!==0;}
test('canonical D-200 contract passes independent floor',()=>assert.equal(spawnSync(process.execPath,['scripts/check-d200-contract.mjs'],{encoding:'utf8'}).status,0));
for(const [name,patch] of Object.entries({routing:{routingAcceptanceMinimum:.98},peers:{maxPeers:33},recovery:{recoveryMaximumMs:120001},convergence:{convergenceMaximumMs:120001},hosts:{hostsRequired:19},processes:{processTarget:199},writes:{acknowledgedWritesRequired:99},loss:{acknowledgedWriteLossAllowed:1},safety:{safetyViolationsAllowed:1},cleanup:{cleanupRemainingAllowed:1},stagingCleanup:{stagingCleanupRemainingAllowed:1},allToAll:{allToAllForbidden:false}})) test(`anti-weakening rejects ${name}`,()=>assert.equal(rejects(patch),true));
EOF

cat > tests/d200-canonical-regressions.test.js <<'EOF'
import assert from 'node:assert/strict'; import fs from 'node:fs'; import {spawnSync} from 'node:child_process'; import test from 'node:test';
const runtime=fs.readFileSync('network/runtime.js','utf8'), provision=fs.readFileSync('benchmarks/scale/class-d-azure-1000-provision.sh','utf8'), campaign=fs.readFileSync('benchmarks/scale/class-d-azure-1000-campaign.sh','utf8');
test('recovery budget is canonical without runtime patching',()=>{assert.match(runtime,/peerRecordRecoveryRetryDelaysMs = \[500, 1_500, 5_000, 10_000, 20_000\]/);assert.match(provision,/RestartSec=1\nTimeoutStopSec=15s\nLimitNOFILE=65536/);});
test('strict D-200 semantics are materialized in maintained source',()=>{for(const m of ['TRUYN_PEER_RECORD_TTL_MS=1800000','BOOTSTRAP_MAX_PEERS_PER_NODE=32','BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS=900000','TRUYN_TESTNET_FAULT_CONTROL=1','d200_failure_evidence_checkpoint() {','d200_err_trap() {'])assert.ok(provision.includes(m),m);for(const m of ['D200_READINESS_WINDOW_HARDENED=1','D200_READINESS_EVIDENCE_V2=1','D200_READINESS_TRANSPORT_GZIP_V1=1','D200_BASELINE_ORIGIN_DIAG=1','D200_BASELINE_PRODUCTION_RECOVERY=1','D200_HEALED_EVIDENCE_TRANSPORT=1','d200_durable_write_ttl_ms=21600000','class-d-200-baseline-origin.json','class-d-200-healed-reconvergence.json','acceptanceUsesFirstAttemptOnly'])assert.ok(campaign.includes(m),m);assert.match(campaign,/assert float\('\$base_rate'\) >= \.99/);assert.match(campaign,/assert float\('\$healed_rate'\) >= \.99/);assert.match(campaign,/assert float\('\$recovery_p95'\) <= 120000/);assert.match(campaign,/'targetCount':32/);assert.match(campaign,/'maxRounds':2/);assert.ok(campaign.includes('seq 5 9'));assert.ok(!campaign.includes('seq 10 14'));});
test('maintained D-1000/D-200 operational paths are canonical truyn',()=>{for(const p of ['benchmarks/scale/class-d-azure-1000-provision.sh','benchmarks/scale/class-d-azure-1000-campaign.sh','scripts/build-class-d-1000-runtime-bundle.sh','scripts/class-d-1000-vm-smoke-preflight.sh']){const s=fs.readFileSync(p,'utf8');assert.doesNotMatch(s,/truyqn|truqyn|truinyn/,p);}});
test('readiness heredoc constructs under bash nounset without expanding jq variables',()=>{const a=campaign.indexOf('STAGE=readiness-barrier'),b=campaign.indexOf('STAGE=convergence',a),block=campaign.slice(a,b),ss=block.indexOf('  script=$(cat <<EOS\n'),em='\nEOS\n)',se=block.indexOf(em,ss);assert.ok(ss>=0&&se>ss);const assignment=block.slice(ss+2,se+em.length);const h=`set -Eeuo pipefail\nHOST_COUNT=20\nNODES_PER_HOST=10\nCONTROL_BASE=19000\nBOOTSTRAP_MAX_PEERS_PER_NODE=32\ni=0\n${assignment}\nprintf '%s\\n' "$script" | grep -F '. as $r' >/dev/null\nprintf '%s\\n' "$script" | grep -F 'nodeIndex: $node' >/dev/null\nprintf '%s\\n' "$script" | grep -F '$expected | to_entries[]' >/dev/null\nprintf '%s\\n' "$script" | grep -F 'as $entry' >/dev/null\nprintf '%s\\n' "$script" | grep -F 'index($entry.value)' >/dev/null\nprintf '%s\\n' "$script" | grep -F '/var/lib/truyn-d1000/records-by-host.json' >/dev/null\n`;const r=spawnSync('bash',['-u','-c',h],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);});
test('canonical shell sources remain syntactically valid',()=>{for(const p of ['benchmarks/scale/class-d-azure-1000-provision.sh','benchmarks/scale/class-d-azure-1000-campaign.sh','scripts/d200-stage-runtime-bundle.sh'])assert.equal(spawnSync('bash',['-n',p]).status,0,p);});
EOF

cat > scripts/check-repository-hygiene.mjs <<'EOF'
#!/usr/bin/env node
import {execFileSync} from 'node:child_process'; import {pathToFileURL} from 'node:url';
export function violationsForPaths(paths){const v=[],lower=new Map();for(const p of paths){const l=p.toLowerCase();lower.set(l,[...(lower.get(l)||[]),p]);if(p==='_tmp_parts'||p.startsWith('_tmp_parts/'))v.push(`${p}: temporary root residue`);if(/^\.github\/workflows\/diag-d200-.*\.ya?ml$/i.test(p))v.push(`${p}: obsolete D-200 launcher`);if(/^scripts\/patch-(?:class-d-diagnostic|d200)-/i.test(p))v.push(`${p}: superseded patcher`);if(/(?:\.orig|\.rej|\.bak|~)$/i.test(p))v.push(`${p}: backup/reject residue`);if(/d200-repository-sanitation-executor|apply-d200-repository-sanitation/.test(p))v.push(`${p}: sanitation executor residue`);}for(const [k,a] of lower)if(a.length>1)v.push(`${a.join(',')}: duplicate case-insensitive paths`);const pr=paths.filter(p=>p.toLowerCase()==='.github/pull_request_template.md');if(pr.length!==1)v.push(`PR template count=${pr.length}`);for(const p of paths.filter(x=>x.endsWith('/.gitkeep'))){const d=p.slice(0,-'.gitkeep'.length);if(paths.some(x=>x!==p&&x.startsWith(d)))v.push(`${p}: unnecessary populated-directory .gitkeep`);}return v;}
export function currentPaths(){return execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);}
export function main(){const v=violationsForPaths(currentPaths());if(v.length)throw new Error(`Repository hygiene violations:\n${v.join('\n')}`);console.log('TRUYN_REPOSITORY_HYGIENE=PASS');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
EOF
chmod +x scripts/check-repository-hygiene.mjs
cat > tests/repository-hygiene.test.js <<'EOF'
import assert from 'node:assert/strict'; import {spawnSync} from 'node:child_process'; import test from 'node:test'; import {violationsForPaths} from '../scripts/check-repository-hygiene.mjs';
test('live repository hygiene passes',()=>{const r=spawnSync(process.execPath,['scripts/check-repository-hygiene.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);});
test('hygiene rejects temporary, obsolete, duplicate and reject artifacts',()=>{const v=violationsForPaths(['.github/PULL_REQUEST_TEMPLATE.md','.github/pull_request_template.md','.github/workflows/diag-d200-old.yml','_tmp_parts/x','foo.rej']);assert.ok(v.length>=4);});
EOF

cat > scripts/test-suite-map.mjs <<'EOF'
import fs from 'node:fs'; import path from 'node:path';
export function classify(name){const b=path.basename(name).toLowerCase(),s=new Set();if(/d200|class-d|regression|readiness|recovery|routing|canonical/.test(b))s.add('regression');if(/security|public-repository|authorization|entitlement|workflow|dco|hygiene|anti-weakening/.test(b))s.add('security');if(/d200|class-d|dht|peer|quic|network|routing|recovery|readiness|testnet/.test(b))s.add('network');if(/sdk|release|conformance/.test(b))s.add('sdk');if(/integration|e2e|testnet|semantic|benchmark|cross-cloud/.test(b))s.add('integration');if(!s.size||/component/.test(b))s.add('component');if(/d200-canonical-regressions|d200-anti-weakening|repository-hygiene|affected-tests|test-suite-taxonomy|documentation-status|public-repository|workflow-policy|dco/.test(b))s.add('fast');s.add('full');return s;}
export function allTests(){return fs.readdirSync('tests').filter(x=>x.endsWith('.test.js')).sort().map(x=>`tests/${x}`);}
export function testsFor(suite){return allTests().filter(x=>classify(x).has(suite));}
EOF
cat > scripts/run-test-suite.mjs <<'EOF'
#!/usr/bin/env node
import {spawnSync} from 'node:child_process'; import {testsFor} from './test-suite-map.mjs';
const suite=process.argv[2];if(!suite)throw new Error('suite required');const files=testsFor(suite);if(!files.length)throw new Error(`suite ${suite} selected zero tests`);console.log(`TRUYN_TEST_SUITE=${suite} tests=${files.length}`);const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:{...process.env,TRUYN_LOCAL_DEVELOPMENT:'1'}});process.exit(r.status??1);
EOF
chmod +x scripts/run-test-suite.mjs
cat > tests/test-suite-taxonomy.test.js <<'EOF'
import assert from 'node:assert/strict'; import test from 'node:test'; import {allTests,classify} from '../scripts/test-suite-map.mjs';
test('every repository test is assigned to a bounded non-full suite',()=>{const orphans=allTests().filter(p=>![...classify(p)].some(x=>!['full','fast'].includes(x)));assert.deepEqual(orphans,[]);});
EOF

cat > scripts/affected-tests.mjs <<'EOF'
#!/usr/bin/env node
import fs from 'node:fs';
export function select(paths){const s=new Set(['fast','security']);let full=false;for(const p of paths){if(!p)continue;if(/^\.github\/workflows\/|^(?:package(?:-lock)?\.json|config\/d200-contract\.json|scripts\/(?:affected-tests|run-test-suite|test-suite-map)\.mjs)$/.test(p)){full=true;continue;}if(/^docs\//.test(p))continue;if(/(?:d200|class-d|benchmarks\/scale\/class-d|network\/)/i.test(p)){s.add('regression');s.add('network');continue;}if(/^sdk\//.test(p)){s.add('sdk');continue;}if(/^tests\//.test(p)){s.add('component');s.add('regression');continue;}if(/^(?:core|protocol|adapters|runtime|cli)\//.test(p)){s.add('component');s.add('integration');continue;}if(/^scripts\//.test(p)){s.add('component');s.add('regression');continue;}full=true;}if(full)s.add('full');return s;}
const args=process.argv.slice(2),gh=args.includes('--github-output'),paths=args.filter(x=>x!=='--github-output'),s=select(paths);for(const k of ['fast','security','regression','component','integration','network','sdk','full']){const v=s.has(k)?'true':'false';if(gh&&process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);}console.log(JSON.stringify({paths,suites:[...s].sort()}));
EOF
chmod +x scripts/affected-tests.mjs
cat > tests/affected-tests.test.js <<'EOF'
import assert from 'node:assert/strict'; import test from 'node:test'; import {select} from '../scripts/affected-tests.mjs';
test('D-200 changes select network/regression plus mandatory gates but not SDK',()=>{const s=select(['network/runtime.js']);for(const x of ['fast','security','network','regression'])assert.ok(s.has(x));assert.ok(!s.has('sdk'));});
test('SDK changes trigger SDK and mandatory gates',()=>{const s=select(['sdk/go/client.go']);for(const x of ['fast','security','sdk'])assert.ok(s.has(x));});
test('unknown critical changes fail closed to full',()=>assert.ok(select(['mystery/new-surface.xyz']).has('full')));
EOF

python3 - <<'PY'
import json
from pathlib import Path
p=Path('package.json'); d=json.loads(p.read_text()); s=d.setdefault('scripts',{}); s['test']='npm run test:full'
for name in ['fast','regression','component','integration','security','network','sdk','full']: s[f'test:{name}']=f'node scripts/run-test-suite.mjs {name}'
p.write_text(json.dumps(d,indent=2)+'\n')
PY

cat > .github/PULL_REQUEST_TEMPLATE.md <<'EOF'
## Summary

Describe the change and why it is needed.

## Protocol / compatibility impact

- [ ] No wire/protocol impact
- [ ] TRUYN/1 behavior changes
- [ ] Migration required
- Decision class (if applicable): Class A / B / C / D / Governance / N/A

## Security / Trustability / privacy impact

Describe security, privacy, provider, billing, or Trustability effects.

## Validation / evidence

Describe exact-SHA tests, CI, CodeQL, and evidence used to validate the change.

## Documentation

- [ ] Updated
- [ ] Not applicable

## Contributor certification

- [ ] Every contribution commit is signed off under **DCO 1.1** with `Signed-off-by: Name <email>` (normally `git commit -s`).
- [ ] I have read `DCO` and `docs/governance/CONTRIBUTION_IP_POLICY.md`.

The checkbox is a reminder only. The authoritative certification is the author-matching `Signed-off-by` trailer on every contribution commit and CI verifies it.
EOF
rm -f .github/pull_request_template.md .github/workflows/.gitkeep
rm -rf _tmp_parts
rm -f .github/workflows/diag-d200-850fff25-qualified.yml .github/workflows/diag-d200-aa43e0e4-readiness-collection.yml .github/workflows/diag-d200-b0da2963-route-repair.yml

# Public repository workflow policy follows the cleaned workflow set.
python3 - <<'PY'
from pathlib import Path
p=Path('tests/public-repository.test.js'); s=p.read_text()
for line in ["  '.github/workflows/.gitkeep',\n","  '.github/workflows/diag-d200-b0da2963-route-repair.yml',\n","  '.github/workflows/diag-d200-aa43e0e4-readiness-collection.yml',\n","  '.github/workflows/diag-d200-850fff25-qualified.yml',\n"]: s=s.replace(line,'')
p.write_text(s)
PY

# Superseded mutation machinery and tests that only prove applying that machinery are removed after canonical materialization.
rm -f scripts/patch-class-d-diagnostic-*.py scripts/patch-d200-*.py
rm -f tests/class-d-diagnostic-*.test.js tests/d200-recovery-budget.test.js tests/d200-baseline-production-recovery.test.js tests/class-d-200-preflight-qualification.test.js

cat > scripts/class-d-200-preflight-qualification.sh <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
node scripts/check-d200-contract.mjs
node scripts/check-repository-hygiene.mjs
node --check network/runtime.js
bash -n benchmarks/scale/class-d-azure-1000-provision.sh
bash -n benchmarks/scale/class-d-azure-1000-campaign.sh
bash -n scripts/d200-stage-runtime-bundle.sh
node --test tests/d200-canonical-regressions.test.js tests/d200-anti-weakening.test.js tests/d200-staging-robustness.test.js tests/d200-peer-propagation-readiness-barrier.test.js tests/d200-route-repair-acceptance-invariants.test.js tests/class-d-canonical-pin-regression.test.js tests/class-d-accepted-entrypoint-regression.test.js
printf 'TRUYN_D200_PREFLIGHT_QUALIFICATION=PASS canonical_source=true runtime_patching=false\n'
EOF
chmod +x scripts/class-d-200-preflight-qualification.sh

# Update the one old recovery-schedule assertion to the canonical accepted schedule.
python3 - <<'PY'
from pathlib import Path
p=Path('tests/peer-record-propagation-readiness.test.js'); s=p.read_text(); s=s.replace('[1_000, 3_000, 10_000, 30_000, 45_000]','[500, 1_500, 5_000, 10_000, 20_000]').replace('[1000, 3000, 10000, 30000, 45000]','[500, 1500, 5000, 10000, 20000]'); p.write_text(s)
for name in ['tests/class-d-1000-diagnostic-sizing.test.js','tests/class-d-1000-remote-manifest-heredoc.test.js']:
    p=Path(name)
    if p.exists(): p.write_text(p.read_text().replace('/opt/truyqn/','/opt/truyn/').replace('/opt/truqyn/','/opt/truyn/'))
PY

cat > docs/operations/NETWORK_SCALE_STATUS.md <<'EOF'
# TRUYN Network-Scale Operational Status

This is the single repository-owned source for **current network-scale operational status**. Stable architecture, roadmap, and top-level documentation must link here rather than copy ephemeral run state.

## Current state

Repository sanitation is active under task `truyn-d200-repository-sanitation-2609102033-8f2c`, anchored by GitHub issue #601. Sanitation changes repository source, tests, CI, and documentation only. It does **not** launch or qualify a new real D-200 campaign.

The D-200 acceptance contract remains strict: 20/20 hosts, 200 processes, `maxPeers=32`, routing `>=0.99`, convergence/recovery `<=120000 ms`, 100 acknowledged writes with zero acknowledged-write loss, zero safety violations, and zero remaining cleanup/staging-cleanup resources.

## Historical immutable failures

Runs `34411602064`, `34438746312`, and `34448411969` are historical failed evidence and are **NEVER_RERUN**. Their existence is evidence, not current operational state.

Issue #536 remains the D-200 task-control/history anchor. PR #597 is a stale earlier staging-repair surface and is not the sanitation base.

## Evidence policy

Benchmark and acceptance evidence is preserved under **redact-not-delete**. Operational secrets and private topology must not be published.
EOF

python3 - <<'PY'
from pathlib import Path
import re
stable=['README.md','ROADMAP.md','docs/README.md','docs/architecture/IMPLEMENTATION_STATUS.md','docs/architecture/ARCHITECTURE_CONTRACT.md']
for name in stable:
    p=Path(name)
    if not p.exists(): continue
    lines=[]
    for line in p.read_text().splitlines():
        if re.search(r'CURRENT_(?:STAGE|MAIN_SHA)\s*=|S50_REPLACEMENT_PR597|\b(?:34411602064|34438746312|34448411969)\b',line): continue
        if re.search(r'\bPR\s*#597\b',line) and re.search(r'D-?200|current|staging|qualification',line,re.I): continue
        lines.append(line)
    rel='docs/operations/NETWORK_SCALE_STATUS.md' if name in ['README.md','ROADMAP.md'] else ('operations/NETWORK_SCALE_STATUS.md' if name=='docs/README.md' else '../operations/NETWORK_SCALE_STATUS.md')
    marker=f'Operational network-scale status: [{rel}]({rel}).'
    text='\n'.join(lines).rstrip()+'\n'
    if 'NETWORK_SCALE_STATUS.md' not in text: text+='\n'+marker+'\n'
    p.write_text(text)
PY

cat > tests/documentation-status.test.js <<'EOF'
import assert from 'node:assert/strict'; import fs from 'node:fs'; import test from 'node:test';
const stable=['README.md','ROADMAP.md','docs/README.md','docs/architecture/IMPLEMENTATION_STATUS.md','docs/architecture/ARCHITECTURE_CONTRACT.md'];
test('stable docs delegate ephemeral network-scale state to one operational source',()=>{for(const p of stable){const s=fs.readFileSync(p,'utf8');assert.match(s,/NETWORK_SCALE_STATUS\.md/,p);assert.doesNotMatch(s,/CURRENT_(?:STAGE|MAIN_SHA)\s*=|S50_REPLACEMENT_PR597|34411602064|34438746312|34448411969/,p);}assert.ok(fs.existsSync('docs/operations/NETWORK_SCALE_STATUS.md'));});
EOF

cat > tests/evidence-preservation.test.js <<'EOF'
import assert from 'node:assert/strict'; import fs from 'node:fs'; import test from 'node:test';
test('sanitation preserves benchmark evidence byte-for-byte',()=>{const a=JSON.parse(fs.readFileSync('docs/operations/d200/sanitation/evidence-ledger-pre.json','utf8')),b=JSON.parse(fs.readFileSync('docs/operations/d200/sanitation/evidence-ledger-post.json','utf8'));assert.deepEqual(b.entries,a.entries);assert.ok(a.entries.length>0);});
EOF

cat > .github/workflows/ci.yml <<'EOF'
name: CI
on:
  push:
    branches: [main]
  pull_request: {}
permissions:
  contents: read
jobs:
  dco:
    name: DCO
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false, fetch-depth: 0}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - name: Verify DCO 1.1 sign-offs
        env: {DCO_BASE_SHA: '${{ github.event.pull_request.base.sha }}', DCO_HEAD_SHA: '${{ github.event.pull_request.head.sha }}'}
        run: node scripts/check-dco.mjs "$DCO_BASE_SHA" "$DCO_HEAD_SHA"
  plan:
    runs-on: ubuntu-latest
    outputs:
      regression: '${{ steps.map.outputs.regression }}'
      component: '${{ steps.map.outputs.component }}'
      integration: '${{ steps.map.outputs.integration }}'
      network: '${{ steps.map.outputs.network }}'
      sdk: '${{ steps.map.outputs.sdk }}'
      full: '${{ steps.map.outputs.full }}'
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false, fetch-depth: 0}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - id: map
        shell: bash
        env: {PR_BASE: '${{ github.event.pull_request.base.sha }}', BEFORE: '${{ github.event.before }}'}
        run: |
          set -Eeuo pipefail
          base="$PR_BASE"; [[ -n "$base" ]] || base="$BEFORE"; [[ -n "$base" && ! "$base" =~ ^0+$ ]] || base="HEAD^"
          mapfile -t changed < <(git diff --name-only "$base" HEAD)
          node scripts/affected-tests.mjs --github-output "${changed[@]}"
  mandatory:
    name: mandatory-security-safety
    needs: plan
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false, fetch-depth: 0}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run test:fast
      - run: npm run test:security
      - run: node scripts/check-d200-contract.mjs
      - run: node scripts/check-repository-hygiene.mjs
      - run: git diff --check
  regression:
    needs: plan
    if: needs.plan.outputs.regression == 'true' || needs.plan.outputs.full == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run test:regression
  component:
    needs: plan
    if: needs.plan.outputs.component == 'true' || needs.plan.outputs.full == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run test:component
  integration:
    needs: plan
    if: needs.plan.outputs.integration == 'true' || needs.plan.outputs.full == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run test:integration
  network:
    needs: plan
    if: needs.plan.outputs.network == 'true' || needs.plan.outputs.full == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: npm run test:network
      - run: bash scripts/class-d-200-preflight-qualification.sh
  sdk-release:
    needs: plan
    if: needs.plan.outputs.sdk == 'true' || needs.plan.outputs.full == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false, fetch-depth: 0}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - uses: actions/setup-python@v5
        with: {python-version: '3.12'}
      - uses: actions/setup-go@v5
        with: {go-version: '1.22.x'}
      - uses: actions/setup-java@v4
        with: {distribution: temurin, java-version: '17'}
      - uses: actions/setup-dotnet@v4
        with: {dotnet-version: '8.0.x'}
      - run: python -m pip install --disable-pip-version-check -e ./sdk/python
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: go test ./...
        working-directory: sdk/go
      - run: mvn -q -f sdk/java/pom.xml test
      - run: dotnet build sdk/dotnet/Truyn.Sdk.csproj --configuration Release --nologo
      - run: node sdk/conformance/run-five-language-e2e.mjs
      - run: sdk/release/build-release.sh
  full-qualification:
    needs: [plan, mandatory]
    if: github.event_name == 'push' || needs.plan.outputs.full == 'true' || startsWith(github.head_ref, 'automation/d200-repository-sanitation-')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with: {persist-credentials: false, fetch-depth: 0}
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - uses: actions/setup-python@v5
        with: {python-version: '3.12'}
      - uses: actions/setup-go@v5
        with: {go-version: '1.22.x'}
      - uses: actions/setup-java@v4
        with: {distribution: temurin, java-version: '17'}
      - uses: actions/setup-dotnet@v4
        with: {dotnet-version: '8.0.x'}
      - run: python -m pip install --disable-pip-version-check -e ./sdk/python
      - run: npm install --ignore-scripts --no-audit --no-fund
      - run: go test ./...
        working-directory: sdk/go
      - run: mvn -q -f sdk/java/pom.xml test
      - run: dotnet build sdk/dotnet/Truyn.Sdk.csproj --configuration Release --nologo
      - run: node sdk/conformance/run-five-language-e2e.mjs
      - run: sdk/release/build-release.sh
      - run: npm run test:full
      - run: bash scripts/class-d-200-preflight-qualification.sh
      - run: git diff --check
  test:
    name: test
    if: always()
    needs: [mandatory, regression, component, integration, network, sdk-release, full-qualification]
    runs-on: ubuntu-latest
    steps:
      - shell: bash
        env:
          RESULTS: '${{ toJSON(needs) }}'
        run: |
          set -Eeuo pipefail
          jq -e 'to_entries | all(.value.result == "success" or .value.result == "skipped")' <<<"$RESULTS" >/dev/null
          jq -e '.mandatory.result == "success"' <<<"$RESULTS" >/dev/null
EOF

# Create final post-sanitation inventory/evidence before removing the one-shot executor itself.
rm -f .github/workflows/d200-repository-sanitation-executor.yml scripts/apply-d200-repository-sanitation.sh
python3 - <<'PY'
import hashlib,json,os,subprocess
from pathlib import Path
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],text=True).splitlines()
# Remove files staged for deletion conceptually by checking filesystem existence.
files=sorted(p for p in files if Path(p).exists())
def classify(p):
    q=p.lower()
    if p.startswith('docs/benchmarks/') or '/evidence' in q: return 'EVIDENCE_KEEP'
    if p.startswith('tests/'): return 'REGRESSION'
    if p.startswith(('network/','benchmarks/scale/','scripts/','config/')): return 'CANONICAL'
    if p.startswith(('README','ROADMAP','docs/','.github/','sdk/')): return 'KEEP'
    return 'UNKNOWN'
Path('docs/operations/d200/sanitation/inventory-post.json').write_text(json.dumps({'taskId':'truyn-d200-repository-sanitation-2609102033-8f2c','files':[{'path':p,'classification':classify(p)} for p in files]},indent=2)+'\n')
entries=[]
for p in sorted(x for x in files if x.startswith('docs/benchmarks/')):
    b=Path(p).read_bytes(); entries.append({'path':p,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
Path('docs/operations/d200/sanitation/evidence-ledger-post.json').write_text(json.dumps({'policy':'redact-not-delete','entries':entries},indent=2)+'\n')
PY

# Exact sanitation smoke/full qualification on the same working tree; no cloud/D-200 execution.
npm run test:fast
npm run test:security
node --test tests/d200-canonical-regressions.test.js tests/d200-anti-weakening.test.js tests/d200-staging-robustness.test.js tests/repository-hygiene.test.js tests/affected-tests.test.js tests/test-suite-taxonomy.test.js tests/documentation-status.test.js tests/evidence-preservation.test.js
bash scripts/class-d-200-preflight-qualification.sh
npm run test:full
python -m pip install --disable-pip-version-check -e ./sdk/python
go test ./... --count=1
( cd sdk/go && go test ./... )
mvn -q -f sdk/java/pom.xml test
dotnet build sdk/dotnet/Truyn.Sdk.csproj --configuration Release --nologo
node sdk/conformance/run-five-language-e2e.mjs
TRUYN_RELEASE_SOURCE_SHA="$(git rev-parse HEAD)" sdk/release/build-release.sh
rm -rf sdk/release/dist
git diff --check

# Final fail-closed scans: no deleted machinery/reference may survive in maintained execution source.
node scripts/check-d200-contract.mjs
node scripts/check-repository-hygiene.mjs
if grep -RIl --exclude-dir=.git -E 'scripts/patch-(class-d-diagnostic|d200)-' scripts benchmarks network .github 2>/dev/null | grep -v 'docs/operations/d200/sanitation/patcher-disposition.json'; then
  echo 'superseded patcher reference survived in maintained execution source' >&2; exit 1
fi
printf 'TRUYN_D200_SANITATION_LOCAL_QUALIFICATION=PASS task=%s\n' "$TASK_ID"
