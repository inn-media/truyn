import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wf = async (name) => readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');

test('mixed material main pushes cannot run concurrent DR/Logs/Trace Azure writers', async () => {
  const logs = await wf('production-logs-retention.yml');
  const trace = await wf('production-trace-backend.yml');

  for (const [label, source] of [['Logs', logs], ['Trace', trace]]) {
    const guard = source.indexOf('Reject mixed ');
    const azureLogin = source.indexOf('- uses: azure/login@v2', guard);
    assert.ok(guard > 0 && azureLogin > guard, label + ' must guard BEFORE Azure login');
    assert.match(source.slice(guard, azureLogin), /github\.event_name == 'push'/);
    assert.match(source.slice(guard, azureLogin), /git diff --name-only "\$PUSH_BEFORE" "\$GITHUB_SHA"/);
    assert.match(source.slice(guard, azureLogin), /infra\/production-dr\//);
    assert.match(source.slice(guard, azureLogin), /exit 42/);
    assert.match(source.slice(guard, azureLogin), /exit 41/);
  }
  const traceGuard = trace.slice(trace.indexOf('Reject mixed '), trace.indexOf('- uses: azure/login@v2'));
  assert.match(traceGuard, /infra\/production-observability\/logs-retention/);
  assert.match(traceGuard, /operations\/production-logs-retention/);
});

test('Trace consumes both standalone and nested accepted Logs runs without skipping DR-dependent chain', async () => {
  const trace = await wf('production-trace-backend.yml');
  assert.match(trace, /github\.event\.workflow_run\.event == 'workflow_run'/);
  assert.match(trace, /\.event=="push" or \.event=="workflow_run"/);
  assert.match(trace, /production-logs-retention-evidence/);
  assert.match(trace, /\.expired==false and \.size_in_bytes>0/);
  assert.match(trace, /\$GITHUB_SHA" == "\$UPSTREAM_SHA/);
});

test('Redaction consumes accepted nested Trace run only with two immutable readback artifacts', async () => {
  const redaction = await wf('production-telemetry-redaction.yml');
  assert.match(redaction, /github\.event\.workflow_run\.event == 'workflow_run'/);
  assert.match(redaction, /actions: read/);
  assert.match(redaction, /production-trace-backend-evidence/);
  assert.match(redaction, /production-trace-export-evidence/);
  assert.match(redaction, /\.expired==false and \.size_in_bytes>0/);
  assert.ok(redaction.indexOf('Admit only immutable successful production Trace read-back') <
            redaction.indexOf('- uses: azure/login@v2', redaction.indexOf('prove-exact-main:')));
});

test('all production ACA writers share one fail-closed exclusive lock', async () => {
  for (const file of ['production-dr-foundation.yml','production-logs-retention.yml',
    'production-trace-backend.yml','production-metrics-backend.yml','production-metrics-collector.yml']) {
    const source = await wf(file);
    assert.match(source,/    concurrency:\n      group: truyn-production-aca-exclusive-writer\n      cancel-in-progress: false/);
    assert.match(source,/Verify live remote main before Azure production mutation/);
    assert.match(source,/git ls-remote --exit-code/);
    assert.match(source,/current_main.*GITHUB_SHA/);
    assert.match(source,/exit 43/);
    assert.ok(source.indexOf('Verify live remote main before Azure production mutation') <
      source.indexOf('- uses: azure/login@v2'),'remote main checked before Azure login: '+file);
  }
});
test('Metrics refuse a mixed DR source push before Azure login and writers have recheck before first writes', async () => {
  for (const file of ['production-metrics-backend.yml','production-metrics-collector.yml']) {
    const source = await wf(file);
    assert.match(source,/Fail closed on concurrent foundation material push/);
    assert.match(source,/git diff --name-only/);
    assert.ok(source.includes('infra/production-dr/'));
    assert.ok(source.indexOf('Fail closed on concurrent foundation material push') <
      source.indexOf('- uses: azure/login@v2'));
  }
  const logs = await wf('production-logs-retention.yml');
  const trace = await wf('production-trace-backend.yml');
  for (const [source, firstWrite] of [[logs,'Provision 30-day hot'],[trace,'Build exact-main Tempo image']]) {
    assert.ok(source.lastIndexOf('Verify live remote main before Azure production mutation',
      source.indexOf('      - name: '+firstWrite)) > source.indexOf('- uses: azure/login@v2'));
  }
});

test('job-level ACA queue retains pending writers instead of cancel-and-replace', async () => {
  for(const file of ['production-dr-foundation.yml','production-logs-retention.yml',
    'production-trace-backend.yml','production-metrics-backend.yml','production-metrics-collector.yml']){
    const source=await wf(file);
    assert.match(source,/group: truyn-production-aca-exclusive-writer\\n      queue: max\\n      cancel-in-progress: false/);
  }
});
test('each bounded DR ACA backoff retries only while exact live main matches', async()=>{
  const source=await wf('production-dr-foundation.yml');
  const p=source.indexOf('for environment_retry in 1 2 3 4; do');
  const arm=source.indexOf('if az deployment group create',p);
  assert.ok(p>=0 && arm>p);
  const pre=source.slice(p,arm);
  assert.match(pre,/git ls-remote --exit-code/);
  assert.match(pre,/current_main.*GITHUB_SHA/);
  assert.match(pre,/exit 43/);
  assert.match(source,/sleep "\$\(\(30 \* environment_retry\)\)"/);
});
