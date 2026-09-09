import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

const CONTRACT = new URL('../operations/production-trace-correlation.json', import.meta.url);
const CANARY = new URL('../runtime/trace-export-canary.js', import.meta.url);
const WORKFLOW = new URL('../.github/workflows/production-trace-correlation.yml', import.meta.url);

test('Sprint 11 synthetic request preserves NEED/request and signed RESULT correlation', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  const provider = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register({ name: 'trace-correlation-test-requester' });

  const host = new TruynAdapterHost({
    node: provider,
    adapter: createFunctionAdapter({
      name: 'trace-correlation-test-provider',
      capabilities: ['trace.correlation.synthetic'],
      async execute({ input }) {
        return { output: input, metadata: { proof: 'trace-correlation' } };
      }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' })
  });

  await host.publishCapabilities();
  const receipt = await requester.need('trace.correlation.synthetic', 'TRACE_CORRELATION_OK');
  assert.equal(typeof receipt.needId, 'string');

  const requestId = receipt.needId;
  const needId = receipt.needId;
  assert.equal(requestId, needId);

  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);

  const polled = await requester.poll();
  const resultEvent = polled.events.find((event) => event.kind === 'RESULT' && event.envelope?.payload?.requestId === requestId);
  assert.ok(resultEvent);
  assert.equal(resultEvent.verification?.ok, true);
  assert.equal(resultEvent.envelope.payload.output, 'TRACE_CORRELATION_OK');
  assert.equal(typeof resultEvent.envelope.id, 'string');
  assert.ok(resultEvent.envelope.id.length > 0);
});

test('Sprint 11 production contract requires one readable trace with all four correlation fields', async () => {
  const contract = JSON.parse(await readFile(CONTRACT, 'utf8'));
  assert.equal(contract.schema, 'truyn.production-trace-correlation/v1');
  assert.equal(contract.correlationId, 'prod-trace-correlation-01');
  assert.equal(contract.deploymentId, 'dc4518de-d1bf-4fce-b351-e43d7c152999');
  assert.equal(contract.environmentClass, 'production');
  assert.equal(contract.requestClass, 'signed-synthetic-need-result');
  assert.deepEqual(contract.path, ['NEED', 'provider.execute', 'RESULT']);
  for (const field of ['traceId', 'requestId', 'needId', 'resultId']) assert.equal(contract.fields[field].required, true);
  assert.equal(contract.invariants.oneTrace, true);
  assert.equal(contract.invariants.requestIdEqualsNeedId, true);
  assert.equal(contract.invariants.signedNeed, true);
  assert.equal(contract.invariants.signedResult, true);
  assert.equal(contract.invariants.providerSpan, 'truyn.provider.execute');
  assert.equal(contract.invariants.correlationSpan, 'truyn.trace.correlation.synthetic');
  assert.equal(contract.invariants.exactTraceReadBackRequired, true);
  assert.equal(contract.invariants.sourceShaBindingRequired, true);
  assert.equal(contract.invariants.publicEndpoint, false);
  assert.match(contract.acceptance.marker, /TRUYN_TRACE_CORRELATION_PASS/);
});

test('production trace canary executes the signed end-to-end path and proves Tempo read-back', async () => {
  const canary = await readFile(CANARY, 'utf8');
  assert.match(canary, /createRelay/);
  assert.match(canary, /new TruynNode/);
  assert.match(canary, /new TruynAdapterHost/);
  assert.match(canary, /requester\.need\(correlationCapability/);
  assert.match(canary, /host\.runOnce\(\)/);
  assert.match(canary, /requester\.poll\(\)/);
  assert.match(canary, /resultEvent\.verification\?\.ok !== true/);
  assert.match(canary, /truyn\.trace\.correlation\.synthetic/);
  assert.match(canary, /truyn\.request_id/);
  assert.match(canary, /truyn\.need_id/);
  assert.match(canary, /truyn\.result_id/);
  assert.match(canary, /api\/v2\/traces/);
  assert.match(canary, /traceContainsCorrelation/);
  assert.match(canary, /truyn\.provider\.execute/);
  assert.match(canary, /TRUYN_TRACE_CORRELATION_PASS path=NEED-provider-RESULT fields=traceId,requestId,needId,resultId source=exact-main/);
  assert.match(canary, /server\.listen\(9466, '127\.0\.0\.1'/);
  assert.doesNotMatch(canary, /server\.listen\(9466, '0\.0\.0\.0'/);
});

test('Sprint 11 workflow consumes only a successful exact-main backend deployment and emits sanitized evidence', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read\n\s+id-token: write/);
  assert.doesNotMatch(workflow, /workflow_run:/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run/);
  assert.match(workflow, /git fetch --no-tags --depth=1 origin main/);
  assert.match(workflow, /main moved before Sprint 11 proof/);
  assert.match(workflow, /Require successful exact-SHA Production Trace Backend/);
  assert.match(workflow, /actions\/workflows\/production-trace-backend\.yml\/runs/);
  assert.match(workflow, /select\(\.head_sha == \$sha\)/);
  assert.match(workflow, /Exact-SHA Production Trace Backend did not succeed/);
  assert.match(workflow, /runtime-trace-canary/);
  assert.match(workflow, /TRUYN_TRACE_CORRELATION_PASS path=NEED-provider-RESULT fields=traceId,requestId,needId,resultId source=exact-main/);
  assert.match(workflow, /requestIdEqualsNeedId: true/);
  assert.match(workflow, /exactTraceReadBackObserved: true/);
  assert.match(workflow, /production-trace-correlation-evidence\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /TRACE_APP.*production-trace-correlation-evidence\.json/);
  assert.doesNotMatch(workflow, /RESOURCE_GROUP.*production-trace-correlation-evidence\.json/);
});
