import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test('DX-3 TypeScript stable API executable tests pass under the supported Node runtime', () => {
  run(process.execPath, [
    '--experimental-strip-types',
    '--test',
    'sdk/typescript/test/dx3.test.ts'
  ]);
});

test('DX-3 Python stable payload helpers are importable and enforce artifact integrity shape', () => {
  run('python', ['-c', [
    'from truyn import TRUYN_SDK_STABLE_API_VERSION, artifact_payload, object_payload',
    'assert TRUYN_SDK_STABLE_API_VERSION == "1"',
    'assert object_payload({"ok": True}) == {"kind": "object", "value": {"ok": True}}',
    'p = artifact_payload(ref="artifact://x", media_type="image/png", bytes=1, sha256="a"*64)',
    'assert p["kind"] == "artifact" and p["sha256"] == "a"*64',
    'assert "data" not in p and "base64" not in p'
  ].join('; ')]);
});

test('DX-3 developer page is public-safe source and does not claim remote NEED cancellation', async () => {
  const html = await readFile('docs/developer-site/index.html', 'utf8');
  const guide = await readFile('docs/getting-started/DX3_SDK.md', 'utf8');
  assert.match(html, /TRUYN \/ Developers/);
  assert.match(html, /SDK stable API contract v1/);
  assert.doesNotMatch(html, /api[_-]?key\s*=/i);
  assert.doesNotMatch(html, /bearer\s+[A-Za-z0-9._-]{12,}/i);
  assert.match(guide, /does \*\*not yet revoke an in-flight NEED at the provider\*\*/);
  assert.match(guide, /event streaming.*not token-delta generation streaming/is);
});
