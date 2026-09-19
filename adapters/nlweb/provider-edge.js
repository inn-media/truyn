import { NLWEB_PINNED_SOURCE, NLWEB_PROTOCOL_VERSION } from './client.js';

function requireFunction(value, field) {
  if (typeof value !== 'function') throw new TypeError(`${field} must be a function`);
  return value;
}

function requireCapabilityId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('eligible capability id must be a non-empty string');
  }
  return value;
}

function projectPublicCapability(capability) {
  const projected = { id: requireCapabilityId(capability.id) };
  for (const field of ['name', 'description']) {
    if (typeof capability[field] === 'string' && capability[field].trim() !== '') {
      projected[field] = capability[field];
    }
  }
  return Object.freeze(projected);
}

/**
 * Bounded NLWeb provider edge for the pinned 0.5 profile.
 *
 * The edge never decides eligibility from NLWeb/caller fields. The canonical
 * TRUYN authority path supplies `isPublicEligible`, which must positively
 * authorize every capability before any public projection is returned.
 */
export function createNlwebProviderEdge({ listCapabilities, isPublicEligible } = {}) {
  const list = requireFunction(listCapabilities, 'listCapabilities');
  const eligible = requireFunction(isPublicEligible, 'isPublicEligible');

  async function listPublicCapabilities(authorityContext) {
    const capabilities = await list(authorityContext);
    if (!Array.isArray(capabilities)) throw new TypeError('listCapabilities must return an array');

    const exposed = [];
    for (const capability of capabilities) {
      if (!capability || typeof capability !== 'object' || Array.isArray(capability)) continue;
      if (capability.visibility !== 'public') continue;
      if (capability.nlweb?.enabled !== true) continue;
      if ((await eligible(capability, authorityContext)) !== true) continue;
      exposed.push(projectPublicCapability(capability));
    }
    return Object.freeze(exposed);
  }

  return Object.freeze({
    profile: NLWEB_PROTOCOL_VERSION,
    pinnedSource: NLWEB_PINNED_SOURCE,
    listPublicCapabilities
  });
}
