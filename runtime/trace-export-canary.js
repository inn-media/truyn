import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { trace } from '@opentelemetry/api';
import { startProductionObservability } from '../observability/bootstrap.js';
import { getObservabilityPlane } from '../observability/plane.js';

const role = 'provider';
const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const sourceSha = process.env.TRUYN_VERSION || '';
const tempoReadyUrl = 'http://127.0.0.1:3200/ready';
const tempoTraceBaseUrl = 'http://127.0.0.1:3200/api/v2/traces';
const correlationSpanName = 'truyn.trace.correlation.synthetic';
const providerSpanName = 'truyn.provider.execute';
const correlationCapability = 'trace.correlation.synthetic';

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

function spanAttribute(span, key) {
  const attributes = span?.attributes;
  if (Array.isArray(attributes)) {
    const attribute = attributes.find((item) => item?.key === key);
    const value = attribute?.value;
    if (!value || typeof value !== 'object') return null;
    return value.stringValue ?? value.string_value ?? value.intValue ?? value.int_value ?? value.boolValue ?? value.bool_value ?? null;
  }
  if (attributes && typeof attributes === 'object') {
    const value = attributes[key];
    if (value && typeof value === 'object') {
      return value.stringValue ?? value.string_value ?? value.intValue ?? value.int_value ?? value.boolValue ?? value.bool_value ?? null;
    }
    return value ?? null;
  }
  return null;
}

function findSpan(value, name) {
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value) && value.name === name) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findSpan(child, name);
    if (found) return found;
  }
  return null;
}

function traceContainsCorrelation(value, correlation) {
  const correlationSpan = findSpan(value, correlationSpanName);
  const providerSpan = findSpan(value, providerSpanName);
  if (!correlationSpan || !providerSpan) return false;
  return String(spanAttribute(correlationSpan, 'truyn.request_id') || '') === correlation.requestId
    && String(spanAttribute(correlationSpan, 'truyn.need_id') || '') === correlation.needId
    && String(spanAttribute(correlationSpan, 'truyn.result_id') || '') === correlation.resultId
    && String(spanAttribute(correlationSpan, 'truyn.source_sha') || '') === sourceSha;
}

async function waitForCorrelationReadBack(correlation) {
  for (let attempt = 1; attempt <= 180; attempt += 1) {
    try {
      const response = await fetch(`${tempoTraceBaseUrl}/${correlation.traceId}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000)
      });
      if (response.status === 200) {
        const body = await response.json();
        if (traceContainsCorrelation(body, correlation)) return;
      } else {
        await response.body?.cancel();
      }
    } catch {
      // Trace ingestion and block visibility are asynchronous; keep polling the private backend.
    }
    await delay(2_000);
  }
  throw new Error('end-to-end synthetic trace correlation was not readable from Tempo');
}

await waitForTempoReady();

const telemetry = await startProductionObservability({ role });
const observability = getObservabilityPlane({
  enabled: true,
  service: process.env.OTEL_SERVICE_NAME || 'truyn-provider-trace-canary',
  role
});

const [
  { createRelay },
  { TruynNode },
  { createIdentity },
  { createFunctionAdapter, TruynAdapterHost },
  { createProviderAccessPolicy }
] = await Promise.all([
  import('../network/relay/server.js'),
  import('../node/client.js'),
  import('../core/identity/index.js'),
  import('../adapters/sdk/index.js'),
  import('../core/security/provider-access.js')
]);

const relay = createRelay({ localDevelopmentMode: true });
observability.observeHttpServer(relay.server, { surface: 'relay' });
const relayUrl = await relay.listen({ host: '127.0.0.1', port: 0 });
const requester = new TruynNode({ relayUrl, identity: createIdentity() });
const provider = new TruynNode({ relayUrl, identity: createIdentity() });
await requester.register({ name: 'trace-correlation-requester' });

const adapter = observability.wrapProviderAdapter(createFunctionAdapter({
  name: 'trace-correlation-provider',
  capabilities: [correlationCapability],
  async execute({ input }) {
    return {
      output: String(input),
      metadata: { provider: 'trace-correlation-provider' }
    };
  }
}), { providerId: provider.identity.nodeId });

const host = new TruynAdapterHost({
  node: provider,
  adapter,
  accessPolicy: createProviderAccessPolicy({ mode: 'public' })
});
await host.publishCapabilities();

const tracer = trace.getTracer('io.truyn.production-trace-correlation', '1');
let correlation = null;

await tracer.startActiveSpan(correlationSpanName, async (span) => {
  try {
    const traceId = span.spanContext().traceId;
    if (!/^[0-9a-f]{32}$/.test(traceId)) throw new Error('synthetic correlation span did not expose a valid trace id');

    const receipt = await requester.need(correlationCapability, 'TRACE_CORRELATION_OK');
    const needId = receipt?.needId;
    const requestId = needId;
    if (!needId || typeof needId !== 'string') throw new Error('synthetic NEED did not expose needId');

    span.setAttribute('truyn.request_id', requestId);
    span.setAttribute('truyn.need_id', needId);
    span.setAttribute('truyn.source_sha', sourceSha);

    const handled = await host.runOnce();
    if (handled?.handled !== 1) throw new Error('synthetic provider did not handle exactly one NEED');

    const polled = await requester.poll();
    const resultEvent = (polled?.events || []).find((event) => event?.kind === 'RESULT' && event?.envelope?.payload?.requestId === requestId);
    if (!resultEvent) throw new Error('synthetic requester did not receive matching RESULT');
    if (resultEvent.verification?.ok !== true) throw new Error('synthetic RESULT signature verification failed');
    if (resultEvent.envelope?.payload?.output !== 'TRACE_CORRELATION_OK') throw new Error('synthetic RESULT output mismatch');

    const resultId = resultEvent.envelope?.id;
    if (!resultId || typeof resultId !== 'string') throw new Error('synthetic RESULT did not expose resultId');

    span.setAttribute('truyn.result_id', resultId);
    span.setAttribute('truyn.path', 'NEED-provider-RESULT');
    correlation = { traceId, requestId, needId, resultId };
  } finally {
    span.end();
  }
});

await relay.close();

if (!correlation) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('synthetic trace correlation did not complete');
}
if (correlation.requestId !== correlation.needId) {
  await telemetry.shutdown().catch(() => {});
  throw new Error('TRUYN legacy requestId must equal the signed NEED id');
}

const proof = JSON.stringify({
  ok: true,
  span: providerSpanName,
  correlationSpan: correlationSpanName,
  traceId: correlation.traceId,
  requestId: correlation.requestId,
  needId: correlation.needId,
  resultId: correlation.resultId,
  path: 'NEED-provider-RESULT',
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
process.stdout.write(`TRUYN_RUNTIME_TRACE_EXPORT_SENT span=${providerSpanName} traceId=${correlation.traceId} sourceSha=${sourceSha}\n`);
process.stdout.write(`TRUYN_TRACE_CORRELATION_IDS traceId=${correlation.traceId} requestId=${correlation.requestId} needId=${correlation.needId} resultId=${correlation.resultId} sourceSha=${sourceSha}\n`);

try {
  await waitForCorrelationReadBack(correlation);
} catch (error) {
  await telemetry.shutdown().catch(() => {});
  throw error;
}

process.stdout.write('TRUYN_TRACE_CORRELATION_PASS path=NEED-provider-RESULT fields=traceId,requestId,needId,resultId source=exact-main\n');
