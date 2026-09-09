import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-monitor-provider-registration.yml');

const read = () => readFile(workflowPath, 'utf8');

test('Microsoft.Monitor registration is exact-main only', async () => {
  const workflow = await read();
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*ops\//);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /id-token: write/);
});

test('provider registration is bounded to Microsoft.Monitor and verifies Registered', async () => {
  const workflow = await read();
  assert.match(workflow, /namespace='Microsoft\.Monitor'/);
  assert.match(workflow, /az provider register --namespace "\$namespace" --wait/);
  assert.match(workflow, /registrationState/);
  assert.match(workflow, /\[\[ "\$state" == 'Registered' \]\]/);
  assert.doesNotMatch(workflow, /Microsoft\.Storage|Microsoft\.Network|Microsoft\.Compute/);
});

test('public provider evidence is sanitized', async () => {
  const workflow = await read();
  const marker = 'schema: "truyn.production-monitor-provider-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'provider evidence block missing');
  const end = workflow.indexOf("' > production-monitor-provider-registration-evidence.json", start);
  assert.ok(end > start, 'provider evidence block terminator missing');
  const evidence = workflow.slice(start, end);
  assert.match(evidence, /providerNamespace: "Microsoft\.Monitor"/);
  assert.match(evidence, /registrationState: "Registered"/);
  for (const forbidden of ['AZURE_CLIENT_VALUE', 'AZURE_TENANT_VALUE', 'AZURE_SUBSCRIPTION_VALUE']) {
    assert.equal(evidence.includes(forbidden), false, `${forbidden} leaked into evidence`);
  }
});
