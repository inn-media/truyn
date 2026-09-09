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

await waitForTempoReady();

const telemetry = await startProductionObservability({ role });
const observability = getObservabilityPlane({
  enabled: true,
  service: process.env.OTEL_SERVICE_NAME || 'truyn-provider-trace-canary',
  role
});

let traceId = null;
const adapter = observability.wrapProviderAdapter({
  name: 'production-trace-canary',
  async execute() {
    traceId = trace.getActiveSpan()?.spanContext()?.traceId || null;
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
  input: null,
  policy: {}
});

if (!traceId || !/^[0-9a-f]{32}$/.test(traceId)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('truyn.provider.execute did not expose a valid trace id');
}

await telemetry.shutdown();

const proof = JSON.stringify({
  ok: true,
  span: 'truyn.provider.execute',
  traceId,
  sourceSha,
  endpoint: 'private-loopback-otlp-http'
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
