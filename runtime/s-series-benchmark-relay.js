import { createRelay } from '../network/relay/server.js';

const host = process.env.TRUYN_S_RELAY_HOST || '127.0.0.1';
const port = Number(process.env.TRUYN_S_RELAY_PORT || 0);

if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
  throw new Error('S-Series benchmark relay must remain loopback-only');
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('TRUYN_S_RELAY_PORT must be an integer between 0 and 65535');
}

const relay = createRelay({
  localDevelopmentMode: false,
  productionMode: false,
  allowPublicRegistration: true,
  allowPublicDispatch: true,
  exposeDiagnostics: false,
  maxNodes: Number(process.env.TRUYN_S_RELAY_MAX_NODES || 256),
  maxOffers: Number(process.env.TRUYN_S_RELAY_MAX_OFFERS || 4096),
  maxContexts: Number(process.env.TRUYN_S_RELAY_MAX_CONTEXTS || 512),
  maxRequests: Number(process.env.TRUYN_S_RELAY_MAX_REQUESTS || 4096),
  maxChains: Number(process.env.TRUYN_S_RELAY_MAX_CHAINS || 1024),
});

const relayUrl = await relay.listen({ host, port });
process.stdout.write(`S_SERIES_BENCHMARK_RELAY=READY url=${relayUrl}\n`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  try {
    await relay.close();
  } finally {
    process.exit(0);
  }
};

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
