import { signValue } from '../core/identity/index.js';

export const AGENT_DESCRIPTOR_PATH = '/.well-known/truyn-agent.json';
export const AGENT_DESCRIPTOR_SCHEMA = 'truyn.agent-descriptor/v1';

function csv(value = '') {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function absoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createPublicAgentDescriptor({ identity, capabilities = [], env = process.env, now = new Date() }) {
  if (env.TRUYN_PUBLIC_AGENT_DESCRIPTOR !== '1') return null;
  if (!identity?.nodeId || !identity?.privateKeyPem) throw new Error('descriptor_identity_required');

  const endpoint = absoluteHttpUrl(env.TRUYN_PUBLIC_AGENT_DESCRIPTOR_URL || '');
  if (!endpoint) throw new Error('TRUYN_PUBLIC_AGENT_DESCRIPTOR_URL must be an absolute HTTP(S) URL');

  const advertised = new Set(csv(env.TRUYN_PUBLIC_CAPABILITIES));
  const visibleCapabilities = [...new Set(capabilities)]
    .filter((capability) => advertised.has(capability))
    .sort()
    .map((id) => ({ id }));

  const issued = new Date(now);
  const ttlMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(env.TRUYN_AGENT_DESCRIPTOR_TTL_MS || 15 * 60 * 1000)));
  const unsigned = {
    schema: AGENT_DESCRIPTOR_SCHEMA,
    descriptorVersion: '1',
    identity: identity.nodeId,
    protocols: ['TRUYN/1'],
    interfaces: [{ type: 'https', endpoint }],
    capabilities: visibleCapabilities,
    features: { streaming: true, artifacts: true, directNeedCancellation: true },
    security: { signedEnvelopes: true, authorization: 'policy-before-dispatch' },
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + ttlMs).toISOString()
  };
  return { ...unsigned, signature: signValue(unsigned, identity.privateKeyPem) };
}

export function maybeServePublicAgentDescriptor(req, res, descriptor) {
  if (req.method !== 'GET' || req.url !== AGENT_DESCRIPTOR_PATH) return false;
  if (!descriptor) {
    const body = JSON.stringify({ ok: false, error: 'not_found' });
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
    return true;
  }
  const body = JSON.stringify(descriptor);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' });
  res.end(body);
  return true;
}
