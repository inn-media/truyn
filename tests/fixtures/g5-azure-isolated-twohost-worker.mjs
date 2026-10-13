import assert from 'node:assert/strict';
import { createG5ReadOnlyCosmosLink } from './g5-readonly-cosmos-link.mjs';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCosmosLifecycleLedger } from '../../network/relay/cosmos-lifecycle-ledger.js';
import { containerAppsManagedIdentityToken } from '../../adapters/providers/common/azure-auth.js';
import { createEnvelope, canonicalize, verifyEnvelope } from '../../core/protocol/index.js';

// Source-only test fixture. No workflow deploys or invokes this file.
// The local TCP cut is NOT an Azure VNet/region outage. No shared network rule changes.
const env = process.env;
const role = env.G5_TEST_ROLE;
const runId = env.G5_TEST_RUN_ID;
const sourceSha = env.G5_TEST_SOURCE_SHA;
assert.match(runId || '', /^[0-9]{6,15}$/);
assert.match(sourceSha || '', /^[0-9a-f]{40}$/);
assert.ok(['A', 'B', 'child', 'probe'].includes(role));
assert.equal(env.G5_TEST_DATABASE, 'g5-live-' + runId);
assert.equal(env.G5_TEST_CONTAINER, 'ledger');
if (role === 'child') assert.equal(typeof process.send, 'function');
const endpoint = new URL(env.G5_TEST_COSMOS_ENDPOINT);
assert.equal(endpoint.protocol, 'https:');
assert.match(endpoint.hostname, /^[a-z0-9.-]+\.documents\.azure\.com$/);
const keys = JSON.parse(Buffer.from(env.G5_TEST_KEYS || '', 'base64').toString('utf8'));
const provider = keys.provider, requester = keys.requester;
const hash = value => createHash('sha256').update(value).digest('hex');
const options = {endpoint:endpoint.origin,database:env.G5_TEST_DATABASE,container:'ledger',
  getAccessToken:()=>containerAppsManagedIdentityToken({resource:'https://cosmos.azure.com/'}),
  requestTimeoutMs:8000};
const ledger = createCosmosLifecycleLedger(options);
const id = 'g5-live-' + runId;
const body = {capability:{name:'g5.isolated.canary'},input:{runId,sourceSha},policy:{}};
const envelope = createEnvelope({type:'NEED',from:requester.nodeId,
  publicKeyPem:requester.publicKeyPem,privateKeyPem:requester.privateKeyPem,
  id,createdAt:env.G5_TEST_CREATED_AT,payload:body});
const reservation = {id,requester:requester.nodeId,provider:provider.nodeId,
  fingerprint:hash(canonicalize(envelope)),capability:'g5.isolated.canary',
  mode:'test-only',scope:requester.nodeId,policyDigest:hash('{}'),
  delivery:{kind:'NEED',recipient:provider.nodeId,event:{kind:'NEED',envelope}}};
const effect = {id,requester:requester.nodeId,provider:provider.nodeId,fingerprint:reservation.fingerprint};
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn,label) {
  const until = Date.now()+210000;
  do {
    try {const v=await fn();if(v)return v;} catch(e){if(e.httpStatus!==503)throw e;}
    await sleep(1500);
  } while(Date.now()<until);
  throw new Error('g5_timeout_'+label);
}
const markerId = suffix=>id+':'+suffix;
const markerDigest = suffix=>hash(canonicalize({sourceSha,runId,suffix}));
async function mark(suffix){await ledger.reserveOffer({id:markerId(suffix),owner:provider.nodeId,fingerprint:markerDigest(suffix)});}
async function waitMarker(suffix){const row=await waitFor(()=>ledger.getOffer(markerId(suffix)),suffix);assert.equal(row.owner,provider.nodeId);assert.equal(row.fingerprint,markerDigest(suffix));}
function report(checks){console.log('G5_LIVE_REPORT='+JSON.stringify({schema:'truyn.g5.live-job/v1',sourceSha,runId,role,hostHash:hash(hostname()),checks,paidProviderRequests:0,externalInvoiceVerified:false}));}
async function childWork(){
  await ledger.reserveNeed(reservation);
  assert.equal((await ledger.beginEffect(effect)).acquired,true);
  // An unresolved top-level await alone does not keep Node alive. Retain the
  // existing IPC handle so only the supervisor's verified SIGKILL ends this child.
  process.channel.ref();
  process.send({checkpoint:'durable-reservation-and-effect',runId,sourceSha});
  await new Promise(()=>{});
}
async function hostA(){
  const child=fork(fileURLToPath(import.meta.url),[],{env:{...env,G5_TEST_ROLE:'child'},stdio:['ignore','ignore','pipe','ipc']});
  child.stderr.resume();const exit=once(child,'exit');let timer;
  try{
    await Promise.race([
      once(child,'message').then(([m])=>{assert.equal(m.checkpoint,'durable-reservation-and-effect');assert.equal(m.runId,runId);assert.equal(m.sourceSha,sourceSha);}),
      exit.then(()=>{throw new Error('g5_child_exited_before_checkpoint');}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('g5_checkpoint_timeout')),90000);})
    ]);
    assert.equal(child.kill('SIGKILL'),true);
    const [code,signal]=await exit;assert.equal(code,null);assert.equal(signal,'SIGKILL');
    await mark('A-killed');await waitMarker('B-recovered');
    report({actualAzureWrite:true,supervisedChildSigkill:true});
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}
async function socketCutCheck(){
  const link=createG5ReadOnlyCosmosLink({endpoint:endpoint.origin,
    database:options.database,container:options.container,logicalId:id});
  const remote=createCosmosLifecycleLedger({...options,fetchImpl:link.fetchImpl});
  await link.open();
  try{
    assert.equal((await remote.getNeed(id)).status,'matched');
    await link.cut();
    await assert.rejects(()=>remote.getNeed(id),e=>e.publicCode==='lifecycle_ledger_unavailable');
    await link.open();
    assert.equal((await remote.getNeed(id)).status,'matched');
  }finally{await link.close();}
}
async function probeConnectivity(){
  const expected=env.G5_EXPECT_CONNECTIVITY;
  assert.ok(['up','down'].includes(expected));
  if(expected==='down'){
    await assert.rejects(()=>ledger.getNeed(id),e=>
      e.publicCode==='lifecycle_ledger_unavailable' || e.publicCode==='lifecycle_ledger_auth_denied');
    report({azureVnetPartition:true,connectivityExpectedDown:true,cosmosReadFailedClosed:true});
    return;
  }
  const row=await waitFor(()=>ledger.getNeed(id),'probe-up');
  assert.equal(row.requester,requester.nodeId);
  assert.ok(['matched','completed'].includes(row.status));
  report({azureVnetHealed:true,connectivityExpectedUp:true,cosmosReadRecovered:true,restoredSource:env.G5_EXPECT_RESTORED==='1'});
}
async function hostB(){
  await waitMarker('A-killed');const admitted=await ledger.getNeed(id);
  assert.equal(admitted.requester,requester.nodeId);assert.equal(admitted.fingerprint,reservation.fingerprint);
  assert.deepEqual(verifyEnvelope(admitted.deliveries.find(x=>x.kind==='NEED').event.envelope),{ok:true});
  await assert.rejects(()=>ledger.reserveNeed(reservation),e=>e.publicCode==='duplicate_request');
  assert.equal((await ledger.beginEffect(effect)).acquired,false);
  await assert.rejects(()=>ledger.beginEffect({...effect,requester:provider.nodeId}),e=>e.publicCode==='effect_identity_conflict');
  await socketCutCheck();
  const result=createEnvelope({type:'RESULT',from:provider.nodeId,to:requester.nodeId,publicKeyPem:provider.publicKeyPem,privateKeyPem:provider.privateKeyPem,id:id+'-result',payload:{requestId:id,output:{canary:true},completedAt:new Date().toISOString()}});
  await ledger.transitionNeed({id,provider:provider.nodeId,to:'completed',delivery:{kind:'RESULT',recipient:requester.nodeId,event:{kind:'RESULT',envelope:result}}});
  await assert.rejects(()=>ledger.transitionNeed({id,provider:provider.nodeId,to:'completed'}),e=>e.publicCode==='request_already_completed');
  const pending=await ledger.pendingDeliveries({recipient:requester.nodeId});
  const results=pending.filter(x=>x.requestId===id&&x.kind==='RESULT');assert.equal(results.length,1);
  assert.deepEqual(verifyEnvelope(results[0].event.envelope),{ok:true});
  await ledger.acknowledgeDelivery({eventId:results[0].eventId,recipient:requester.nodeId});
  const fresh=createCosmosLifecycleLedger(options);
  assert.equal((await fresh.pendingDeliveries({recipient:requester.nodeId})).filter(x=>x.requestId===id).length,0);
  assert.equal((await fresh.getNeed(id)).status,'completed');await mark('B-recovered');
  report({actualAzureWrite:true,remoteCrashRecovery:true,duplicateNeedRejected:true,effectIntentNotReacquired:true,conflictingSignerRejected:true,actualTcpCutAndHeal:true,azureVnetPartition:false,singleSignedTerminal:true,ackSurvivesNewClient:true});
}
try{
  if(role==='probe') await probeConnectivity();
  else {
    await waitFor(async()=>{await ledger.getNeed(id+'-readiness');return true;},'rbac');
    if(role==='child') await childWork();
    else if(role==='A') await hostA();
    else await hostB();
  }
}
catch(e){console.error('G5_LIVE_FAIL='+JSON.stringify({role,sourceSha,runId,code:/^[a-zA-Z0-9_]{1,100}$/.test(e.publicCode||'')?e.publicCode:'assertion_or_transport_failure'}));process.exitCode=1;}
