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


import { mkdtempSync, writeFileSync, readFileSync as readTemp, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('actual retention-stage controller recovers oversized guest evidence, and rejects a tampered chunk',()=>{
  const root=mkdtempSync(join(tmpdir(),'d5000-retention-'));
  try {
    const fakeCurl=[
      '#!/usr/bin/env node',
      'const c=require("node:crypto");',
      'const url=process.argv.at(-1);',
      'const blob=Array.from({length:60},(_,i)=>c.createHash("sha256").update(url+":"+i).digest("hex")).join("");',
      'process.stdout.write(JSON.stringify({records:[{value:{ok:true}}],readTelemetry:{blob}})+"\\n200");'
    ].join('\n')+'\n';
    writeFileSync(join(root,'curl'),fakeCurl,{mode:0o755});
    const replay=stage.replaceAll('/var/lib/truyn-d1000/retention-host-',root+'/retention-host-');
    for(const corrupt of [false,true]){
      const workspace=join(root,corrupt?'corrupt':'valid');
      mkdirSync(workspace);
      const init=[
        'set -Eeuo pipefail',
        'HOST_COUNT=2',
        'CONTROL_BASE=18000',
        'VMS=(h0 h1)',
        'writes=10',
        'd200_durable_write_ttl_ms=21600000',
        'd200_write_window_start_ms=$(date +%s%3N)',
        'MOCK_DIR='+JSON.stringify(root),
        'MOCK_CORRUPT='+(corrupt?'1':'0'),
        'GITHUB_WORKSPACE='+JSON.stringify(workspace),
        'host_status_arm(){ :; }',
        'wait_host_stage(){ shift 2; local pid; for pid in "$@"; do wait "$pid" || return $?; done; }',
        'marker(){ printf "%s\\n" "$1" | sed -n "s/.*$2=//p" | tail -1 | tr -d "\\r"; }',
        'remote(){',
        ' local vm="$1" body="$2" result rc=0;',
        ' result=$(PATH="$MOCK_DIR:$PATH" bash -c "$body") || rc=$?;',
        ' [[ "$rc" == 0 ]] || return "$rc";',
        ' if [[ "$MOCK_CORRUPT" == 1 && "$vm" == h1 && "$body" == *RETENTION_HOST_CHUNK=* ]]; then',
        '   result=$(printf "%s" "$result" | sed "s/RETENTION_HOST_CHUNK=./RETENTION_HOST_CHUNK=X/");',
        ' fi;',
        ' printf "%s\\n" "$result" | tail -c 4096;',
        '}',
      ].join('\n');
      const executed=spawnSync('bash',['-c',init+'\n'+replay],{encoding:'utf8',timeout:110000});
      const reported=JSON.parse(readTemp(join(workspace,'class-d-200-write-retention-hosts.json'),'utf8'));
      if(!corrupt){
        assert.equal(executed.status,0,executed.stderr);
        assert.equal(reported.retained,10);
        assert.equal(reported.readErrors,0);
        assert.equal(reported.confirmedMissing,0);
        assert.equal(reported.acknowledgedWriteLoss,0);
        assert.ok(reported.hosts.every(h=>h.rows.length===5));
      }else{
        assert.notEqual(executed.status,0,'tampered chunk must fail closed');
        assert.equal(reported.retained,5);
        assert.equal(reported.readErrors,5);
        assert.equal(reported.confirmedMissing,0);
        assert.equal(reported.acknowledgedWriteLoss,5);
        assert.equal(reported.hosts[1].observationError,'payload_digest_mismatch');
      }
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
