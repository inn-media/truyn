import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startProductionObservability } from '../observability/bootstrap.js';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('production bootstrap serves real Prometheus metrics on the private listener', async () => {
  const port = await freePort();
  const telemetry = await startProductionObservability({
    role: 'test',
    env: { ...process.env, TRUYN_OBSERVABILITY: '1', TRUYN_METRICS_HOST: '127.0.0.1', TRUYN_METRICS_PORT: String(port), OTEL_SERVICE_NAME: 'truyn-observability-test' }
  });
  try {
    const { createObservabilityPlane } = await import('../observability/plane.js');
    const plane = createObservabilityPlane({ enabled: true, service: 'truyn-observability-test', role: 'test', stream: { write() {} } });
    plane.recordInfrastructure('bootstrap-test', new Error('synthetic_failure'));
    plane.setRuntimeReady('test', true);
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /truyn_infrastructure_errors_total/);
    assert.match(body, /truyn_runtime_ready/);
  } finally {
    await telemetry.shutdown();
  }
});
