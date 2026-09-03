import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createObservabilityPlane } from '../observability/plane.js';
import { installProductionAlertSignals } from '../observability/alert-signals.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const at = (relative) => path.join(ROOT, relative);

test('production alert signals install before runtime service import', async () => {
  const production = await readFile(at('runtime/production.js'), 'utf8');
  assert.match(production, /installProductionAlertSignals/);
  assert.ok(production.indexOf('installProductionAlertSignals') < production.indexOf("import('./service.js')"));
});

test('alert signal layer exposes real service-failure metrics without request identity labels', async () => {
  const source = await readFile(at('observability/alert-signals.js'), 'utf8');
  for (const metric of [
    'truyn_websocket_disconnects',
    'truyn_websocket_session_duration_seconds',
    'truyn_result_timeouts',
    'truyn_billing_ambiguity_events',
    'truyn_artifact_store_failures',
    'truyn_provider_service_events',
    'truyn_network_recovery_events',
    'truyn_network_recovery_duration_seconds'
  ]) assert.ok(source.includes(metric), `missing ${metric}`);
  assert.match(source, /lifetime_class/);
  assert.match(source, /res\.statusCode !== 504/);
  assert.match(source, /BILLING_AMBIGUITY_REASONS/);
  assert.match(source, /ARTIFACT_FAILURE/);
  assert.match(source, /TRUYN_PROVIDER_BILLING_MODE/);
  assert.match(source, /'byok'/);
  assert.match(source, /'first_party'/);
  assert.doesNotMatch(source, /\.add\([^\n]*requestId/);
  assert.doesNotMatch(source, /\.add\([^\n]*needId/);
  assert.doesNotMatch(source, /\.add\([^\n]*nodeId/);
  assert.doesNotMatch(source, /\.add\([^\n]*providerId/);
});

test('alert signal wrapper preserves fail-closed billing semantics and adds convergence hook', () => {
  const plane = createObservabilityPlane({ enabled: true, service: 'truyn-alert-test', role: 'test', stream: { write() {} } });
  installProductionAlertSignals(plane);
  const policy = {
    mode: 'subscription',
    authorize() { return { ok: false, reason: 'entitlement_resolver_unavailable' }; }
  };
  plane.instrumentBillingPolicy(policy, { providerId: 'provider-1' });
  const decision = policy.authorize({ id: 'need-1', from: 'node-1' });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'entitlement_resolver_unavailable');
  assert.equal(typeof plane.recordNetworkConvergence, 'function');
  assert.doesNotThrow(() => plane.recordNetworkConvergence(121, { operation: 'dht-heal' }));
});

test('rolling 28-day error-budget rules cover independent service SLOs and lane semantics', async () => {
  const rules = await readFile(at('observability/prometheus/error-budget-rules.yml'), 'utf8');
  assert.match(rules, /\[28d\]/);
  assert.match(rules, /truyn:slo_error_budget_consumed:ratio/);
  assert.match(rules, /truyn:slo_error_budget_remaining:ratio/);
  assert.match(rules, /truyn:slo_error_budget_breached/);
  for (const slo of ['SLO-HTTP-1', 'SLO-AUTH-1', 'SLO-DISPATCH-1', 'SLO-RESULT-1', 'SLO-PROVIDER-1', 'SLO-DHT-1', 'SLO-DHT-RECOVERY-1']) {
    assert.ok(rules.includes(slo), `missing error budget for ${slo}`);
  }
  assert.match(rules, /truyn_provider_service_events_total\{lane="first_party"/);
  assert.match(rules, /truyn_network_recovery_events_total/);
  assert.ok(rules.includes('0.0005'));
  assert.ok(rules.includes('0.001'));
  assert.ok(rules.includes('0.01'));
});

test('service alerts use multi-window paging and cover the required failure classes', async () => {
  const rules = await readFile(at('observability/prometheus/slo-alerts.yml'), 'utf8');
  for (const alert of [
    'TruynRelayHttpFastBurn',
    'TruynRelayHttpSustainedBurn',
    'TruynRelayHttpSlowBurn',
    'TruynPublicAvailabilityProbeFastBurn',
    'TruynRelay5xxFastBurn',
    'TruynWebSocketDisconnectStorm',
    'TruynDispatchFastBurn',
    'TruynDispatchSustainedBurn',
    'TruynResultDeliveryFastBurn',
    'TruynResultTimeoutFastBurn',
    'TruynDhtRoutingSustainedBurn',
    'TruynDhtRecoverySustainedBurn',
    'TruynDhtStaleSelectionDegradation',
    'TruynProviderExecutionFastBurn',
    'TruynAuthorizationDenyAnomaly',
    'TruynBillingAmbiguity',
    'TruynArtifactStoreFailures',
    'TruynOriginBypassProbeFailure',
    'TruynOriginBypassProbeMissing',
    'TruynErrorBudgetBreached'
  ]) assert.ok(rules.includes(`alert: ${alert}`), `missing ${alert}`);

  for (const marker of ['[1h]', '[5m]', '[6h]', '[30m]', '[24h]', '[2h]', '>= 14.4', '>= 6', '>= 3']) {
    assert.ok(rules.includes(marker), `missing multi-window marker ${marker}`);
  }
  assert.match(rules, /truyn_provider_service_events_total\{lane="first_party"/);
  assert.match(rules, /slo: SLO-DHT-RECOVERY-1/);
  assert.match(rules, /zero_budget: "true"/);
  assert.match(rules, /job="truyn-origin-bypass"/);
  assert.match(rules, /job="truyn-relay-public"/);
});
