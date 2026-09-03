import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';

const IDENTITY_FIELDS = new Set(['providerId', 'nodeId', 'sessionId']);
const CORRELATION_FIELDS = ['requestId', 'needId', 'providerId', 'nodeId', 'sessionId', 'traceId', 'resultId', 'errorClass'];
const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|private.?key|api.?key|credential|edge.?proof|origin.?proof|prompt|input|output|payload|content)/i;
const MAX_VALUE_CHARS = 512;
const WRAPPED = Symbol.for('io.truyn.observability.wrapped');

let singleton = null;

export function hashSafeIdentity(value) {
  if (value === null || value === undefined || value === '') return null;
  const digest = createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
  return `sha256:${digest}`;
}

function boundedScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  const string = String(value);
  return string.length <= MAX_VALUE_CHARS ? string : `${string.slice(0, MAX_VALUE_CHARS)}…`;
}

function safeFields(fields = {}) {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (CORRELATION_FIELDS.includes(key) || SENSITIVE_KEY.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result[key] = boundedScalar(value);
  }
  return result;
}

export function classifyError(error, status = null) {
  const code = String(error?.code || error?.body?.error || error?.message || '').toLowerCase();
  const numericStatus = Number(status ?? error?.status ?? error?.httpStatus);
  if (numericStatus === 401 || numericStatus === 403 || /auth|forbidden|denied|identity|signature|replay/.test(code)) return 'authorization';
  if (/billing|entitlement|quota|credit|payment/.test(code)) return 'billing';
  if (numericStatus === 408 || numericStatus === 504 || /timeout|expired/.test(code)) return 'timeout';
  if (numericStatus === 413 || numericStatus === 429 || numericStatus === 503 && /capacity|backpressure/.test(code)) return 'capacity';
  if (/protocol|version|json|frame|envelope|correlation|mismatch/.test(code)) return 'protocol';
  if (/provider|upstream|model/.test(code)) return 'upstream';
  if (numericStatus >= 500) return 'internal';
  return code ? 'application' : null;
}

export function correlationModel(fields = {}, explicitTraceId = null) {
  const activeTraceId = explicitTraceId || trace.getActiveSpan()?.spanContext()?.traceId || null;
  const model = {};
  for (const key of CORRELATION_FIELDS) {
    let value = key === 'traceId' ? (fields.traceId || activeTraceId) : fields[key];
    if (IDENTITY_FIELDS.has(key)) value = hashSafeIdentity(value);
    model[key] = value === undefined || value === '' ? null : boundedScalar(value);
  }
  return model;
}

export function structuredLogRecord(level, event, fields = {}, { service = 'truyn', role = 'unknown', traceId = null, now = new Date() } = {}) {
  return {
    timestamp: now.toISOString(),
    level,
    event,
    service,
    role,
    ...correlationModel(fields, traceId),
    ...safeFields(fields)
  };
}

export function normalizeRoute(pathname = '/') {
  const path = String(pathname || '/').split('?')[0];
  if (/^\/v1\/nodes\/[^/]+$/.test(path)) return '/v1/nodes/:nodeId';
  if (/^\/v1\/contexts\/[^/]+\/[^/]+$/.test(path)) {
    const action = path.split('/').at(-1);
    return `/v1/contexts/:cid/${action}`;
  }
  if (/^\/v1\/contexts\/[^/]+$/.test(path)) return '/v1/contexts/:cid';
  if (/^\/v1\/fast\/requests\/[^/]+$/.test(path)) return '/v1/fast/requests/:requestId';
  if (/^\/v1\/fast\/chains\/[^/]+\/trace$/.test(path)) return '/v1/fast/chains/:chainId/trace';
  return path.length <= 160 ? path : '/other';
}

function requestCorrelation(req) {
  const authorization = String(req.headers.authorization || '');
  const bearerSession = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  return {
    requestId: req.headers['x-truyn-request-id'] || req.headers['x-request-id'] || null,
    needId: req.headers['x-truyn-need-id'] || null,
    providerId: req.headers['x-truyn-provider-id'] || null,
    nodeId: req.headers['x-truyn-node-id'] || null,
    sessionId: req.headers['x-truyn-session-id'] || bearerSession,
    resultId: req.headers['x-truyn-result-id'] || null
  };
}

function statusClass(status) {
  return `${Math.floor(Number(status || 0) / 100)}xx`;
}

function httpOutcome(status, route) {
  if (status >= 500 || status === 429) return 'failure';
  if (status === 401 || status === 403) return 'denied';
  if ((route === '/v1/needs' || route === '/v1/fast/needs') && status === 404) return 'no_provider';
  if (status >= 400) return 'rejected';
  return 'success';
}

function isNeedRoute(route) {
  return route === '/v1/needs' || route === '/v1/fast/needs' || route === '/v1/fast/chains';
}

function isResultRoute(route) {
  return route === '/v1/results' || route === '/v1/fast/results';
}

function semanticOperation(route) {
  if (route === '/v1/contexts/:cid/retrieve') return 'retrieve';
  if (route === '/v1/contexts/:cid/select') return 'select';
  if (route === '/v1/contexts/:cid/delta') return 'delta';
  return null;
}

function externalProtocol(surface) {
  if (surface === 'a2a') return 'a2a';
  if (surface === 'mcp') return 'mcp';
  return null;
}

export function createObservabilityPlane({ enabled = process.env.TRUYN_OBSERVABILITY === '1', service = 'truyn', role = process.env.TRUYN_ROLE || 'unknown', stream = process.stdout } = {}) {
  const meter = metrics.getMeter('io.truyn.production-observability', '1');
  const tracer = trace.getTracer('io.truyn.production-observability', '1');

  const httpRequests = meter.createCounter('truyn_http_requests', { description: 'TRUYN HTTP requests by surface and outcome' });
  const httpDuration = meter.createHistogram('truyn_http_request_duration_seconds', { description: 'TRUYN HTTP request latency', unit: 's' });
  const wsConnections = meter.createCounter('truyn_websocket_connections', { description: 'TRUYN WebSocket upgrade attempts' });
  const authenticatedRequests = meter.createCounter('truyn_authenticated_requests', { description: 'Authenticated TRUYN request outcomes' });
  const dispatchAttempts = meter.createCounter('truyn_dispatch_attempts', { description: 'NEED to provider dispatch outcomes' });
  const resultDelivery = meter.createCounter('truyn_result_delivery', { description: 'RESULT delivery outcomes' });
  const providerExecutions = meter.createCounter('truyn_provider_executions', { description: 'Provider runtime execution outcomes' });
  const providerDuration = meter.createHistogram('truyn_provider_execution_duration_seconds', { description: 'Provider runtime execution latency', unit: 's' });
  const authDecisions = meter.createCounter('truyn_authorization_decisions', { description: 'Authorization decisions' });
  const billingDecisions = meter.createCounter('truyn_billing_decisions', { description: 'Billing and entitlement decisions' });
  const semanticOperations = meter.createCounter('truyn_semantic_operations', { description: 'Semantic retrieval operations' });
  const semanticDuration = meter.createHistogram('truyn_semantic_operation_duration_seconds', { description: 'Semantic retrieval operation latency', unit: 's' });
  const externalRequests = meter.createCounter('truyn_external_protocol_requests', { description: 'External A2A and MCP request outcomes' });
  const networkRouting = meter.createCounter('truyn_network_routing_operations', { description: 'Network and DHT routing outcomes' });
  const staleSelections = meter.createCounter('truyn_network_stale_selections', { description: 'Stale route/provider selections' });
  const infrastructureErrors = meter.createCounter('truyn_infrastructure_errors', { description: 'Infrastructure errors by component and class' });

  const gauges = new Map();
  const readyByRole = new Map();

  function observableGauge(name, description, callback) {
    const gauge = meter.createObservableGauge(name, { description });
    gauge.addCallback(callback);
    return gauge;
  }

  observableGauge('truyn_runtime_ready', 'Runtime ready state by role', (observable) => {
    for (const [runtimeRole, value] of readyByRole) observable.observe(value ? 1 : 0, { role: runtimeRole });
  });
  observableGauge('truyn_process_uptime_seconds', 'Process uptime', (observable) => observable.observe(process.uptime()));
  observableGauge('truyn_process_resident_memory_bytes', 'Resident memory', (observable) => observable.observe(process.memoryUsage().rss));
  observableGauge('truyn_process_heap_used_bytes', 'Heap memory used', (observable) => observable.observe(process.memoryUsage().heapUsed));

  function log(level, event, fields = {}) {
    if (!enabled) return null;
    const record = structuredLogRecord(level, event, fields, { service, role });
    stream.write(`${JSON.stringify(record)}\n`);
    return record;
  }

  function recordHttp({ surface, method, route, status, durationSeconds, hasAuthorization, correlation = {}, traceId = null }) {
    if (!enabled) return;
    const outcome = httpOutcome(status, route);
    const errorClass = outcome === 'failure' ? classifyError(null, status) : (outcome === 'denied' ? 'authorization' : null);
    const attrs = { surface, method, route, status_class: statusClass(status), outcome };
    httpRequests.add(1, attrs);
    httpDuration.record(durationSeconds, { surface, method, route, outcome });
    if (hasAuthorization) {
      authenticatedRequests.add(1, { surface, outcome, error_class: errorClass || 'none' });
      if (outcome === 'success') authDecisions.add(1, { surface, decision: 'allow', error_class: 'none' });
      else if (outcome === 'denied') authDecisions.add(1, { surface, decision: 'deny', error_class: 'authorization' });
    }
    if (isNeedRoute(route)) {
      dispatchAttempts.add(1, { outcome, error_class: errorClass || 'none' });
      networkRouting.add(1, { operation: 'provider-dispatch', outcome, error_class: errorClass || 'none' });
    }
    if (isResultRoute(route)) resultDelivery.add(1, { outcome, error_class: errorClass || 'none' });
    const semantic = semanticOperation(route);
    if (semantic) {
      semanticOperations.add(1, { operation: semantic, outcome, error_class: errorClass || 'none' });
      semanticDuration.record(durationSeconds, { operation: semantic, outcome });
    }
    const protocol = externalProtocol(surface);
    if (protocol) externalRequests.add(1, { protocol, method, outcome, error_class: errorClass || 'none' });
    log(outcome === 'failure' ? 'error' : outcome === 'denied' ? 'warn' : 'info', 'http.request.complete', {
      ...correlation,
      traceId,
      errorClass,
      surface,
      method,
      route,
      status,
      outcome,
      durationMs: Number((durationSeconds * 1000).toFixed(3))
    });
  }

  function observeHttpServer(server, { surface = role === 'relay' ? 'relay' : 'provider-runtime' } = {}) {
    if (!enabled || !server || server[WRAPPED]) return server;
    server[WRAPPED] = true;
    server.prependListener('request', (req, res) => {
      const startedAt = performance.now();
      const activeTraceId = trace.getActiveSpan()?.spanContext()?.traceId || null;
      const correlation = requestCorrelation(req);
      const route = normalizeRoute(new URL(req.url || '/', 'http://truyn.local').pathname);
      const method = String(req.method || 'UNKNOWN').toUpperCase();
      const hasAuthorization = Boolean(req.headers.authorization);
      res.once('finish', () => recordHttp({
        surface,
        method,
        route,
        status: res.statusCode,
        durationSeconds: Math.max(0, performance.now() - startedAt) / 1000,
        hasAuthorization,
        correlation,
        traceId: activeTraceId
      }));
    });
    server.prependListener('upgrade', (req) => {
      const route = normalizeRoute(new URL(req.url || '/', 'http://truyn.local').pathname);
      wsConnections.add(1, { surface, route, outcome: 'attempt' });
      log('info', 'websocket.upgrade.attempt', { ...requestCorrelation(req), surface, route });
    });
    return server;
  }

  function bindRelayState(state) {
    if (!enabled || !state || gauges.has(state)) return;
    const terminal = new Set(['completed', 'cancelled', 'failed']);
    const bindings = [
      ['truyn_relay_nodes', 'Registered relay nodes', () => state.nodes?.size || 0],
      ['truyn_relay_offers', 'Relay offers', () => state.offers?.size || 0],
      ['truyn_relay_pending_requests', 'Pending relay requests', () => [...(state.requests?.values?.() || [])].filter((item) => !terminal.has(item.status)).length],
      ['truyn_relay_provider_sockets', 'Connected provider sockets', () => state.providerSockets?.size || 0],
      ['truyn_relay_active_chains', 'Active relay chains', () => [...(state.chains?.values?.() || [])].filter((item) => item.status === 'running').length],
      ['truyn_relay_contexts', 'Stored relay contexts', () => state.contexts?.size || 0]
    ];
    for (const [name, description, read] of bindings) observableGauge(name, description, (observable) => observable.observe(read()));
    gauges.set(state, true);
  }

  function setRuntimeReady(runtimeRole, ready) {
    readyByRole.set(runtimeRole, Boolean(ready));
  }

  function instrumentAccessPolicy(policy, { providerId = null } = {}) {
    if (!enabled || !policy || typeof policy.authorize !== 'function' || policy.authorize[WRAPPED]) return policy;
    const original = policy.authorize.bind(policy);
    const wrapped = (need, ...args) => {
      const result = original(need, ...args);
      const decision = result?.ok ? 'allow' : 'deny';
      authDecisions.add(1, { surface: 'provider-runtime', decision, error_class: decision === 'deny' ? 'authorization' : 'none' });
      log(decision === 'deny' ? 'warn' : 'info', 'authorization.decision', {
        requestId: need?.id || null,
        needId: need?.id || null,
        providerId,
        nodeId: need?.from || null,
        errorClass: decision === 'deny' ? 'authorization' : null,
        decision,
        accessMode: policy.mode || 'unknown'
      });
      return result;
    };
    wrapped[WRAPPED] = true;
    policy.authorize = wrapped;
    return policy;
  }

  function instrumentBillingPolicy(policy, { providerId = null } = {}) {
    if (!enabled || !policy || typeof policy.authorize !== 'function' || policy.authorize[WRAPPED]) return policy;
    const original = policy.authorize.bind(policy);
    const wrapped = (need, ...args) => {
      const result = original(need, ...args);
      const decision = result?.ok ? 'allow' : 'deny';
      billingDecisions.add(1, { surface: 'provider-runtime', decision, error_class: decision === 'deny' ? 'billing' : 'none' });
      log(decision === 'deny' ? 'warn' : 'info', 'billing.decision', {
        requestId: need?.id || null,
        needId: need?.id || null,
        providerId,
        nodeId: need?.from || null,
        errorClass: decision === 'deny' ? 'billing' : null,
        decision,
        billingMode: policy.mode || 'unknown'
      });
      return result;
    };
    wrapped[WRAPPED] = true;
    policy.authorize = wrapped;
    return policy;
  }

  function wrapProviderAdapter(adapter, { providerId = null } = {}) {
    if (!enabled || !adapter || typeof adapter.execute !== 'function' || adapter.execute[WRAPPED]) return adapter;
    const original = adapter.execute.bind(adapter);
    const wrapped = async (request) => {
      const need = request?.need || null;
      const capability = String(request?.capability || 'unknown').slice(0, 128);
      const correlation = {
        requestId: need?.id || null,
        needId: need?.id || null,
        providerId,
        nodeId: need?.from || null
      };
      const startedAt = performance.now();
      return tracer.startActiveSpan('truyn.provider.execute', {
        attributes: {
          'truyn.capability': capability,
          'truyn.need_id': String(need?.id || ''),
          'truyn.provider_id_hash': hashSafeIdentity(providerId) || '',
          'truyn.requester_node_id_hash': hashSafeIdentity(need?.from) || ''
        }
      }, async (span) => {
        log('info', 'provider.execution.start', { ...correlation, capability, adapter: adapter.name || 'unknown' });
        try {
          const result = await original(request);
          const failed = Boolean(result?.metadata?.failed);
          const errorClass = failed ? classifyError({ message: result?.metadata?.error || 'provider_failed' }) : null;
          const outcome = failed ? 'failure' : 'success';
          const durationSeconds = Math.max(0, performance.now() - startedAt) / 1000;
          providerExecutions.add(1, { adapter: adapter.name || 'unknown', capability, outcome, error_class: errorClass || 'none' });
          providerDuration.record(durationSeconds, { adapter: adapter.name || 'unknown', capability, outcome });
          if (failed) span.setStatus({ code: SpanStatusCode.ERROR, message: errorClass || 'provider_failed' });
          else span.setStatus({ code: SpanStatusCode.OK });
          log(failed ? 'error' : 'info', 'provider.execution.complete', {
            ...correlation,
            traceId: span.spanContext().traceId,
            errorClass,
            capability,
            adapter: adapter.name || 'unknown',
            outcome,
            durationMs: Number((durationSeconds * 1000).toFixed(3))
          });
          return result;
        } catch (error) {
          const errorClass = classifyError(error) || 'internal';
          const durationSeconds = Math.max(0, performance.now() - startedAt) / 1000;
          providerExecutions.add(1, { adapter: adapter.name || 'unknown', capability, outcome: 'failure', error_class: errorClass });
          providerDuration.record(durationSeconds, { adapter: adapter.name || 'unknown', capability, outcome: 'failure' });
          infrastructureErrors.add(1, { component: 'provider-runtime', error_class: errorClass });
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: errorClass });
          log('error', 'provider.execution.error', {
            ...correlation,
            traceId: span.spanContext().traceId,
            errorClass,
            capability,
            adapter: adapter.name || 'unknown',
            durationMs: Number((durationSeconds * 1000).toFixed(3))
          });
          throw error;
        } finally {
          span.end();
        }
      });
    };
    wrapped[WRAPPED] = true;
    adapter.execute = wrapped;
    return adapter;
  }

  function recordNetwork(operation, outcome, { errorClass = null, stale = false } = {}) {
    if (!enabled) return;
    networkRouting.add(1, { operation, outcome, error_class: errorClass || 'none' });
    if (stale) staleSelections.add(1, { kind: operation });
  }

  function recordInfrastructure(component, error) {
    if (!enabled) return;
    const errorClass = classifyError(error) || 'internal';
    infrastructureErrors.add(1, { component, error_class: errorClass });
    log('error', 'infrastructure.error', { component, errorClass });
  }

  return {
    enabled,
    service,
    role,
    log,
    observeHttpServer,
    bindRelayState,
    setRuntimeReady,
    instrumentAccessPolicy,
    instrumentBillingPolicy,
    wrapProviderAdapter,
    recordNetwork,
    recordInfrastructure
  };
}

export function getObservabilityPlane(options = {}) {
  if (!singleton) singleton = createObservabilityPlane(options);
  return singleton;
}
