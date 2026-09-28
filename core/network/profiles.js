const PROFILE_SCHEMA = 'truyn.network-profile/v1';
const SUPPORTED_PROTOCOL = Object.freeze({ wire: 'proto/v1', identity: 'truyn.identity/v1' });

const DEFINITIONS = Object.freeze({
  local: Object.freeze({ name: 'local', schema: PROFILE_SCHEMA, bootstrapRequired: false, protocol: SUPPORTED_PROTOCOL }),
  testnet: Object.freeze({ name: 'testnet', schema: PROFILE_SCHEMA, bootstrapRequired: true, protocol: SUPPORTED_PROTOCOL }),
  mainnet: Object.freeze({ name: 'mainnet', schema: PROFILE_SCHEMA, bootstrapRequired: true, protocol: SUPPORTED_PROTOCOL })
});

export const NETWORK_PROFILE_SCHEMA = PROFILE_SCHEMA;
export const NETWORK_PROFILE_NAMES = Object.freeze(Object.keys(DEFINITIONS));

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`network profile ${field} is required`);
  return value;
}

export function selectNetworkProfile(name) {
  const selected = requiredString(name, 'name');
  const profile = DEFINITIONS[selected];
  if (!profile) throw new Error(`unsupported network profile: ${selected}`);
  return profile;
}

export function assertNetworkProtocolCompatibility(profile, offered = {}) {
  const selected = typeof profile === 'string' ? selectNetworkProfile(profile) : profile;
  if (!selected || selected.schema !== PROFILE_SCHEMA || !NETWORK_PROFILE_NAMES.includes(selected.name)) {
    throw new Error('invalid or unsupported network profile schema');
  }
  for (const [semantic, required] of Object.entries(selected.protocol)) {
    if (offered[semantic] !== required) {
      throw new Error(`incompatible required protocol semantic ${semantic}: expected ${required}`);
    }
  }
  return selected;
}

export function prepareNetworkBootstrap({ profile, protocol } = {}) {
  const selected = selectNetworkProfile(profile);
  assertNetworkProtocolCompatibility(selected, protocol);
  return Object.freeze({ profile: selected.name, schema: selected.schema, bootstrapRequired: selected.bootstrapRequired });
}
