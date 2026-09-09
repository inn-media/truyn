import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createObservabilityPlane } from '../observability/plane.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const at = (relative) => path.join(ROOT, relative);

const sensitive = Object.freeze({
  authorization: 'Bearer sprint13-local-auth-value',
  apiKey: 'sprint13-local-api-key-value',
  prompt: 'sprint13-local-prompt-value',
  payload: 'sprint13-local-payload-value'
});

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('Sprint 13 contract requires all four synthetic sensitive values absent from telemetry', async () => {
  const contract = JSON.parse(await readFile(at('operations/production-telemetry-redaction.json'), 'utf8'));
  assert.equal(contract.schema, 'truyn.production-telemetry-redaction/v1');
  assert.equal(contract.environmentClass, 'production');
  assert.equal(contract.runtimeRole, 'provider');
  assert.equal(contract.runtimeImageBinding, 'exact-main-source-sha');
  assert.deepEqual(contract.request.sensitiveFields, ['authorization', 'apiKey', 'prompt', 'payload']);
  assert.deepEqual(contract.telemetrySurfaces, { structuredLogs: true, traces: true, metrics: true });
  assert.equal(contract.redactionContract.valuesMustBeAbsent, true);
  assert.equal(contract.redactionContract.rawValuesInEvidence, false);
  assert.equal(contract.redactionContract.publicEvidenceSanitized, true);
  assert.equal(contract.acceptance.exactTraceReadBackRequired, true);
  assert.equal(contract.acceptance.consoleLogScanRequired, true);
  assert.equal(contract.acceptance.metricsScrapeRequired, true);
  assert.equal(contract.acceptance.sourceShaBindingRequired, true);
  assert.match(contract.acceptance.marker, /TRUYN_TELEMETRY_REDACTION_PASS/);
});

test('existing observability redaction contract removes sensitive values from a real synthetic HTTP request', async () => {
  let output = '';
  const stream = { write(chunk) { output += String(chunk); } };
  const plane = createObservabilityPlane({ enabled: true, service: 'truyn-redaction-test', role: 'provider', stream });
  let captured = null;

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    captured = plane.log('info', 'telemetry.redaction.synthetic', {
      authorization: req.headers.authorization,
      apiKey: req.headers['x-api-key'],
      prompt: parsed.prompt,
      payload: parsed.payload,
      redactionCanary: 'sprint13-local',
      outcome: 'success'
    });
    res.writeHead(204);
    res.end();
  });
  plane.observeHttpServer(server, { surface: 'provider-runtime' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/telemetry-redaction`, {
      method: 'POST',
      headers: {
        authorization: sensitive.authorization,
        'x-api-key': sensitive.apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ prompt: sensitive.prompt, payload: sensitive.payload })
    });
    assert.equal(response.status, 204);
    await response.body?.cancel();
  } finally {
    await closeServer(server);
  }

  assert.equal(captured?.redactionCanary, 'sprint13-local');
  for (const value of Object.values(sensitive)) {
    assert.equal(JSON.stringify(captured).includes(value), false, 'structured record leaked a synthetic sensitive value');
    assert.equal(output.includes(value), false, 'structured log stream leaked a synthetic sensitive value');
  }
  assert.match(output, /telemetry\.redaction\.synthetic/);
  assert.match(output, /http\.request\.complete/);
});

test('production canary challenges logs, traces and metrics with the exact Sprint 13 fields', async () => {
  const source = await readFile(at('runtime/trace-export-canary.js'), 'utf8');
  for (const field of ['authorization', 'apiKey', 'prompt', 'payload']) assert.ok(source.includes(field));
  assert.match(source, /POST/);
  assert.match(source, /\/telemetry-redaction/);
  assert.match(source, /x-api-key/);
  assert.match(source, /observability\.log\('info', 'telemetry\.redaction\.synthetic'/);
  assert.match(source, /input:\s*\{[\s\S]*apiKey:[\s\S]*prompt:[\s\S]*payload:/);
  assert.match(source, /policy:\s*\{[\s\S]*authorization:/);
  assert.match(source, /\/metrics/);
  assert.match(source, /api\/v2\/traces/);
  assert.match(source, /containsForbidden\(capturedStructuredLog\)/);
  assert.match(source, /containsForbidden\(metricsText\)/);
  assert.match(source, /containsForbidden\(exactTrace\)/);
  assert.match(source, /TRUYN_TELEMETRY_REDACTION_PASS authorization=absent apiKey=absent prompt=absent payload=absent logs=clean traces=clean metrics=clean source=exact-main/);
});
