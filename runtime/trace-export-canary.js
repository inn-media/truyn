import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { trace } from '@opentelemetry/api';
import { startProductionObservability } from '../observability/bootstrap.js';
import { getObservabilityPlane } from '../observability/plane.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

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
const tracer = trace.getTracer('io.truyn.production-trace-correlation', '1');

const relay = createRelay({ localDevelopmentMode: true });
let relayUrl = null;
let traceId = null;
let requestId = null;
let needId = null;
let resultId = null;

try {
  relayUrl = await relay.listen({ host: '127.0.0.1', port: 0 });
  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  const provider = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register({ name: 'trace-correlation-requester' });

  const adapter = observability.wrapProviderAdapter({
    name: 'production-trace-canary',
    capabilities: [{ name: 'trace.acceptance' }],
    async execute({ need }) {
      const active = trace.getActiveSpan();
      if (!active) throw new Error('provider execution lost active trace context');
      active.setAttribute('truyn.synthetic_request', true);
      active.setAttribute('truyn.request_id', requestId || '');
      active.setAttribute('truyn.need_id', need?.id || '');
      return {
        output: 'TRACE_CORRELATION_OK',
        metadata: { provider: 'production-trace-canary' }
      };
    }
  }, { providerId: provider.identity.nodeId });

  const host = new TruynAdapterHost({
    node: provider,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' })
  });
  await host.publishCapabilities();

  requestId = `request-${sourceSha.slice(0, 12)}`;
  await tracer.startActiveSpan('truyn.synthetic.request', async (span) => {
    traceId = span.spanContext().traceId;
    span.setAttribute('truyn.request_id', requestId);
    span.setAttribute('truyn.synthetic_request', true);
    try {
      const receipt = await requester.need('trace.acceptance', { synthetic: true, requestId });
      needId = receipt.needId;
      if (!needId || typeof needId !== 'string') throw new Error('synthetic NEED did not return needId');
      span.setAttribute('truyn.need_id', needId);

      const handled = await host.runOnce();
      if (handled.handled !== 1) throw new Error(`synthetic provider handled ${handled.handled} requests instead of 1`);

      const polled = await requester.poll();
      const resultEvent = (polled.events || []).find((event) => event.kind === 'RESULT');
      if (!resultEvent || resultEvent.verification?.ok !== true) throw new Error('synthetic RESULT was not verified end-to-end');
      if (resultEvent.envelope?.payload?.requestId !== needId) throw new Error('synthetic RESULT requestId did not match NEED id');
      if (resultEvent.envelope?.payload?.output !== 'TRACE_CORRELATION_OK') throw new Error('synthetic RESULT output mismatch');
      resultId = resultEvent.envelope?.id || null;
      if (!resultId || typeof resultId !== 'string') throw new Error('synthetic RESULT did not expose resultId');
      span.setAttribute('truyn.result_id', resultId);
      span.setAttribute('truyn.end_to_end', true);
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
} finally {
  await relay.close().catch(() => {});
}

if (!traceId || !/^[0-9a-f]{32}$/.test(traceId)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('synthetic request did not expose a valid traceId');
}
if (![requestId, needId, resultId].every((value) => typeof value === 'string' && value.length > 0)) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('synthetic request correlation ids are incomplete');
}

await telemetry.shutdown();

const proof = JSON.stringify({
  ok: true,
  span: 'truyn.provider.execute',
  correlationSpan: 'truyn.synthetic.request',
  traceId,
  requestId,
  needId,
  resultId,
  endToEnd: true,
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
process.stdout.write('TRUYN_TRACE_CORRELATION_SENT traceId=1 requestId=1 needId=1 resultId=1 end_to_end=1\n');
