import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const stage = readFileSync('benchmarks/scale/d200-write-retention-stage.sh','utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const keys = Array.from({length:5},(_,i)=>`d1000-7-${i}`);
const fakeRow = (key,i) => ({key,publisherLocalNode:i,classification:'retained',readTelemetry:{
  pressure:Array.from({length:100},(_,j)=>sha(`${key}:${j}`)).join('')
}});

test('retention host response survives simulated 4KiB Azure Run Command stdout limit through bounded chunks',()=>{
  const host={schema:'truyn.d200.write-retention.host.v2',host:7,rows:keys.map(fakeRow),retained:5,confirmedMissing:0,readErrors:0};
  const raw=Buffer.from(JSON.stringify(host));
  assert.ok(raw.length>4096,'regression fixture must exceed Azure response window');
  const encoded=gzipSync(raw,{level:9,mtime:0}).toString('base64');
  const digest=sha(encoded);
  const chunks=encoded.match(/.{1,1800}/g);
  assert.ok(chunks.length>1);
  assert.ok(chunks.every(s=>s.length<=1800));
  const reconstructed=chunks.join('');
  assert.equal(sha(reconstructed),digest);
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(reconstructed,'base64')).toString()),host);
  assert.notEqual(sha('X'+reconstructed.slice(1)),digest,'tampered transfer must fail digest');
});

test('guest write-retention report uses bounded authenticated transfer, not unbounded stdout',()=>{
  assert.ok(!stage.includes("print('RETENTION_HOST_JSON='"));
  for(const marker of ['RETENTION_HOST_SHA256=','RETENTION_HOST_BYTES=','RETENTION_HOST_CHUNKS=','RETENTION_HOST_CHUNK=','sha256sum',
     'payload_digest_mismatch','invalid_host_observations','report_error','readErrors'])
    assert.ok(stage.includes(marker),`missing fail-closed transport marker ${marker}`);
  assert.ok(stage.includes('chunk_index')&&stage.includes('1800'));
});

test('all original 100-write safety invariants and zero tolerated read errors remain mandatory',()=>{
  assert.ok(stage.includes('[[ "$ack_loss" == 0 ]]'));
  assert.ok(stage.includes('[[ "$retention_read_errors" == 0 ]]'));
  assert.ok(stage.includes('ack_loss=$((writes-retained))'));
  assert.ok(stage.includes('readErrors\':5'));
});
