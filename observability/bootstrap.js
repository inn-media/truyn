import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertPrivateMetricsHost(host) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('TRUYN metrics listener must bind to loopback; use a local collector/sidecar for remote export');
  }
  return host;
}

function traceEndpoint(env) {
  if (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;
  return `${String(env.OTEL_EXPORTER_OTLP_ENDPOINT).replace(/\/$/, '')}/v1/traces`;
}

export async function startProductionObservability({ env = process.env, role = env.TRUYN_ROLE || 'provider' } = {}) {
  if (env.TRUYN_OBSERVABILITY === '0') return { enabled: false, async shutdown() {} };

  const metricsHost = assertPrivateMetricsHost(env.TRUYN_METRICS_HOST || '127.0.0.1');
  const metricsPort = Number(env.TRUYN_METRICS_PORT || 9464);
  if (!Number.isInteger(metricsPort) || metricsPort < 1 || metricsPort > 65535) throw new Error('TRUYN_METRICS_PORT must be 1..65535');

  env.TRUYN_OBSERVABILITY = '1';
  const serviceName = env.OTEL_SERVICE_NAME || `truyn-${role}`;
  const endpoint = traceEndpoint(env);
  if (!endpoint && !process.env.OTEL_TRACES_EXPORTER) process.env.OTEL_TRACES_EXPORTER = 'none';
  const prometheus = new PrometheusExporter({ host: metricsHost, port: metricsPort, endpoint: '/metrics' });
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.version': env.TRUYN_VERSION || '0.1.0-dev',
    'deployment.environment.name': env.TRUYN_ENVIRONMENT || env.NODE_ENV || 'production',
    'truyn.role': role
  });

  const options = {
    resource,
    metricReaders: [prometheus],
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }
    })]
  };
  if (endpoint) options.traceExporter = new OTLPTraceExporter({ url: endpoint });

  const sdk = new NodeSDK(options);
  await sdk.start();
  return {
    enabled: true,
    serviceName,
    metricsHost,
    metricsPort,
    async shutdown() { await sdk.shutdown(); }
  };
}
