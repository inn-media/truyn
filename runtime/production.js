import { startProductionObservability } from '../observability/bootstrap.js';
import { getObservabilityPlane } from '../observability/plane.js';
import { installProductionAlertSignals } from '../observability/alert-signals.js';

const role = process.env.TRUYN_ROLE || 'provider';
if (!['provider', 'relay'].includes(role)) {
  throw new Error(`Unsupported public TRUYN_ROLE: ${role}`);
}

const telemetry = await startProductionObservability({ role });
installProductionAlertSignals(getObservabilityPlane({
  enabled: process.env.TRUYN_OBSERVABILITY === '1',
  service: process.env.OTEL_SERVICE_NAME || `truyn-${role}`,
  role
}));
let shuttingDown = false;

async function shutdownRuntime() {
  if (shuttingDown) return;
  shuttingDown = true;
  await telemetry.shutdown().catch(() => {});
}

process.once('beforeExit', shutdownRuntime);
process.once('SIGTERM', shutdownRuntime);
process.once('SIGINT', shutdownRuntime);

try {
  await import('./service.js');
} catch (error) {
  await shutdownRuntime();
  throw error;
}
