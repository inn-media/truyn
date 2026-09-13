import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

async function json(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));
}

async function exists(relative) {
  try { await stat(path.join(ROOT, relative)); return true; } catch { return false; }
}

test('open/private boundary is explicit and D-200 remains OPEN', async () => {
  const policy = await json('config/open-core-boundary.json');
  assert.equal(policy.publicRepository, 'inn-media/truyn');
  assert.equal(policy.privateRepository, 'inn-media/truyn-platform');
  assert.equal(policy.d200.owner, 'OPEN');
  assert.match(policy.dependencyRule, /released\/versioned artifact/);
  assert.equal(policy.defaultForAmbiguousWork, 'STOP_AND_CLASSIFY');
  assert.ok(policy.classifications.OPEN.length > 0);
  assert.ok(policy.classifications.SHARED_CONTRACT.length > 0);
  assert.ok(policy.classifications.PRIVATE_TARGET.length > 0);
});

test('legacy managed implementation is a bounded migration exception, not an expandable public surface', async () => {
  const policy = await json('config/open-core-boundary.json');
  const exceptions = new Set(policy.migrationExceptions);
  const requiredLegacy = [
    'core/security/managed-production-authority.js',
    'core/security/cosmos-authority-checkpoint.js',
    'runtime/authority-service.js',
    'tests/managed-authority-runtime.test.js',
    'tests/managed-authority-readiness-regressions.test.js',
    'docs/operations/MANAGED_AUTHORITY_RUNTIME.md'
  ];
  for (const relative of requiredLegacy) {
    assert.ok(exceptions.has(relative), `${relative} must be explicitly classified during migration`);
    assert.equal(await exists(relative), true, `${relative} exception unexpectedly disappeared without boundary reconciliation`);
  }

  const currentProductionWorkflows = [
    '.github/workflows/production-authority-image.yml',
    '.github/workflows/production-authority-source-discovery.yml',
    '.github/workflows/production-dr-foundation.yml',
    '.github/workflows/production-logs-retention.yml',
    '.github/workflows/production-metrics-backend.yml',
    '.github/workflows/production-metrics-collector.yml',
    '.github/workflows/production-monitor-provider-registration.yml',
    '.github/workflows/production-telemetry-redaction.yml',
    '.github/workflows/production-trace-backend.yml'
  ];
  for (const relative of currentProductionWorkflows) {
    assert.ok(exceptions.has(relative), `${relative} must be an explicit private-target migration exception`);
    assert.equal(await exists(relative), true);
  }

  assert.equal(exceptions.size, requiredLegacy.length + currentProductionWorkflows.length);
  assert.match(policy.exceptionPolicy, /only shrink/i);
});

test('public coordination docs and PR template require cross-repository routing', async () => {
  const boundary = await readFile(path.join(ROOT, 'docs/architecture/OPEN_CORE_BOUNDARY.md'), 'utf8');
  const routing = await readFile(path.join(ROOT, 'docs/architecture/CROSS_REPO_TASK_ROUTING.md'), 'utf8');
  const template = await readFile(path.join(ROOT, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8');
  for (const text of [boundary, routing, template]) {
    assert.match(text, /inn-media\/truyn-platform/);
  }
  assert.match(routing, /OPEN \| PRIVATE \| BOTH/);
  assert.match(template, /Scope:/);
  assert.match(template, /Counterpart private PR\/issue/);
});

test('public core/status documents acknowledge TRUYN Platform and do not claim a single codebase', async () => {
  for (const relative of [
    'README.md',
    'ROADMAP.md',
    'STRUCTURE.md',
    'docs/architecture/ARCHITECTURE_CONTRACT.md',
    'docs/architecture/IMPLEMENTATION_STATUS.md',
    'SECURITY.md',
    'GOVERNANCE.md',
    'CONTRIBUTING.md',
    'NOTICE'
  ]) {
    const text = await readFile(path.join(ROOT, relative), 'utf8');
    assert.match(text, /TRUYN Platform|truyn-platform/, `${relative} must acknowledge the private counterpart`);
    if (relative === 'STRUCTURE.md') assert.doesNotMatch(text, /single evolving codebase/i);
  }
});
