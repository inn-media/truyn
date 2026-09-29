import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

const NETWORKS = new Set(['testnet', 'mainnet']);
const DNS_NAME = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const NUMERIC_HOST = /^(?:0x[0-9a-f]+|0[0-7]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|0[0-7]+|[0-9]+)){0,3}$/i;

function boundedName(value, field) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253 || !DNS_NAME.test(value) || value.includes('..') || isIP(value) || NUMERIC_HOST.test(value)) {
    throw new Error(`${field} must be a bounded DNS name, not a literal IP`);
  }
  return value.toLowerCase();
}

function serviceName(network, discoveryDomain) {
  if (!NETWORKS.has(network)) throw new Error('DNS bootstrap discovery requires testnet or mainnet profile');
  return `_truyn-bootstrap._tcp.${network}.${boundedName(discoveryDomain, 'discoveryDomain')}`;
}

function compareAscii(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function resolveBootstrapServices({ network, discoveryDomain, resolver = dns } = {}) {
  const service = serviceName(network, discoveryDomain);
  if (!resolver || typeof resolver.resolveSrv !== 'function') throw new Error('DNS resolver must provide resolveSrv');
  const records = await resolver.resolveSrv(service);
  if (!Array.isArray(records) || records.length < 1 || records.length > 32) throw new Error('bootstrap DNS service set must contain 1..32 records');

  const normalized = records.map((record, index) => {
    if (!record || typeof record !== 'object') throw new Error(`bootstrap DNS record ${index} must be an object`);
    const target = boundedName(String(record.name ?? '').replace(/\.$/, ''), `bootstrap DNS record ${index} target`);
    const port = Number(record.port);
    const priority = Number(record.priority ?? 0);
    const weight = Number(record.weight ?? 0);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error(`bootstrap DNS record ${index} port is invalid`);
    if (!Number.isSafeInteger(priority) || priority < 0 || priority > 65535) throw new Error(`bootstrap DNS record ${index} priority is invalid`);
    if (!Number.isSafeInteger(weight) || weight < 0 || weight > 65535) throw new Error(`bootstrap DNS record ${index} weight is invalid`);
    return Object.freeze({ target, port, priority, weight });
  });

  normalized.sort((a, b) => a.priority - b.priority || b.weight - a.weight || compareAscii(a.target, b.target) || a.port - b.port);
  return Object.freeze({ network, service, entries: Object.freeze(normalized) });
}
