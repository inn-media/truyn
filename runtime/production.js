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

async function shutdownTelemetry() {
  if (shuttingDown) return;
  shuttingDown = true;
  await telemetry.shutdown().catch(() => {});
}

process.once('beforeExit', shutdownTelemetry);
process.once('SIGTERM', shutdownTelemetry);
process.once('SIGINT', shutdownTelemetry);

try {
  await import('./service.js');
} catch (error) {
  await shutdownTelemetry();
  throw error;
}
