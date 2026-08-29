import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const provision = fs.readFileSync(new URL('../benchmarks/scale/class-d-azure-1000-provision.sh', import.meta.url), 'utf8');
const finalAcceptance = fs.readFileSync(new URL('../scripts/class-d-1000-final-acceptance.sh', import.meta.url), 'utf8');

test('D-1000 Azure bootstrap normalizes Ubuntu apt sources to HTTPS before apt traffic', () => {
  const normalize = provision.indexOf('install_stage=apt-sources-https');
  const update = provision.indexOf('install_stage=apt-update');
  assert.ok(normalize >= 0, 'missing apt HTTPS normalization stage');
  assert.ok(update > normalize, 'apt update must happen after HTTPS normalization');
  assert.match(provision, /https:\/\/archive\.ubuntu\.com\/ubuntu/);
  assert.match(provision, /https:\/\/security\.ubuntu\.com\/ubuntu/);
  assert.match(provision, /Acquire::Retries=5/);
  assert.match(provision, /Acquire::https::Timeout=20/);
  assert.match(provision, /TRUYN_APT_SOURCES_HTTPS=PASS/);
  assert.doesNotMatch(provision, /install_stage=apt-update\nretry_cmd apt-get update -qq/);
});

test('strict D-1000 bundle transformer recognizes the HTTPS bootstrap shape', () => {
  assert.ok(finalAcceptance.includes('install_stage=apt-sources-https'));
  assert.match(finalAcceptance, /expected exactly one exact-SHA D-1000 network bootstrap/);
});
