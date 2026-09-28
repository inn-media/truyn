import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORK_PROFILE_NAMES,
  NETWORK_PROFILE_SCHEMA,
  assertNetworkProtocolCompatibility,
  prepareNetworkBootstrap,
  selectNetworkProfile
} from '../core/network/profiles.js';

const compatible = Object.freeze({ wire: 'proto/v1', identity: 'truyn.identity/v1' });

test('S137 exposes exactly the versioned local/testnet/mainnet profiles deterministically', () => {
  assert.deepEqual(NETWORK_PROFILE_NAMES, ['local', 'testnet', 'mainnet']);
  assert.equal(NETWORK_PROFILE_SCHEMA, 'truyn.network-profile/v1');
  for (const name of NETWORK_PROFILE_NAMES) {
    assert.equal(selectNetworkProfile(name), selectNetworkProfile(name));
    assert.equal(selectNetworkProfile(name).name, name);
  }
  assert.throws(() => selectNetworkProfile('production'), /unsupported network profile/);
});

test('S137 fails closed on incompatible required protocol semantics before bootstrap', () => {
  for (const name of NETWORK_PROFILE_NAMES) {
    assert.deepEqual(prepareNetworkBootstrap({ profile: name, protocol: compatible }), {
      profile: name,
      schema: NETWORK_PROFILE_SCHEMA,
      bootstrapRequired: name !== 'local'
    });
    assert.throws(
      () => prepareNetworkBootstrap({ profile: name, protocol: { ...compatible, wire: 'proto/v0' } }),
      /incompatible required protocol semantic wire/
    );
    assert.throws(
      () => prepareNetworkBootstrap({ profile: name, protocol: { wire: 'proto/v1' } }),
      /incompatible required protocol semantic identity/
    );
  }
});

test('S137 rejects forged profile objects instead of bypassing canonical selection', () => {
  assert.throws(
    () => assertNetworkProtocolCompatibility({ name: 'mainnet', schema: 'forged', protocol: compatible }, compatible),
    /invalid or unsupported network profile schema/
  );
});
