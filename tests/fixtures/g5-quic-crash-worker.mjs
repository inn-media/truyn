import { appendFileSync } from 'node:fs';
import { TruynQuicTransport } from '../../network/transport/quic.js';
import { createSqliteLifecycleLedger } from '../../network/relay/durable-lifecycle-ledger.js';

process.once('message', async ({ identity, tls, filePath, effectsPath, crash }) => {
  const ledger = createSqliteLifecycleLedger({ filePath });
  const transport = new TruynQuicTransport({ identity, tls, host: '127.0.0.1', lifecycleLedger: ledger });
  transport.onEnvelope(envelope => {
    if (crash === 'before-effect') process.kill(process.pid, 'SIGKILL');
    appendFileSync(effectsPath, envelope.id + '\n', { mode: 0o600 });
    if (crash === 'after-effect') process.kill(process.pid, 'SIGKILL');
    return { accepted: true };
  });
  const endpoint = await transport.start();
  process.send({ port: endpoint.port });
  process.once('message', async message => {
    if (message !== 'close') throw Error('invalid_worker_control');
    await transport.close(); ledger.close(); process.disconnect();
  });
});
