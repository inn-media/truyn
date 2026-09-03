import assert from 'node:assert/strict';
import test from 'node:test';
import { QUICSocket } from '@matrixai/quic';
import { TruynQuicTransport, normalizeTransientQuicUdpSendError } from '../network/transport/quic.js';

test('QUIC UDP EPERM is translated to the upstream non-fatal network-dropout class', () => {
  const original = Object.assign(new Error('send EPERM'), {
    code: 'EPERM',
    errno: -1,
    syscall: 'send',
    address: '10.252.1.5',
    port: 4405
  });
  const normalized = normalizeTransientQuicUdpSendError(original);
  assert.notEqual(normalized, original);
  assert.equal(normalized.code, 'ENETUNREACH');
  assert.equal(normalized.originalCode, 'EPERM');
  assert.equal(normalized.syscall, 'send');
  assert.equal(normalized.address, '10.252.1.5');
  assert.equal(normalized.port, 4405);
  assert.equal(normalized.transient, true);
  assert.equal(normalized.cause, original);
});

test('QUIC UDP guard does not downgrade unrelated permission or socket errors', () => {
  for (const code of ['EACCES', 'EINVAL', 'ECONNREFUSED', 'EADDRINUSE']) {
    const original = Object.assign(new Error(code), { code, syscall: 'send' });
    assert.equal(normalizeTransientQuicUdpSendError(original), original);
  }
});

test('TruynQuicTransport guards the actual @matrixai/quic internal send_ boundary', async () => {
  const originalSend = QUICSocket.prototype.send_;
  const denied = Object.assign(new Error('blocked by packet fault'), {
    code: 'EPERM',
    syscall: 'send',
    address: '10.252.1.5',
    port: 4400
  });
  QUICSocket.prototype.send_ = async () => { throw denied; };
  try {
    const transport = new TruynQuicTransport({
      identity: { nodeId: 'node-a', publicKeyPem: 'public', privateKeyPem: 'private' },
      tls: { key: 'key', cert: 'cert' }
    });
    await assert.rejects(
      transport.socket.send_(Buffer.from('x'), 4400, '10.252.1.5'),
      (error) => error.code === 'ENETUNREACH' && error.originalCode === 'EPERM' && error.cause === denied
    );
  } finally {
    QUICSocket.prototype.send_ = originalSend;
  }
});
