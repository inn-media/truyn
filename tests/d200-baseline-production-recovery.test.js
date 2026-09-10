import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const patcher = new URL('../scripts/patch-d200-baseline-production-recovery.py', import.meta.url).pathname;
const canonicalNeed = `def need(j,node_id,k):\n    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline','probe':k}},separators=(',',':'))\n    t=time.perf_counter_ns()\n    p=subprocess.run(['curl','-sS','--max-time','15','-o',f'/tmp/d1000-base-first-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)\n    ms=(time.perf_counter_ns()-t)/1e6\n    code=p.stdout.strip()\n    return {'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3)}\n`;

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-baseline-'));
  const path = join(dir, 'campaign.sh');
  await writeFile(path, `D200_BASELINE_ORIGIN_DIAG=1\n${canonicalNeed}\nassert float('$base_rate') >= .99, '$base_rate'\n`);
  return path;
}

test('patch keeps >=0.99 gate and uses one bounded production refresh before one need retry', async () => {
  const path = await fixture();
  const run = spawnSync('python3', [patcher, path], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const text = await readFile(path, 'utf8');
  assert.match(text, /D200_BASELINE_PRODUCTION_RECOVERY=1/);
  assert.match(text, /control\+'\/dht\/refresh'/);
  assert.match(text, /'targetCount':32/);
  assert.match(text, /'maxRounds':2/);
  assert.match(text, /retry=attempt\('recovered'\)/);
  assert.match(text, /assert float\('\$base_rate'\) >= \.99/);
  assert.doesNotMatch(text, />= \.98|targetCount':200|all.?to.?all/i);
});

test('patch is fail-closed when prerequisite marker is absent or applied twice', async () => {
  const path = await fixture();
  let run = spawnSync('python3', [patcher, path], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  run = spawnSync('python3', [patcher, path], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);

  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-baseline-negative-'));
  const missing = join(dir, 'campaign.sh');
  await writeFile(missing, `${canonicalNeed}\nassert float('$base_rate') >= .99, '$base_rate'\n`);
  run = spawnSync('python3', [patcher, missing], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
});
