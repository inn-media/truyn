import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CANARY = new URL('../runtime/trace-export-canary.js', import.meta.url);
const CONTRACT = new URL('../operations/production-trace-correlation.json', import.meta.url);
const WORKFLOW = new URL('../.github/workflows/production-trace-correlation.yml', import.meta.url);

test('production trace correlation contract requires one exact-main end-to-end trace', async () => {
  const contract = JSON.parse(await readFile(CONTRACT, 'utf8'));
  assert.equal(contract.schema, 'truyn.production-trace-correlation/v1');
  assert.equal(contract.environmentClass, 'production');
  assert.equal(contract.runtimeImageBinding, 'exact-main-source-sha');
  assert.equal(contract.syntheticRequest.protocolPath, 'signed-need-provider-result');
  assert.equal(contract.syntheticRequest.rootSpan, 'truyn.synthetic.request');
  assert.equal(contract.syntheticRequest.providerSpan, 'truyn.provider.execute');
  assert.deepEqual(contract.syntheticRequest.requiredCorrelationFields, ['traceId', 'requestId', 'needId', 'resultId']);
  assert.equal(contract.syntheticRequest.singleTraceRequired, true);
  assert.equal(contract.syntheticRequest.resultVerificationRequired, true);
  assert.equal(contract.syntheticRequest.endToEndRequired, true);
  assert.equal(contract.storageProof.exactTraceReadBackRequired, true);
  assert.equal(contract.storageProof.providerSpanInSameTraceRequired, true);
  assert.equal(contract.publicIngress, false);
});

test('production canary performs real signed NEED -> provider -> verified RESULT under one root trace', async () => {
  const canary = await readFile(CANARY, 'utf8');
  assert.match(canary, /createRelay/);
  assert.match(canary, /new TruynNode/);
  assert.match(canary, /await requester\.register/);
  assert.match(canary, /new TruynAdapterHost/);
  assert.match(canary, /await host\.publishCapabilities/);
  assert.match(canary, /truyn\.synthetic\.request/);
  assert.match(canary, /await requester\.need/);
  assert.match(canary, /await host\.runOnce/);
  assert.match(canary, /await requester\.poll/);
  assert.match(canary, /event\.kind === 'RESULT'/);
  assert.match(canary, /verification\?\.ok !== true/);
  assert.match(canary, /payload\?\.requestId !== needId/);
  assert.match(canary, /truyn\.request_id/);
  assert.match(canary, /truyn\.need_id/);
  assert.match(canary, /truyn\.result_id/);
  assert.match(canary, /truyn\.end_to_end/);
  assert.match(canary, /TRUYN_TRACE_CORRELATION_SENT traceId=1 requestId=1 needId=1 resultId=1 end_to_end=1/);
});

test('production correlation workflow is read-only and requires exact-main runtime plus backend trace proof', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /az containerapp show/);
  assert.match(workflow, /sourceSha/);
  assert.match(workflow, /TRUYN_TRACE_CORRELATION_SENT traceId=1 requestId=1 needId=1 resultId=1 end_to_end=1/);
  assert.match(workflow, /TRUYN_TRACE_EXPORT_PASS span=truyn\.provider\.execute runtime=production source=exact-main/);
  assert.match(workflow, /production-trace-correlation-evidence\.json/);
  assert.match(workflow, /endToEndObserved: true/);
  assert.match(workflow, /status: "PASS"/);
  assert.doesNotMatch(workflow, /az deployment group create/);
  assert.doesNotMatch(workflow, /az containerapp update/);
});
