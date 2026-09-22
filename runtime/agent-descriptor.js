import { signValue } from '../core/identity/index.js';

export const AGENT_DESCRIPTOR_PATH = '/.well-known/truyn-agent.json';
export const AGENT_DESCRIPTOR_SCHEMA = 'truyn.agent-descriptor/v1';
const REFRESH_DESCRIPTOR = Symbol('refreshPublicAgentDescriptor');

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

function boundedDescriptorTtlMs(env) {
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(env.TRUYN_AGENT_DESCRIPTOR_TTL_MS || 15 * 60 * 1000)));
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
  const ttlMs = boundedDescriptorTtlMs(env);
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
  const descriptor = { ...unsigned, signature: signValue(unsigned, identity.privateKeyPem) };
  Object.defineProperty(descriptor, REFRESH_DESCRIPTOR, {
    enumerable: false,
    value: (refreshNow = new Date()) => createPublicAgentDescriptor({ identity, capabilities, env, now: refreshNow })
  });
  return descriptor;
}

export function createPublicAgentDescriptorRefresher({ identity, capabilities = [], env = process.env, now = () => new Date() }) {
  if (env.TRUYN_PUBLIC_AGENT_DESCRIPTOR !== '1') return null;
  const ttlMs = boundedDescriptorTtlMs(env);
  const refreshWindowMs = Math.max(1_000, Math.floor(ttlMs / 3));
  let descriptor = null;

  return {
    get() {
      const currentTime = new Date(now());
      if (!descriptor || new Date(descriptor.expiresAt).getTime() - currentTime.getTime() <= refreshWindowMs) {
        descriptor = createPublicAgentDescriptor({ identity, capabilities, env, now: currentTime });
      }
      return descriptor;
    }
  };
}

function currentDescriptor(descriptorSource, now = new Date()) {
  if (typeof descriptorSource?.get === 'function') return descriptorSource.get();
  if (!descriptorSource) return descriptorSource;
  const ttlMs = new Date(descriptorSource.expiresAt).getTime() - new Date(descriptorSource.issuedAt).getTime();
  const refreshWindowMs = Math.max(1_000, Math.floor(ttlMs / 3));
  if (typeof descriptorSource[REFRESH_DESCRIPTOR] === 'function' && new Date(descriptorSource.expiresAt).getTime() - now.getTime() <= refreshWindowMs) {
    return descriptorSource[REFRESH_DESCRIPTOR](now);
  }
  return descriptorSource;
}

export function maybeServePublicAgentDescriptor(req, res, descriptorSource) {
  if (req.method !== 'GET' || req.url !== AGENT_DESCRIPTOR_PATH) return false;
  const descriptor = currentDescriptor(descriptorSource);
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
