import { metrics } from '@opentelemetry/api';
import { normalizeRoute } from './plane.js';

const ALERT_WRAPPED = Symbol.for('io.truyn.observability.alert-signals.wrapped');
const SERVER_WRAPPED = Symbol.for('io.truyn.observability.alert-signals.server');
const BILLING_AMBIGUITY_REASONS = new Set([
  'entitlement_resolver_unavailable',
  'sponsored_usage_store_unavailable',
  'missing_access_policy'
]);
const ARTIFACT_FAILURE = /(artifact|object.?store|storage|\bgcs\b|blob|upload|download)/i;

function requestCorrelation(req) {
  return {
    requestId: req?.headers?.['x-truyn-request-id'] || req?.headers?.['x-request-id'] || null,
    needId: req?.headers?.['x-truyn-need-id'] || null,
    providerId: req?.headers?.['x-truyn-provider-id'] || null,
    nodeId: req?.headers?.['x-truyn-node-id'] || null,
    sessionId: req?.headers?.['x-truyn-session-id'] || null,
    resultId: req?.headers?.['x-truyn-result-id'] || null
  };
}

function normalizedRoute(req) {
  try {
    return normalizeRoute(new URL(req?.url || '/', 'http://truyn.local').pathname);
  } catch {
    return '/other';
  }
}

function artifactFailureDetail(value) {
  const text = String(value?.code || value?.message || value?.metadata?.error || value || '');
  return ARTIFACT_FAILURE.test(text) ? text : null;
}

function observeMaybePromise(value, observe) {
  if (value && typeof value.then === 'function') return value.then((resolved) => {
    observe(resolved);
    return resolved;
  });
  observe(value);
  return value;
}

function providerLane(options = {}) {
  if (options.lane === 'byok' || options.lane === 'first_party') return options.lane;
  return String(process.env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded').toLowerCase() === 'byok'
    ? 'byok'
    : 'first_party';
}

export function installProductionAlertSignals(plane) {
  if (!plane?.enabled || plane[ALERT_WRAPPED]) return plane;
  plane[ALERT_WRAPPED] = true;

  const meter = metrics.getMeter('io.truyn.production-alert-signals', '1');
  const websocketDisconnects = meter.createCounter('truyn_websocket_disconnects', {
    description: 'Closed WebSocket transports observed after an upgrade attempt'
  });
  const websocketSessionDuration = meter.createHistogram('truyn_websocket_session_duration_seconds', {
    description: 'Observed WebSocket transport lifetime after upgrade',
    unit: 's'
  });
  const resultTimeouts = meter.createCounter('truyn_result_timeouts', {
    description: 'RESULT wait or chain timeouts returned by the relay'
  });
  const billingAmbiguity = meter.createCounter('truyn_billing_ambiguity_events', {
    description: 'Fail-closed billing decisions caused by unavailable or ambiguous authority'
  });
  const artifactStoreFailures = meter.createCounter('truyn_artifact_store_failures', {
    description: 'Provider executions that fail in an artifact/object storage operation'
  });
  const providerServiceEvents = meter.createCounter('truyn_provider_service_events', {
    description: 'Provider execution outcomes separated into first-party and BYOK service lanes'
  });
  const networkRecoveryEvents = meter.createCounter('truyn_network_recovery_events', {
    description: 'Production network recovery/convergence events by outcome'
  });
  const networkRecoveryDuration = meter.createHistogram('truyn_network_recovery_duration_seconds', {
    description: 'Production network recovery/convergence duration',
    unit: 's'
  });

  const originalObserveHttpServer = plane.observeHttpServer.bind(plane);
  plane.observeHttpServer = (server, options = {}) => {
    const result = originalObserveHttpServer(server, options);
    if (!server || server[SERVER_WRAPPED]) return result;
    server[SERVER_WRAPPED] = true;
    const surface = options.surface || plane.role || 'unknown';

    server.prependListener('request', (req, res) => {
      const route = normalizedRoute(req);
      res.once('finish', () => {
        if (res.statusCode !== 504) return;
        if (route !== '/v1/fast/needs' && route !== '/v1/fast/chains') return;
        resultTimeouts.add(1, { surface, route });
        plane.log('error', 'result.timeout', {
          ...requestCorrelation(req),
          errorClass: 'timeout',
          surface,
          route,
          status: 504
        });
      });
    });

    server.prependListener('upgrade', (req, socket) => {
      const route = normalizedRoute(req);
      const openedAt = process.hrtime.bigint();
      socket?.once?.('close', () => {
        const lifetimeSeconds = Number(process.hrtime.bigint() - openedAt) / 1e9;
        const lifetimeClass = lifetimeSeconds < 30 ? 'short_lived' : 'established';
        websocketDisconnects.add(1, { surface, route, lifetime_class: lifetimeClass });
        websocketSessionDuration.record(lifetimeSeconds, { surface, route, lifetime_class: lifetimeClass });
        plane.log(lifetimeClass === 'short_lived' ? 'warn' : 'info', 'websocket.disconnect', {
          ...requestCorrelation(req),
          surface,
          route,
          lifetimeClass,
          durationMs: Number((lifetimeSeconds * 1000).toFixed(3))
        });
      });
    });
    return result;
  };

  const originalInstrumentBillingPolicy = plane.instrumentBillingPolicy.bind(plane);
  plane.instrumentBillingPolicy = (policy, options = {}) => {
    const instrumented = originalInstrumentBillingPolicy(policy, options);
    if (!instrumented || typeof instrumented.authorize !== 'function' || instrumented.authorize[ALERT_WRAPPED]) return instrumented;
    const originalAuthorize = instrumented.authorize.bind(instrumented);
    const wrappedAuthorize = (need, ...args) => observeMaybePromise(originalAuthorize(need, ...args), (decision) => {
      const reason = String(decision?.reason || '');
      if (!BILLING_AMBIGUITY_REASONS.has(reason)) return;
      billingAmbiguity.add(1, { mode: instrumented.mode || 'unknown', reason });
      plane.log('error', 'billing.ambiguity', {
        requestId: need?.id || null,
        needId: need?.id || null,
        providerId: options.providerId || null,
        nodeId: need?.from || null,
        errorClass: 'billing_ambiguity',
        billingMode: instrumented.mode || 'unknown',
        reason
      });
    });
    wrappedAuthorize[ALERT_WRAPPED] = true;
    instrumented.authorize = wrappedAuthorize;
    return instrumented;
  };

  const originalWrapProviderAdapter = plane.wrapProviderAdapter.bind(plane);
  plane.wrapProviderAdapter = (adapter, options = {}) => {
    const instrumented = originalWrapProviderAdapter(adapter, options);
    if (!instrumented || typeof instrumented.execute !== 'function' || instrumented.execute[ALERT_WRAPPED]) return instrumented;
    const originalExecute = instrumented.execute.bind(instrumented);
    const lane = providerLane(options);
    const wrappedExecute = async (request) => {
      try {
        const result = await originalExecute(request);
        const failed = Boolean(result?.metadata?.failed);
        providerServiceEvents.add(1, { adapter: instrumented.name || 'unknown', lane, outcome: failed ? 'failure' : 'success' });
        const detail = failed ? artifactFailureDetail(result?.metadata?.error || result) : null;
        if (detail) {
          artifactStoreFailures.add(1, { adapter: instrumented.name || 'unknown', lane, outcome: 'failure' });
          plane.log('error', 'artifact.store.failure', {
            requestId: request?.need?.id || null,
            needId: request?.need?.id || null,
            providerId: options.providerId || null,
            nodeId: request?.need?.from || null,
            errorClass: 'artifact_store',
            adapter: instrumented.name || 'unknown',
            providerLane: lane
          });
        }
        return result;
      } catch (error) {
        providerServiceEvents.add(1, { adapter: instrumented.name || 'unknown', lane, outcome: 'failure' });
        if (artifactFailureDetail(error)) {
          artifactStoreFailures.add(1, { adapter: instrumented.name || 'unknown', lane, outcome: 'failure' });
          plane.log('error', 'artifact.store.failure', {
            requestId: request?.need?.id || null,
            needId: request?.need?.id || null,
            providerId: options.providerId || null,
            nodeId: request?.need?.from || null,
            errorClass: 'artifact_store',
            adapter: instrumented.name || 'unknown',
            providerLane: lane
          });
        }
        throw error;
      }
    };
    wrappedExecute[ALERT_WRAPPED] = true;
    instrumented.execute = wrappedExecute;
    return instrumented;
  };

  plane.recordNetworkConvergence = (durationSeconds, { operation = 'dht-heal', success = Number(durationSeconds) <= 120, errorClass = null } = {}) => {
    if (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < 0) return;
    const outcome = success ? 'success' : 'failure';
    networkRecoveryEvents.add(1, { operation, outcome, error_class: errorClass || 'none' });
    networkRecoveryDuration.record(Number(durationSeconds), { operation, outcome });
    plane.log(success ? 'info' : 'error', 'network.convergence', {
      errorClass: errorClass || (success ? null : 'convergence'),
      operation,
      outcome,
      durationMs: Number((Number(durationSeconds) * 1000).toFixed(3))
    });
  };

  return plane;
}
