export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Identity {
  nodeId: string;
  publicKey: string;
  algorithm?: string | null;
  protocols?: string[];
  name?: string | null;
}

export interface Capability {
  id: string;
  name?: string | null;
  description?: string | null;
  inputModes?: string[];
  outputModes?: string[];
  interactionModes?: string[];
}

export interface AgentDescriptorInterface {
  type: string;
  endpoint?: string;
  version?: string;
  contentTypes?: string[];
  [key: string]: unknown;
}

export interface AgentDescriptor {
  schema: 'truyn.agent-descriptor/v1';
  descriptorVersion: '1';
  identity: string;
  protocols: string[];
  interfaces: AgentDescriptorInterface[];
  capabilities: Capability[];
  issuedAt: string;
  expiresAt: string;
  signature?: string;
  signatures?: string[];
  name?: string;
  description?: string;
  features?: Record<string, unknown>;
  security?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  documentation?: JsonValue;
  sdkHints?: JsonValue;
  [key: string]: unknown;
}

export interface Offer {
  protocol: 'TRUYN/1';
  type: 'OFFER';
  id: string;
  from: string;
  to: string | null;
  createdAt: string;
  publicKey: string;
  payload: {
    capability: { name: string };
    metadata: Record<string, unknown>;
  };
  signature: string;
  trust?: JsonValue;
}

export type ArtifactRef = string;

export type NormalizedErrorCode =
  | 'transport_error'
  | 'invalid_response'
  | 'validation_error'
  | 'version_mismatch'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'resource_exhausted'
  | 'deadline_exceeded'
  | 'cancelled'
  | 'internal_error';

export interface NormalizedErrorSource {
  httpStatus?: number;
  relayCode?: string;
  protocolReason?: string;
}

export interface NormalizedError {
  code: NormalizedErrorCode;
  message: string;
  retryable: boolean;
  source?: NormalizedErrorSource;
  details?: JsonValue;
}

export interface AgentDescriptorSelection {
  descriptorVersion: string;
  protocol: string;
  interface: AgentDescriptorInterface;
}

export interface DescriptorSigner {
  identity: string;
  keyBinding: 'identity';
}

export type DescriptorFailure = {
  ok: false;
  reason: string;
  error: NormalizedError;
};

export type DescriptorParseResult =
  | { ok: true; descriptor: AgentDescriptor }
  | DescriptorFailure;

export type DescriptorNegotiationResult =
  | { ok: true; descriptor: AgentDescriptor; selection: AgentDescriptorSelection }
  | DescriptorFailure;

export type DescriptorVerificationResult =
  | { ok: true; descriptor: AgentDescriptor; signer: DescriptorSigner }
  | DescriptorFailure;

export interface DescriptorParseOptions {
  now?: Date | number | string;
  allowExpired?: boolean;
  supportedDescriptorVersions?: string[];
}

export interface DescriptorNegotiationOptions extends DescriptorParseOptions {
  supportedProtocols?: string[];
  supportedInterfaces?: string[];
}

export interface DescriptorVerificationOptions extends DescriptorParseOptions {
  publicKeyPem?: string;
}
