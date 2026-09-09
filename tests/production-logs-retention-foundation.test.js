import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-logs-retention.yml');

test('Sprint 16 reapplies log retention when production foundation changes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const pushStart = workflow.indexOf('  push:');
  const permissionsStart = workflow.indexOf('\npermissions:', pushStart);
  assert.ok(pushStart >= 0 && permissionsStart > pushStart);
  const pushBlock = workflow.slice(pushStart, permissionsStart);
  assert.match(pushBlock, /infra\/production-dr\/\*\*/);
  assert.match(pushBlock, /\.github\/workflows\/production-dr-foundation\.yml/);
});

test('Sprint 16 scopes retention backends to the selected production foundation', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /\$\{GITHUB_REPOSITORY\}:\$\{DEPLOYMENT_ID\}:\$\{selected_prefix\}:logs-retention/);
  assert.doesNotMatch(workflow, /\$\{GITHUB_REPOSITORY\}:\$\{DEPLOYMENT_ID\}:logs-retention/);
  assert.match(workflow, /-n "\$selected_prefix"/);
});
