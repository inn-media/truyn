import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  correlationModel,
  hashSafeIdentity,
  normalizeRoute,
  structuredLogRecord
} from '../observability/plane.js';
import { assertPrivateMetricsHost } from '../observability/bootstrap.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const at = (relative) => path.join(ROOT, relative);

test('observability correlation model is stable, complete and hash-safe', () => {
  const model = correlationModel({
    requestId: 'request-1', needId: 'need-1', providerId: 'provider-private-456', nodeId: 'node-private-123',
    sessionId: 'session-secret-value', traceId: '0123456789abcdef0123456789abcdef', resultId: 'result-1', errorClass: 'authorization'
  });
  assert.deepEqual(Object.keys(model), ['requestId', 'needId', 'providerId', 'nodeId', 'sessionId', 'traceId', 'resultId', 'errorClass']);
  assert.equal(model.providerId, hashSafeIdentity('provider-private-456'));
  assert.equal(model.nodeId, hashSafeIdentity('node-private-123'));
  assert.notEqual(model.sessionId, 'session-secret-value');
  assert.match(model.sessionId, /^sha256:[0-9a-f]{24}$/);
});

test('structured logs remove secrets and content-bearing fields', () => {
  const record = structuredLogRecord('error', 'test.event', {
    needId: 'need-2', nodeId: 'node-2', authorization: 'Bearer do-not-log', sessionToken: 'do-not-log',
    apiKey: 'do-not-log', privateKey: 'do-not-log', prompt: 'do-not-log', input: 'do-not-log', output: 'do-not-log',
    payload: 'do-not-log', component: 'relay', outcome: 'failure'
  }, { service: 'truyn-test', role: 'test', traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  const serialized = JSON.stringify(record);
  assert.match(record.nodeId, /^sha256:/);
  assert.equal(record.traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  for (const forbidden of ['Bearer do-not-log', 'sessionToken', 'apiKey', 'privateKey', 'prompt', 'input', 'output', 'payload']) {
    assert.equal(serialized.includes(forbidden), false, `structured log leaked ${forbidden}`);
  }
});

test('route labels remove identifier cardinality', () => {
  assert.equal(normalizeRoute('/v1/nodes/node-123'), '/v1/nodes/:nodeId');
  assert.equal(normalizeRoute('/v1/contexts/cid-123/retrieve'), '/v1/contexts/:cid/retrieve');
  assert.equal(normalizeRoute('/v1/fast/requests/request-123'), '/v1/fast/requests/:requestId');
  assert.equal(normalizeRoute('/v1/fast/chains/chain-123/trace'), '/v1/fast/chains/:chainId/trace');
});

test('Prometheus metrics listener is fail-closed to loopback', () => {
  assert.equal(assertPrivateMetricsHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => assertPrivateMetricsHost('0.0.0.0'), /must bind to loopback/);
  assert.throws(() => assertPrivateMetricsHost('10.0.0.10'), /must bind to loopback/);
});

test('production image starts observability before runtime and does not expose metrics port', async () => {
  const dockerfile = await readFile(at('Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY observability \.\/observability/);
  assert.match(dockerfile, /ENV TRUYN_OBSERVABILITY=1/);
  assert.match(dockerfile, /ENV TRUYN_METRICS_HOST=127\.0\.0\.1/);
  assert.match(dockerfile, /CMD \["node", "runtime\/production\.js"\]/);
  assert.doesNotMatch(dockerfile, /EXPOSE[^\n]*9464/);
  const production = await readFile(at('runtime/production.js'), 'utf8');
  assert.ok(production.indexOf('startProductionObservability') < production.indexOf("import('./service.js')"));
});

test('public health stays minimal while metrics use a private plane', async () => {
  const relay = await readFile(at('network/relay/server.js'), 'utf8');
  const service = await readFile(at('runtime/service.js'), 'utf8');
  assert.match(relay, /if \(!exposeDiagnostics\) return json\(res, 200, \{ ok: true, protocol: 'TRUYN\/1' \}\)/);
  assert.match(service, /req\.url === '\/health'[\s\S]{0,120}\{ ok: true, protocol: 'TRUYN\/1' \}/);
});

test('required production dashboards are checked in', async () => {
  const dir = at('observability/grafana/dashboards');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(names, ['authorization.json','billing-entitlement.json','external-a2a-mcp.json','infrastructure.json','network-dht.json','provider-runtimes.json','relay.json','semantic-retrieval.json']);
  for (const name of names) {
    const dashboard = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    assert.match(dashboard.title, /^TRUYN \/ /);
    assert.ok(dashboard.panels.length >= 3);
    assert.ok(dashboard.panels.every((panel) => panel.targets?.some((target) => typeof target.expr === 'string' && target.expr.includes('truyn_'))));
  }
});

test('burn-rate rules preserve production SLO thresholds', async () => {
  const rules = await readFile(at('observability/prometheus/slo-alerts.yml'), 'utf8');
  for (const marker of ['14.4', '>= 6', '>= 3', '0.0005', '0.001', 'SLO-HTTP-1', 'SLO-DISPATCH-1', 'SLO-RESULT-1']) assert.ok(rules.includes(marker));
});
