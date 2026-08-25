import { verify as cryptoVerify } from 'node:crypto';
import { canonicalize, nodeIdFromPublicKey } from '../../../core/protocol/index.js';

export const AGENT_DESCRIPTOR_SCHEMA = 'truyn.agent-descriptor/v1';
export const AGENT_DESCRIPTOR_VERSION = '1';
export const DEFAULT_SUPPORTED_PROTOCOLS = Object.freeze(['TRUYN/1']);
export const DEFAULT_SUPPORTED_INTERFACES = Object.freeze(['https', 'websocket', 'truyn-quic', 'mcp']);

function failure(code, reason, message, details = undefined, source = undefined) {
  return {
    ok: false,
    reason,
    error: {
      code,
      message,
      retryable: false,
      ...(source ? { source } : {}),
      ...(details === undefined ? {} : { details })
    }
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value, { minItems = 0 } = {}) {
  return Array.isArray(value) && value.length >= minItems && value.every(isNonEmptyString) && new Set(value).size === value.length;
}

function parseInput(input) {
  if (typeof input === 'string' || Buffer.isBuffer(input) || input instanceof Uint8Array) {
    try {
      const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
      const value = JSON.parse(text);
      return { ok: true, value };
    } catch {
      return failure('validation_error', 'invalid_descriptor_json', 'Agent Descriptor is not valid JSON');
    }
  }
  if (isPlainObject(input)) return { ok: true, value: input };
  return failure('validation_error', 'invalid_descriptor_type', 'Agent Descriptor must be a JSON object or JSON document');
}

function validateInterface(value) {
  if (!isPlainObject(value) || !isNonEmptyString(value.type)) return false;
  if (value.endpoint !== undefined && !isNonEmptyString(value.endpoint)) return false;
  if (value.version !== undefined && !isNonEmptyString(value.version)) return false;
  if (value.contentTypes !== undefined && !isStringArray(value.contentTypes)) return false;
  return true;
}

function validateCapability(value) {
  if (!isPlainObject(value) || !isNonEmptyString(value.id)) return false;
  for (const field of ['inputModes', 'outputModes', 'interactionModes']) {
    if (value[field] !== undefined && !isStringArray(value[field])) return false;
  }
  return true;
}

function descriptorSignatures(descriptor) {
  const signatures = [];
  if (isNonEmptyString(descriptor.signature)) signatures.push(descriptor.signature);
  if (Array.isArray(descriptor.signatures)) signatures.push(...descriptor.signatures);
  return [...new Set(signatures)];
}

function strictBase64Signature(value) {
  if (!isNonEmptyString(value) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== value) return null;
  return bytes;
}

function normalizeNow(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return now;
  return Date.parse(now);
}

export function unsignedAgentDescriptor(descriptor) {
  const { signature, signatures, ...unsigned } = descriptor;
  return unsigned;
}

export function agentDescriptorSigningPayload(descriptor) {
  if (!isPlainObject(descriptor)) throw new TypeError('descriptor must be an object');
  return canonicalize(unsignedAgentDescriptor(descriptor));
}

export function parseAgentDescriptor(input, {
  now = Date.now(),
  allowExpired = false,
  supportedDescriptorVersions = [AGENT_DESCRIPTOR_VERSION]
} = {}) {
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  const descriptor = parsed.value;

  if (!isPlainObject(descriptor)) {
    return failure('validation_error', 'invalid_descriptor_type', 'Agent Descriptor must be a JSON object');
  }

  if (!isNonEmptyString(descriptor.descriptorVersion)) {
    return failure('validation_error', 'missing_descriptor_version', 'Agent Descriptor descriptorVersion is required');
  }
  if (!supportedDescriptorVersions.includes(descriptor.descriptorVersion)) {
    return failure(
      'version_mismatch',
      'unsupported_descriptor_version',
      'Unsupported Agent Descriptor version',
      { supportedDescriptorVersions, receivedDescriptorVersion: descriptor.descriptorVersion }
    );
  }
  if (descriptor.schema !== AGENT_DESCRIPTOR_SCHEMA) {
    return failure(
      'version_mismatch',
      'unsupported_descriptor_schema',
      'Unsupported Agent Descriptor schema',
      { supportedSchema: AGENT_DESCRIPTOR_SCHEMA, receivedSchema: descriptor.schema ?? null }
    );
  }
  if (!isNonEmptyString(descriptor.identity) || !descriptor.identity.startsWith('truyn:node:')) {
    return failure('validation_error', 'invalid_descriptor_identity', 'Agent Descriptor identity must be a TRUYN node identity');
  }
  if (!isStringArray(descriptor.protocols, { minItems: 1 })) {
    return failure('validation_error', 'invalid_descriptor_protocols', 'Agent Descriptor protocols must be a non-empty unique string array');
  }
  if (!Array.isArray(descriptor.interfaces) || descriptor.interfaces.length === 0 || !descriptor.interfaces.every(validateInterface)) {
    return failure('validation_error', 'invalid_descriptor_interfaces', 'Agent Descriptor interfaces are invalid');
  }
  if (!Array.isArray(descriptor.capabilities) || !descriptor.capabilities.every(validateCapability)) {
    return failure('validation_error', 'invalid_descriptor_capabilities', 'Agent Descriptor capabilities are invalid');
  }
  if (!isNonEmptyString(descriptor.issuedAt) || !Number.isFinite(Date.parse(descriptor.issuedAt))) {
    return failure('validation_error', 'invalid_descriptor_issued_at', 'Agent Descriptor issuedAt must be a valid date-time');
  }
  if (!isNonEmptyString(descriptor.expiresAt) || !Number.isFinite(Date.parse(descriptor.expiresAt))) {
    return failure('validation_error', 'invalid_descriptor_expires_at', 'Agent Descriptor expiresAt must be a valid date-time');
  }

  const issuedAtMs = Date.parse(descriptor.issuedAt);
  const expiresAtMs = Date.parse(descriptor.expiresAt);
  if (expiresAtMs <= issuedAtMs) {
    return failure('validation_error', 'invalid_descriptor_time_window', 'Agent Descriptor expiresAt must be after issuedAt');
  }

  const nowMs = normalizeNow(now);
  if (!Number.isFinite(nowMs)) {
    return failure('validation_error', 'invalid_validation_time', 'Descriptor validation time is invalid');
  }
  if (!allowExpired && expiresAtMs <= nowMs) {
    return failure(
      'validation_error',
      'descriptor_expired',
      'Agent Descriptor has expired',
      { expiresAt: descriptor.expiresAt }
    );
  }

  const signatures = descriptorSignatures(descriptor);
  if (signatures.length === 0 || signatures.some((signature) => strictBase64Signature(signature) === null)) {
    return failure('validation_error', 'invalid_descriptor_signature_encoding', 'Agent Descriptor requires a base64 Ed25519 signature');
  }

  return { ok: true, descriptor };
}

export function negotiateAgentDescriptor(input, {
  now = Date.now(),
  allowExpired = false,
  supportedDescriptorVersions = [AGENT_DESCRIPTOR_VERSION],
  supportedProtocols = DEFAULT_SUPPORTED_PROTOCOLS,
  supportedInterfaces = DEFAULT_SUPPORTED_INTERFACES
} = {}) {
  const parsed = parseAgentDescriptor(input, { now, allowExpired, supportedDescriptorVersions });
  if (!parsed.ok) return parsed;
  const { descriptor } = parsed;

  const protocol = supportedProtocols.find((candidate) => descriptor.protocols.includes(candidate));
  if (!protocol) {
    return failure(
      'version_mismatch',
      'unsupported_protocol',
      'No mutually supported TRUYN protocol generation',
      { supportedProtocols, advertisedProtocols: descriptor.protocols },
      { protocolReason: 'unsupported_protocol' }
    );
  }

  const selectedInterface = descriptor.interfaces.find((entry) => supportedInterfaces.includes(entry.type));
  if (!selectedInterface) {
    return failure(
      'version_mismatch',
      'unsupported_interface',
      'No mutually supported Agent Descriptor interface',
      { supportedInterfaces, advertisedInterfaces: descriptor.interfaces.map((entry) => entry.type) }
    );
  }

  return {
    ok: true,
    descriptor,
    selection: {
      descriptorVersion: descriptor.descriptorVersion,
      protocol,
      interface: selectedInterface
    }
  };
}

export function verifyAgentDescriptorSignature(input, {
  publicKeyPem,
  now = Date.now(),
  allowExpired = false,
  supportedDescriptorVersions = [AGENT_DESCRIPTOR_VERSION]
} = {}) {
  const parsed = parseAgentDescriptor(input, { now, allowExpired, supportedDescriptorVersions });
  if (!parsed.ok) return parsed;
  const { descriptor } = parsed;

  if (!isNonEmptyString(publicKeyPem)) {
    return failure('unauthenticated', 'descriptor_key_unavailable', 'Agent Descriptor identity public key is unavailable');
  }

  let resolvedNodeId;
  try {
    resolvedNodeId = nodeIdFromPublicKey(publicKeyPem);
  } catch {
    return failure('unauthenticated', 'invalid_descriptor_public_key', 'Agent Descriptor identity public key is invalid');
  }
  if (resolvedNodeId !== descriptor.identity) {
    return failure(
      'unauthenticated',
      'descriptor_identity_key_mismatch',
      'Agent Descriptor signing key is not the current identity key',
      { expectedIdentity: descriptor.identity, resolvedIdentity: resolvedNodeId, delegatedDescriptorKeysSupported: false }
    );
  }

  const payload = Buffer.from(agentDescriptorSigningPayload(descriptor), 'utf8');
  for (const encoded of descriptorSignatures(descriptor)) {
    const signature = strictBase64Signature(encoded);
    if (!signature) continue;
    try {
      if (cryptoVerify(null, payload, publicKeyPem, signature)) {
        return { ok: true, descriptor, signer: { identity: descriptor.identity, keyBinding: 'identity' } };
      }
    } catch {
      return failure('unauthenticated', 'invalid_descriptor_public_key', 'Agent Descriptor identity public key is invalid');
    }
  }

  return failure('unauthenticated', 'invalid_descriptor_signature', 'Agent Descriptor signature verification failed');
}
