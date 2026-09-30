import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTIVITY_DIAGNOSTICS, selectConnectivityPolicy } from '../core/network/connectivity-policy.js';

const choose = (connectivityClass, options = {}) => selectConnectivityPolicy({ connectivityClass, ...options });

test('S147 IPv4 and IPv6 choose deterministic direct paths or documented diagnostics', () => {
  assert.equal(choose('ipv4', { directQuic: true }).path, 'direct-ipv4');
  assert.equal(choose('ipv6', { directQuic: true }).path, 'direct-ipv6');
  assert.equal(choose('ipv4').code, CONNECTIVITY_DIAGNOSTICS.IPV4_UNREACHABLE);
  assert.equal(choose('ipv6').code, CONNECTIVITY_DIAGNOSTICS.IPV6_UNREACHABLE);
});

test('S147 NAT chooses direct then traversal and otherwise returns documented diagnostic', () => {
  assert.equal(choose('nat', { directQuic: true, traversal: true }).path, 'direct-nat');
  assert.equal(choose('nat', { traversal: true }).path, 'nat-traversal');
  assert.equal(choose('nat').code, CONNECTIVITY_DIAGNOSTICS.NAT_NO_TRAVERSAL);
});

test('S147 CGNAT chooses direct then authenticated relay and otherwise returns diagnostic', () => {
  assert.equal(choose('cgnat', { directQuic: true, relay: true }).path, 'direct-cgnat');
  assert.equal(choose('cgnat', { relay: true }).path, 'authenticated-relay');
  assert.equal(choose('cgnat').code, CONNECTIVITY_DIAGNOSTICS.CGNAT_RELAY_REQUIRED);
});

test('S147 network change requires rediscovery and then chooses an allowed path', () => {
  assert.equal(choose('network-change', { rediscovered: true, directQuic: true }).path, 'rediscovered-direct');
  assert.equal(choose('network-change', { rediscovered: true, relay: true }).path, 'rediscovered-relay');
  assert.equal(choose('network-change', { directQuic: true }).code, CONNECTIVITY_DIAGNOSTICS.NETWORK_CHANGE_REDISCOVERY_REQUIRED);
});

test('S147 unsupported connectivity class fails immediately instead of hanging silently', () => {
  assert.throws(() => choose('unknown'), /unsupported connectivity class/);
});
