export const TRUYN_SDK_STABLE_API_VERSION = '1' as const;

export type TruynCancelCause = 'user' | 'deadline' | 'shutdown';

export interface TruynCancellation {
  readonly signal: AbortSignal;
  readonly cause?: TruynCancelCause;
}

export interface TruynObjectPayload<T = unknown> {
  readonly kind: 'object';
  readonly value: T;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TruynArtifactPayload {
  readonly kind: 'artifact';
  readonly ref: string;
  readonly mediaType: string;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type TruynPortablePayload<T = unknown> = TruynObjectPayload<T> | TruynArtifactPayload;

export interface TruynStreamOptions {
  readonly signal?: AbortSignal;
}

export interface TruynStreamItem<T> {
  readonly sequence: number;
  readonly item: T;
}

function nonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason instanceof Error ? signal.reason : new Error('TRUYN SDK operation cancelled');
  reason.name = 'AbortError';
  throw reason;
}

export function createCancellationController(): AbortController {
  return new AbortController();
}

export function createObjectPayload<T>(
  value: T,
  metadata?: Readonly<Record<string, unknown>>
): TruynObjectPayload<T> {
  return {
    kind: 'object',
    value,
    ...(metadata === undefined ? {} : { metadata })
  };
}

export function createArtifactPayload(input: {
  ref: string;
  mediaType: string;
  bytes?: number;
  sha256?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): TruynArtifactPayload {
  nonEmptyString(input?.ref, 'ref');
  nonEmptyString(input?.mediaType, 'mediaType');
  if (input.bytes !== undefined && (!Number.isSafeInteger(input.bytes) || input.bytes < 0)) {
    throw new TypeError('bytes must be a non-negative safe integer');
  }
  if (input.sha256 !== undefined) {
    nonEmptyString(input.sha256, 'sha256');
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new TypeError('sha256 must be a 64-character hexadecimal digest');
  }
  return {
    kind: 'artifact',
    ref: input.ref,
    mediaType: input.mediaType,
    ...(input.bytes === undefined ? {} : { bytes: input.bytes }),
    ...(input.sha256 === undefined ? {} : { sha256: input.sha256.toLowerCase() }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata })
  };
}

export async function* streamTruynItems<T>(
  source: AsyncIterable<T>,
  options: TruynStreamOptions = {}
): AsyncGenerator<TruynStreamItem<T>> {
  let sequence = 0;
  throwIfAborted(options.signal);
  for await (const item of source) {
    throwIfAborted(options.signal);
    yield { sequence, item };
    sequence += 1;
  }
  throwIfAborted(options.signal);
}

export const TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION = 'truyn.managed-auth-device/v1' as const;

export const TRUYN_MANAGED_CLIENT_PLATFORMS = Object.freeze([
  'windows',
  'macos',
  'linux',
  'android'
] as const);

export type TruynManagedClientPlatform = (typeof TRUYN_MANAGED_CLIENT_PLATFORMS)[number];
export type TruynManagedAccountStatus = 'active' | 'suspended' | 'deleting' | 'deleted';
export type TruynManagedMembershipStatus = 'active' | 'suspended' | 'removed';
export type TruynManagedDeviceStatus = 'active' | 'revoked' | 'deleted';
export type TruynManagedSessionStatus = 'active' | 'revoked' | 'expired';
export type TruynManagedSessionRevocationScope = 'current_session' | 'current_device' | 'all_sessions';
export type TruynManagedAuthContractReason = 'invalid_request' | 'version_mismatch' | 'server_authoritative_field' | 'unsupported_platform';

export class TruynManagedAuthContractError extends TypeError {
  readonly code = 'managed_auth_contract_violation' as const;
  readonly reason: TruynManagedAuthContractReason;

  constructor(reason: TruynManagedAuthContractReason, message: string) {
    super(message);
    this.name = 'TruynManagedAuthContractError';
    this.reason = reason;
  }
}

export interface TruynManagedDeviceRegistrationRequest {
  readonly contractVersion: typeof TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION;
  readonly clientDeviceId: string;
  readonly platform: TruynManagedClientPlatform;
  readonly clientVersion?: string;
}

export interface TruynManagedSessionRevocationRequest {
  readonly contractVersion: typeof TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION;
  readonly scope: TruynManagedSessionRevocationScope;
}

export interface TruynManagedAccountView {
  readonly accountId: string;
  readonly status: TruynManagedAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TruynManagedTenantMembershipView {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly role: string;
  readonly status: TruynManagedMembershipStatus;
}

export interface TruynManagedDeviceView {
  readonly deviceId: string;
  readonly accountId: string;
  readonly tenantId?: string;
  readonly clientDeviceId: string;
  readonly platform: TruynManagedClientPlatform;
  readonly clientVersion?: string;
  readonly status: TruynManagedDeviceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TruynManagedSessionView {
  readonly sessionId: string;
  readonly accountId: string;
  readonly tenantId?: string;
  readonly deviceId: string;
  readonly status: TruynManagedSessionStatus;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
}

export interface TruynManagedAuthSnapshot {
  readonly contractVersion: typeof TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION;
  readonly account: TruynManagedAccountView;
  readonly memberships: readonly TruynManagedTenantMembershipView[];
  readonly device: TruynManagedDeviceView;
  readonly session: TruynManagedSessionView;
}

const MANAGED_DEVICE_REGISTRATION_FIELDS = new Set(['contractVersion', 'clientDeviceId', 'platform', 'clientVersion']);
const MANAGED_SESSION_REVOCATION_FIELDS = new Set(['contractVersion', 'scope']);
const MANAGED_SERVER_AUTHORITY_FIELDS = new Set([
  'accountId', 'tenantId', 'membershipId', 'deviceId', 'sessionId', 'ownerId',
  'billingOwnerId', 'entitlement', 'entitlements', 'authorization', 'authorized'
]);

function managedRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TruynManagedAuthContractError('invalid_request', `${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function managedString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TruynManagedAuthContractError('invalid_request', `${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertManagedClientWritableKeys(input: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(input)) {
    if (MANAGED_SERVER_AUTHORITY_FIELDS.has(key)) {
      throw new TruynManagedAuthContractError('server_authoritative_field', `${key} is server-authoritative and cannot be supplied by a client`);
    }
    if (!allowed.has(key)) {
      throw new TruynManagedAuthContractError('invalid_request', `${label} contains unsupported field: ${key}`);
    }
  }
}

export function assertTruynManagedAuthDeviceContractVersion(value: unknown): asserts value is typeof TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION {
  if (value !== TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION) {
    throw new TruynManagedAuthContractError('version_mismatch', `contractVersion must equal ${TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION}`);
  }
}

export function parseTruynManagedDeviceRegistrationRequest(input: unknown): TruynManagedDeviceRegistrationRequest {
  const record = managedRecord(input, 'managed device registration request');
  assertManagedClientWritableKeys(record, MANAGED_DEVICE_REGISTRATION_FIELDS, 'managed device registration request');
  assertTruynManagedAuthDeviceContractVersion(record.contractVersion);
  const clientDeviceId = managedString(record.clientDeviceId, 'clientDeviceId');
  const platform = managedString(record.platform, 'platform') as TruynManagedClientPlatform;
  if (!TRUYN_MANAGED_CLIENT_PLATFORMS.includes(platform)) {
    throw new TruynManagedAuthContractError('unsupported_platform', `unsupported managed client platform: ${platform}`);
  }
  const clientVersion = record.clientVersion === undefined ? undefined : managedString(record.clientVersion, 'clientVersion');
  return Object.freeze({
    contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
    clientDeviceId,
    platform,
    ...(clientVersion === undefined ? {} : { clientVersion })
  });
}

export function parseTruynManagedSessionRevocationRequest(input: unknown): TruynManagedSessionRevocationRequest {
  const record = managedRecord(input, 'managed session revocation request');
  assertManagedClientWritableKeys(record, MANAGED_SESSION_REVOCATION_FIELDS, 'managed session revocation request');
  assertTruynManagedAuthDeviceContractVersion(record.contractVersion);
  const scope = managedString(record.scope, 'scope') as TruynManagedSessionRevocationScope;
  if (!['current_session', 'current_device', 'all_sessions'].includes(scope)) {
    throw new TruynManagedAuthContractError('invalid_request', `unsupported session revocation scope: ${scope}`);
  }
  return Object.freeze({ contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION, scope });
}
