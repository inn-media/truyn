export const SECRET_REFERENCE_SCHEMA = 'truyn.secret-reference/v1';

export function createSecretReference({ backend, key } = {}) {
  const normalizedBackend = String(backend || '').trim();
  const normalizedKey = String(key || '').trim();
  if (!normalizedBackend) throw new Error('Secret reference backend is required');
  if (!normalizedKey) throw new Error('Secret reference key is required');
  return Object.freeze({ schema: SECRET_REFERENCE_SCHEMA, backend: normalizedBackend, key: normalizedKey });
}

export function assertSecretReference(reference) {
  if (!reference || reference.schema !== SECRET_REFERENCE_SCHEMA) {
    throw new Error(`Unsupported secret reference schema: ${reference?.schema || 'missing'}`);
  }
  if (!String(reference.backend || '').trim() || !String(reference.key || '').trim()) {
    throw new Error('Secret reference backend and key are required');
  }
  return reference;
}

export class SecretStore {
  async resolve(_reference) {
    throw new Error('SecretStore.resolve(reference) must be implemented');
  }

  async put(_reference, _value) {
    throw new Error('SecretStore.put(reference, value) must be implemented');
  }

  async delete(_reference) {
    throw new Error('SecretStore.delete(reference) must be implemented');
  }
}

export class EnvironmentSecretStore extends SecretStore {
  constructor(environment = process.env) {
    super();
    this.environment = environment;
  }

  async resolve(reference) {
    const safeReference = assertSecretReference(reference);
    if (safeReference.backend !== 'env') {
      throw new Error(`EnvironmentSecretStore cannot resolve backend: ${safeReference.backend}`);
    }
    return this.environment[safeReference.key];
  }

  async put() {
    throw new Error('EnvironmentSecretStore is read-only; set credentials in the process environment explicitly');
  }

  async delete() {
    throw new Error('EnvironmentSecretStore is read-only; remove credentials from the process environment explicitly');
  }
}

export async function resolveSecret(secretStore, reference) {
  if (!secretStore || typeof secretStore.resolve !== 'function') {
    throw new Error('SecretStore with resolve(reference) is required');
  }
  const safeReference = assertSecretReference(reference);
  const value = await secretStore.resolve(safeReference);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`SecretStore could not resolve ${safeReference.backend}:${safeReference.key}`);
  }
  return value;
}
