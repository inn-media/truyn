import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const targets=[
  ['production-dr-foundation.yml','infra/production-dr/**'],
  ['production-trace-backend.yml','infra/production-tracing/**'],
  ['production-logs-retention.yml','infra/production-observability/logs-retention.bicep'],
  ['production-metrics-backend.yml','infra/production-observability/**'],
  ['production-metrics-collector.yml','infra/production-observability/metrics-collector.bicep']
];
for(const [filename,asset] of targets){
  test('production push only deploys on material source change: '+filename,()=>{
    const source=readFileSync(new URL('../.github/workflows/'+filename,import.meta.url),'utf8');
    const pr=source.match(/^  pull_request:\n([\s\S]*?)(?=^  push:)/m)?.[1];
    const push=source.match(/^  push:\n([\s\S]*?)(?=^permissions:)/m)?.[1];
    assert.ok(pr && push);
    assert.match(pr,/tests\/public-repository\.test\.js/);
    assert.match(push,/branches: \[main\]/);
    assert.ok(push.includes("'"+asset+"'"));
    assert.doesNotMatch(push,/^\s*-\s*'tests\//m);
    assert.doesNotMatch(push,/^\s*-\s*'\.github\/workflows\//m);
    assert.match(source,/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    assert.match(source,/if: github\.event_name == 'pull_request'/);
  });
}
