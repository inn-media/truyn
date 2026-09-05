import { startProductionObservability } from '../observability/bootstrap.js';
import { getObservabilityPlane } from '../observability/plane.js';
import { installProductionAlertSignals } from '../observability/alert-signals.js';

const role = process.env.TRUYN_ROLE || 'provider';
const telemetry = await startProductionObservability({ role });
installProductionAlertSignals(getObservabilityPlane({
  enabled: process.env.TRUYN_OBSERVABILITY === '1',
  service: process.env.OTEL_SERVICE_NAME || `truyn-${role}`,
  role
}));
let shuttingDown = false;
let roleRuntime = null;

async function shutdownRuntime() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (typeof roleRuntime?.stop === 'function') await roleRuntime.stop();
    if (typeof roleRuntime?.close === 'function') await roleRuntime.close();
  } catch {}
  await telemetry.shutdown().catch(() => {});
}

process.once('beforeExit', shutdownRuntime);
process.once('SIGTERM', shutdownRuntime);
process.once('SIGINT', shutdownRuntime);

try {
  if (role === 'authority') {
    const { createAuthorityServiceFromEnv } = await import('./authority-service.js');
    const service = createAuthorityServiceFromEnv(process.env);
    roleRuntime = service;
    await service.listen({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 8080) });
    process.stdout.write(`${JSON.stringify({ ok: true, role: 'authority', ready: true })}\n`);
  } else {
    if (role === 'relay' && process.env.TRUYN_AUTHORITY_URL) {
      const { initializeRelayAuthorityFromEnv } = await import('./relay-authority-runtime.js');
      roleRuntime = await initializeRelayAuthorityFromEnv(process.env);
      process.stdout.write(`${JSON.stringify({ ok: true, role: 'relay', authority: 'managed', authorityRevision: roleRuntime.status().revision })}\n`);
    }
    await import('./service.js');
  }
} catch (error) {
  await shutdownRuntime();
  throw error;
}
