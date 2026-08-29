import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Class D remote jq variables and bootstrap bundle path survive the outer heredocs', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const finalAcceptance = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  const runtimeBundle = await readFile('scripts/build-class-d-1000-runtime-bundle.sh', 'utf8');

  assert.match(provision, /sourceSha == \\\$sha/);
  assert.match(finalAcceptance, /sourceSha == \\\$sha/);
  assert.doesNotMatch(provision, /sourceSha == \$sha'/);
  assert.match(provision, /seed:\\\$seed/);
  assert.doesNotMatch(provision, /seed:\$seed/);
  assert.match(provision, /from '\/opt\/truyqn\/benchmarks\/scale\/class-d-1000-bootstrap\.js'/);
  assert.match(runtimeBundle, /ln -s app\/benchmarks "\$STAGE\/benchmarks"/);
  assert.match(runtimeBundle, /-czf "\$OUT" -C "\$STAGE" app benchmarks runtime manifest\.json dependency-tree\.json/);
  assert.match(runtimeBundle, /test -f "\$VERIFY\/benchmarks\/scale\/class-d-1000-bootstrap\.js"/);
});
