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
    throw new Error('TRUYN authority role requires the proprietary TRUYN Platform runtime');
  }
  if (role === 'relay' && process.env.TRUYN_AUTHORITY_URL) {
    throw new Error('managed relay authority requires the TRUYN Platform runtime adapter');
  }
  await import('./service.js');
} catch (error) {
  await shutdownRuntime();
  throw error;
}
