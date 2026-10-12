import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('./fixtures/g5-azure-isolated-twohost-worker.mjs',import.meta.url));
const source=readFileSync(file,'utf8');
const docker=readFileSync(new URL('./fixtures/Dockerfile.g5-azure-isolated',import.meta.url),'utf8');

test('G5 isolated live worker parses without starting a cloud process',()=>{
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
});

test('G5 worker without explicit isolated identity/config refuses before Azure calls',()=>{
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('G5_TEST_'))delete env[key];
  const r=spawnSync(process.execPath,[file],{encoding:'utf8',env,timeout:10000});
  assert.equal(r.error,undefined);assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/G5_LIVE_REPORT=/);
});

test('G5 source guard preserves signatures, exact source and no blind effect reacquisition',()=>{
  for(const marker of ["fingerprint:hash(canonicalize(envelope))","assert.deepEqual(verifyEnvelope(","effect_identity_conflict","duplicate_request","request_already_completed","acknowledgeDelivery","sourceSha,runId","paidProviderRequests:0","externalInvoiceVerified:false","azureVnetPartition:false"])
    assert.ok(source.includes(marker),marker);
  assert.ok(source.includes("assert.equal(env.G5_TEST_DATABASE, 'g5-live-' + runId)"));
  assert.ok(source.includes("assert.equal(env.G5_TEST_CONTAINER, 'ledger')"));
  assert.ok(source.includes("assert.equal(signal,'SIGKILL')"));
  assert.ok(source.includes('createG5ReadOnlyCosmosLink'));
  assert.doesNotMatch(source,/new URL\(req\.url|https\.request\(target/);
  assert.doesNotMatch(source,/process\.kill\(|execSync\(|spawn\(['"](?:az|bash|sh|sudo|iptables)/);
});

test('G5 fixture image uses explicit base and unprivileged worker; no launcher is installed',()=>{
  assert.match(docker,/ARG BASE_IMAGE\nFROM \$\{BASE_IMAGE\}/);
  assert.match(docker,/USER node/);
  assert.match(docker,/COPY tests\/fixtures\/g5-readonly-cosmos-link.mjs/);
  assert.doesNotMatch(docker,/npm install|apt-get|apk add|curl/);
  assert.equal(existsSync('.github/workflows/g5-isolated-twohost.yml'),false);
});
