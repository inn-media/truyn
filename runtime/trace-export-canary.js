import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { trace } from '@opentelemetry/api';
import { startProductionObservability } from '../observability/bootstrap.js';
import { getObservabilityPlane } from '../observability/plane.js';

const role = 'provider';
const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const sourceSha = process.env.TRUYN_VERSION || '';
const tempoReadyUrl = 'http://127.0.0.1:3200/ready';

if (!endpoint) throw new Error('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required');
if (endpoint !== 'http://127.0.0.1:4318/v1/traces') {
  throw new Error('production trace export canary requires the private loopback OTLP endpoint');
}
if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('TRUYN_VERSION must be the exact source SHA');

process.env.TRUYN_ROLE = role;
process.env.TRUYN_OBSERVABILITY = '1';
process.env.OTEL_TRACES_SAMPLER = 'always_on';

const synthetic = Object.freeze({
  authorization: `Bearer sprint13-auth-${sourceSha.slice(0, 16)}`,
  apiKey: `sprint13-key-${sourceSha.slice(8, 24)}`,
  prompt: `sprint13-prompt-${sourceSha.slice(16, 32)}`,
  payload: `sprint13-payload-${sourceSha.slice(24, 40)}`
});
const forbiddenValues = Object.values(synthetic);

function containsForbidden(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return forbiddenValues.some((forbidden) => serialized.includes(forbidden));
}

async function waitForTempoReady() {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try {
      const response = await fetch(tempoReadyUrl, { signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel();
      if (response.status === 200) {
        process.stdout.write('TRUYN_RUNTIME_TRACE_BACKEND_READY endpoint=private-loopback\n');
        return;
      }
    } catch {
      // Tempo and the runtime sidecar start concurrently; retry until the private receiver is ready.
    }
    await delay(2_000);
  }
  throw new Error('Tempo readiness timed out before production runtime trace export');
}

async function waitForExactTrace(traceId) {
  const url = `http://127.0.0.1:3200/api/v2/traces/${traceId}`;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const body = await response.text();
      if (response.status === 200 && body.includes('truyn.provider.execute')) return body;
    } catch {
      // The batch trace exporter can take a few seconds to flush into Tempo.
    }
    await delay(1_000);
  }
  throw new Error('production telemetry redaction trace did not become readable');
}

await waitForTempoReady();

const telemetry = await startProductionObservability({ role });
const observability = getObservabilityPlane({
  enabled: true,
  service: process.env.OTEL_SERVICE_NAME || 'truyn-provider-trace-canary',
  role
});

let capturedStructuredLog = null;
const requestServer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/telemetry-redaction') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }

  capturedStructuredLog = observability.log('info', 'telemetry.redaction.synthetic', {
    authorization: req.headers.authorization || null,
    apiKey: req.headers['x-api-key'] || null,
    prompt: parsed.prompt,
    payload: parsed.payload,
    redactionCanary: 'sprint13',
    outcome: 'success'
  });

  res.writeHead(204);
  res.end();
});
observability.observeHttpServer(requestServer, { surface: 'provider-runtime' });
await new Promise((resolve) => requestServer.listen(0, '127.0.0.1', resolve));
const requestAddress = requestServer.address();
if (!requestAddress || typeof requestAddress === 'string') throw new Error('redaction request listener did not bind');

let traceId = null;
const adapter = observability.wrapProviderAdapter({
  name: 'production-trace-canary',
  async execute() {
    traceId = trace.getActiveSpan()?.spanContext()?.traceId || null;
    const response = await fetch(`http://127.0.0.1:${requestAddress.port}/telemetry-redaction`, {
      method: 'POST',
      headers: {
        authorization: synthetic.authorization,
        'x-api-key': synthetic.apiKey,
        'content-type': 'application/json',
        'x-truyn-request-id': `redaction-${sourceSha.slice(0, 12)}`
      },
      body: JSON.stringify({ prompt: synthetic.prompt, payload: synthetic.payload }),
      signal: AbortSignal.timeout(10_000)
    });
    await response.body?.cancel();
    if (response.status !== 204) throw new Error('synthetic redaction request was not accepted');
    return {
      output: 'TRACE_EXPORT_OK',
      metadata: { provider: 'production-trace-canary' }
    };
  }
}, { providerId: 'production-trace-canary' });

await adapter.execute({
  capability: 'trace.acceptance',
  need: {
    id: `trace-export-${sourceSha.slice(0, 12)}`,
    from: 'production-trace-canary'
  },
  input: {
    apiKey: synthetic.apiKey,
    prompt: synthetic.prompt,
    payload: synthetic.payload
  },
  policy: {
    authorization: synthetic.authorization
  }
});

await new Promise((resolve, reject) => requestServer.close((error) => error ? reject(error) : resolve()));

if (!traceId || !/^[0-9a-f]{32}$/.test(traceId)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('truyn.provider.execute did not expose a valid trace id');
}
if (!capturedStructuredLog || capturedStructuredLog.redactionCanary !== 'sprint13') {
  await telemetry.shutdown().catch(() => {});
  throw new Error('structured redaction canary log was not emitted');
}
if (containsForbidden(capturedStructuredLog)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('structured telemetry retained a synthetic sensitive value');
}

await delay(250);
const metricsResponse = await fetch(`http://${telemetry.metricsHost}:${telemetry.metricsPort}/metrics`, {
  signal: AbortSignal.timeout(10_000)
});
const metricsText = await metricsResponse.text();
if (metricsResponse.status !== 200 || !metricsText.includes('/telemetry-redaction')) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('synthetic redaction request did not produce observable request metrics');
}
if (containsForbidden(metricsText)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('metrics telemetry retained a synthetic sensitive value');
}

const exactTrace = await waitForExactTrace(traceId);
if (containsForbidden(exactTrace)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('trace telemetry retained a synthetic sensitive value');
}

process.stdout.write(`TRUYN_TELEMETRY_REDACTION_PASS authorization=absent apiKey=absent prompt=absent payload=absent logs=clean traces=clean metrics=clean source=exact-main sourceSha=${sourceSha}\n`);

await telemetry.shutdown();

const proof = JSON.stringify({
  ok: true,
  span: 'truyn.provider.execute',
  traceId,
  sourceSha,
  endpoint: 'private-loopback-otlp-http',
  redaction: {
    authorizationAbsent: true,
    apiKeyAbsent: true,
    promptAbsent: true,
    payloadAbsent: true,
    logsClean: true,
    tracesClean: true,
    metricsClean: true
  }
});

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/trace-id') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"ok":false}');
    return;
  }
  res.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(proof)
  });
  res.end(proof);
});

await new Promise((resolve) => server.listen(9466, '127.0.0.1', resolve));
process.stdout.write(`TRUYN_RUNTIME_TRACE_EXPORT_SENT span=truyn.provider.execute traceId=${traceId} sourceSha=${sourceSha}\n`);
