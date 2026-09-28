const MANIFEST_SCHEMA = 'truyn.bootstrap-manifest/v1';
const TOP_LEVEL_FIELDS = new Set(['schema', 'network', 'version', 'issuedAt', 'expiresAt', 'peers', 'rotation']);
const PEER_FIELDS = new Set(['id', 'domain', 'endpoints', 'version']);
const ROTATION_FIELDS = new Set(['activeKeyId', 'nextKeyId', 'notBefore']);
const ENDPOINT_FIELDS = new Set(['transport', 'url']);
const NETWORKS = new Set(['local', 'testnet', 'mainnet']);
const TRANSPORTS = new Set(['quic', 'wss', 'https']);

export const BOOTSTRAP_MANIFEST_SCHEMA = MANIFEST_SCHEMA;

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value;
}

function exactFields(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${field} contains undeclared field: ${key}`);
}

function string(value, field, max = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${field} must be a bounded non-empty string`);
  return value;
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive safe integer`);
  return value;
}

function timestamp(value, field) {
  string(value, field, 64);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return value;
}

function endpoint(value, index) {
  const entry = object(value, `peers.endpoints[${index}]`);
  exactFields(entry, ENDPOINT_FIELDS, `peers.endpoints[${index}]`);
  if (!TRANSPORTS.has(entry.transport)) throw new Error(`unsupported bootstrap transport: ${entry.transport}`);
  const url = string(entry.url, `peers.endpoints[${index}].url`, 2048);
  const parsed = new URL(url);
  if (parsed.username || parsed.password) throw new Error('bootstrap endpoint credentials are forbidden');
  if (entry.transport === 'quic' && parsed.protocol !== 'quic:') throw new Error('quic endpoint must use quic scheme');
  if (entry.transport === 'wss' && parsed.protocol !== 'wss:') throw new Error('wss endpoint must use wss scheme');
  if (entry.transport === 'https' && parsed.protocol !== 'https:') throw new Error('https endpoint must use https scheme');
  return Object.freeze({ transport: entry.transport, url });
}

function peer(value, index) {
  const entry = object(value, `peers[${index}]`);
  exactFields(entry, PEER_FIELDS, `peers[${index}]`);
  const endpoints = entry.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length < 1 || endpoints.length > 8) throw new Error('peer endpoints must contain 1..8 public endpoints');
  return Object.freeze({
    id: string(entry.id, `peers[${index}].id`, 256),
    domain: string(entry.domain, `peers[${index}].domain`, 253),
    endpoints: Object.freeze(endpoints.map((item, endpointIndex) => endpoint(item, endpointIndex))),
    version: integer(entry.version, `peers[${index}].version`)
  });
}

export function parseBootstrapManifest(input) {
  const manifest = object(input, 'bootstrap manifest');
  exactFields(manifest, TOP_LEVEL_FIELDS, 'bootstrap manifest');
  if (manifest.schema !== MANIFEST_SCHEMA) throw new Error('unsupported bootstrap manifest schema');
  if (!NETWORKS.has(manifest.network)) throw new Error('unsupported bootstrap manifest network');
  const peers = manifest.peers;
  if (!Array.isArray(peers) || peers.length < 1 || peers.length > 64) throw new Error('bootstrap peers must contain 1..64 public entries');
  const rotation = object(manifest.rotation, 'rotation');
  exactFields(rotation, ROTATION_FIELDS, 'rotation');
  const parsed = {
    schema: MANIFEST_SCHEMA,
    network: manifest.network,
    version: integer(manifest.version, 'version'),
    issuedAt: timestamp(manifest.issuedAt, 'issuedAt'),
    expiresAt: timestamp(manifest.expiresAt, 'expiresAt'),
    peers: Object.freeze(peers.map(peer)),
    rotation: Object.freeze({
      activeKeyId: string(rotation.activeKeyId, 'rotation.activeKeyId', 256),
      nextKeyId: rotation.nextKeyId == null ? null : string(rotation.nextKeyId, 'rotation.nextKeyId', 256),
      notBefore: rotation.notBefore == null ? null : timestamp(rotation.notBefore, 'rotation.notBefore')
    })
  };
  if (Date.parse(parsed.expiresAt) <= Date.parse(parsed.issuedAt)) throw new Error('bootstrap manifest expiry must follow issue time');
  return Object.freeze(parsed);
}
