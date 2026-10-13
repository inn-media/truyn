#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyEnvelope } from '../../../core/protocol/index.js';
import { LANGUAGES, MODES, fixture, digest, validateRegistration } from './contract.mjs';

import { launchNativePeer } from '../lifecycle-peer/native-peer.mjs';

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
assert.equal(sourceSha, process.env.TRUYN_EXPECTED_SOURCE_SHA);
const context = { sourceSha, sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),
  runId:Number(process.env.GITHUB_RUN_ID), runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT), event:process.env.GITHUB_EVENT_NAME };
assert.ok(Number.isSafeInteger(context.runId) && context.runId > 0 && context.runAttempt > 0 && context.event);
assert.equal(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim(), '', 'qualification requires committed source');
const directory = resolve(process.env.RUNNER_TEMP, 'five-sdk-evidence');
const packageBytes = readFileSync(resolve(directory, 'report.json'));
const packages = JSON.parse(packageBytes);
assert.deepEqual(packages.context, context); assert.equal(packages.status, 'PASS'); assert.equal(packages.packages.length, 5);
const cases = fixture(), outcomes = [];
let active;
const server = http.createServer(async (req, res) => {
  try {
    assert.equal(req.method,'POST'); assert.equal(req.url,'/v1/register'); assert.ok(active);
    const chunks=[]; let size=0;
    for await (const chunk of req) { size+=chunk.length; assert.ok(size<65536); chunks.push(chunk); }
    const envelope=JSON.parse(Buffer.concat(chunks).toString()).envelope;
    active.requests++;
    assert.equal(envelope.type,'IDENTITY'); assert.equal(verifyEnvelope(envelope).ok,true);
    assert.deepEqual(envelope.payload.protocols,active.item.protocols);
    active.signatureVerified=true;
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(active.item.response));
  } catch (error) { if(active)active.error=error.message; res.writeHead(500).end('{}'); }
});
await new Promise(ok => server.listen(0,'127.0.0.1',ok));
const url = `http://127.0.0.1:${server.address().port}`;

try {
  for(const language of LANGUAGES) for(const mode of MODES) {
    const peer=launchNativePeer(language,mode,url);
    try {
      for(const item of cases.cases) {
        active={item,requests:0,signatureVerified:false};
        const result=await peer.call('connect',{actor:item.id,protocols:item.protocols});
        assert.equal(active.error,undefined,active.error);
        const accepted=result.ok,code=result.code??null;
        const status=accepted===item.expected.ok&&(accepted||code===item.expected.code)?'PASS':'FAIL';
        outcomes.push({language,mode,id:item.id,accepted,code,requests:active.requests,signatureVerified:active.signatureVerified,status});
      }
    } finally { peer.child.stdin.end(); if(peer.child.exitCode===null)peer.child.kill('SIGTERM'); }
  }
  const report={schema:'truyn.p11.native-registration/v1',context,fixtureSha256:cases.sha256,
    packagesReportSha256:digest(packageBytes),outcomes,status:outcomes.every(r=>r.status==='PASS')?'PASS':'HISTORICAL_FAILURES',
    stableProtocolDeclared:false,productionCutoverAuthorized:false};
  writeFileSync(resolve(directory,'registration.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const summary=validateRegistration(report,context,packageBytes,{requireAll:process.env.TRUYN_REGISTRATION_REQUIRE_ALL==='true'});
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha);
  assert.equal(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim(),'');
  console.log(JSON.stringify({schema:report.schema,context,...summary,reportSha256:digest(readFileSync(resolve(directory,'registration.json')))}));
} finally { server.closeAllConnections(); await new Promise(ok=>server.close(ok)); }
