import { structuredLogRecord } from '../observability/plane.js';

const deploymentId = process.env.TRUYN_DEPLOYMENT_ID || 'deployment-unset';
const sourceSha = process.env.TRUYN_VERSION || 'source-unset';
const traceId = '12121212121212121212121212121212';

export function buildCanaryRecord(streamProbe, now = new Date()) {
  return structuredLogRecord('info', 'structured.log.canary', {
    requestId: 's12-request-01',
    needId: 's12-need-01',
    resultId: 's12-result-01',
    traceId,
    streamProbe,
    canaryField: 'field-value',
    environment: 'production',
    deployment: deploymentId,
    sourceSha
  }, {
    service: 'truyn-relay',
    role: 'relay',
    traceId,
    now
  });
}

export function emitCanary() {
  process.stdout.write(`${JSON.stringify(buildCanaryRecord('stdout'))}\n`);
  process.stderr.write(`${JSON.stringify(buildCanaryRecord('stderr'))}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  emitCanary();
  setInterval(emitCanary, 15_000);
}
