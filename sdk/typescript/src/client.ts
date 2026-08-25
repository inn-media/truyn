import {
  negotiateAgentDescriptor,
  parseAgentDescriptor,
  verifyAgentDescriptorSignature
} from './descriptor.ts';
import { TruynError, normalizeError } from './errors.ts';
import type {
  AgentDescriptor,
  AgentDescriptorSelection,
  DescriptorSigner,
  Identity,
  Offer
} from './types.ts';

export interface TruynClientOptions {
  relayUrl: string;
  sessionToken?: string | null;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface DescriptorFetchOptions extends RequestOptions {
  publicKeyPem?: string;
  resolveIdentityPublicKey?: (nodeId: string) => Promise<string> | string;
  now?: Date | number | string;
  allowExpired?: boolean;
  supportedDescriptorVersions?: string[];
  supportedProtocols?: string[];
  supportedInterfaces?: string[];
}

export interface VerifiedAgentDescriptor {
  descriptor: AgentDescriptor;
  selection: AgentDescriptorSelection;
  signer: DescriptorSigner;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'TRUYN request failed');
}

function requireRelayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TruynError({
      code: 'validation_error',
      message: 'relayUrl must be an absolute HTTP(S) URL',
      retryable: false
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TruynError({
      code: 'validation_error',
      message: 'relayUrl must use http or https',
      retryable: false
    });
  }
  return url.toString().replace(/\/$/, '');
}

function validateIdentity(value: unknown, expectedNodeId: string): Identity {
  if (!plainObject(value) || value.nodeId !== expectedNodeId || !nonEmptyString(value.publicKey)) {
    throw new TruynError(normalizeError({
      clientKind: 'invalid_response',
      message: 'Relay returned an invalid Identity response'
    }));
  }
  const identity: Identity = { nodeId: expectedNodeId, publicKey: value.publicKey };
  if (value.algorithm === null || nonEmptyString(value.algorithm)) identity.algorithm = value.algorithm as string | null;
  if (Array.isArray(value.protocols) && value.protocols.every(nonEmptyString)) identity.protocols = [...value.protocols];
  if (value.name === null || nonEmptyString(value.name)) identity.name = value.name as string | null;
  return identity;
}

function validateOffer(value: unknown): value is Offer {
  if (!plainObject(value) || value.protocol !== 'TRUYN/1' || value.type !== 'OFFER') return false;
  if (!nonEmptyString(value.id) || !nonEmptyString(value.from) || !nonEmptyString(value.publicKey) || !nonEmptyString(value.signature)) return false;
  if (!plainObject(value.payload) || !plainObject(value.payload.capability) || !nonEmptyString(value.payload.capability.name)) return false;
  return plainObject(value.payload.metadata);
}

export class TruynClient {
  readonly relayUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private sessionToken: string | null;

  constructor(options: TruynClientOptions) {
    if (!options || !nonEmptyString(options.relayUrl)) {
      throw new TruynError({
        code: 'validation_error',
        message: 'relayUrl is required',
        retryable: false
      });
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: 'A Fetch API implementation is required'
      }));
    }
    this.relayUrl = requireRelayUrl(options.relayUrl);
    this.fetchImpl = fetchImpl;
    this.sessionToken = options.sessionToken ?? null;
  }

  setSessionToken(sessionToken: string | null): void {
    if (sessionToken !== null && !nonEmptyString(sessionToken)) {
      throw new TruynError({
        code: 'validation_error',
        message: 'sessionToken must be a non-empty string or null',
        retryable: false
      });
    }
    this.sessionToken = sessionToken;
  }

  private authorizationHeader(): string {
    if (!this.sessionToken) {
      throw new TruynError({
        code: 'unauthenticated',
        message: 'A relay session token is required for this operation',
        retryable: false
      });
    }
    return `Bearer ${this.sessionToken}`;
  }

  private async requestJson(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.relayUrl}${path}`, {
        ...options,
        headers: {
          accept: 'application/json',
          ...(options.headers || {}),
          authorization: this.authorizationHeader()
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TruynError(normalizeError({ clientKind: 'cancelled', message: error.message || 'Request cancelled' }));
      }
      throw new TruynError(normalizeError({ clientKind: 'transport', message: messageFrom(error) }));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: `Relay returned non-JSON response (HTTP ${response.status})`
      }));
    }
    if (!plainObject(body)) {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: 'Relay response must be a JSON object'
      }));
    }
    if (!response.ok) {
      const relayCode = nonEmptyString(body.error) ? body.error : undefined;
      throw new TruynError(normalizeError({
        httpStatus: response.status,
        relayCode,
        message: relayCode || `HTTP ${response.status}`
      }));
    }
    return body;
  }

  async getIdentity(nodeId: string, options: RequestOptions = {}): Promise<Identity> {
    if (!nonEmptyString(nodeId) || !nodeId.startsWith('truyn:node:')) {
      throw new TruynError({
        code: 'validation_error',
        message: 'nodeId must be a TRUYN node identity',
        retryable: false
      });
    }
    const body = await this.requestJson(`/v1/nodes/${encodeURIComponent(nodeId)}`, { signal: options.signal });
    return validateIdentity(body, nodeId);
  }

  async discover(capabilityId: string, options: RequestOptions = {}): Promise<Offer[]> {
    if (!nonEmptyString(capabilityId)) {
      throw new TruynError({
        code: 'validation_error',
        message: 'capabilityId is required',
        retryable: false
      });
    }
    const body = await this.requestJson(`/v1/offers?capability=${encodeURIComponent(capabilityId)}`, { signal: options.signal });
    if (!Array.isArray(body.offers) || !body.offers.every(validateOffer)) {
      throw new TruynError(normalizeError({
        clientKind: 'invalid_response',
        message: 'Relay returned an invalid authorized discovery response'
      }));
    }
    // Provider visibility is a relay policy decision. Do not client-side reconstruct or broaden this list.
    return body.offers as Offer[];
  }

  private async descriptorText(url: string, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { accept: 'application/json' }, signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TruynError(normalizeError({ clientKind: 'cancelled', message: error.message || 'Request cancelled' }));
      }
      throw new TruynError(normalizeError({ clientKind: 'transport', message: messageFrom(error) }));
    }
    const text = await response.text();
    if (!response.ok) {
      let relayCode: string | undefined;
      try {
        const body = JSON.parse(text);
        if (plainObject(body) && nonEmptyString(body.error)) relayCode = body.error;
      } catch {}
      throw new TruynError(normalizeError({
        httpStatus: response.status,
        relayCode,
        message: relayCode || `Descriptor HTTP ${response.status}`
      }));
    }
    return text;
  }

  async fetchAgentDescriptor(url: string, options: DescriptorFetchOptions = {}): Promise<VerifiedAgentDescriptor> {
    let descriptorUrl: URL;
    try {
      descriptorUrl = new URL(url);
    } catch {
      throw new TruynError({
        code: 'validation_error',
        message: 'Agent Descriptor URL must be absolute',
        retryable: false
      });
    }
    if (descriptorUrl.protocol !== 'http:' && descriptorUrl.protocol !== 'https:') {
      throw new TruynError({
        code: 'validation_error',
        message: 'Agent Descriptor URL must use http or https',
        retryable: false
      });
    }

    const input = await this.descriptorText(descriptorUrl.toString(), options.signal);
    const parsed = parseAgentDescriptor(input, {
      now: options.now,
      allowExpired: options.allowExpired,
      supportedDescriptorVersions: options.supportedDescriptorVersions
    });
    if (!parsed.ok) throw new TruynError(parsed.error);

    let publicKeyPem = options.publicKeyPem;
    if (!publicKeyPem && options.resolveIdentityPublicKey) {
      publicKeyPem = await options.resolveIdentityPublicKey(parsed.descriptor.identity);
    }
    if (!publicKeyPem && this.sessionToken) {
      publicKeyPem = (await this.getIdentity(parsed.descriptor.identity, { signal: options.signal })).publicKey;
    }

    const verified = verifyAgentDescriptorSignature(parsed.descriptor, {
      publicKeyPem,
      now: options.now,
      allowExpired: options.allowExpired,
      supportedDescriptorVersions: options.supportedDescriptorVersions
    });
    if (!verified.ok) throw new TruynError(verified.error);

    const negotiated = negotiateAgentDescriptor(verified.descriptor, {
      now: options.now,
      allowExpired: options.allowExpired,
      supportedDescriptorVersions: options.supportedDescriptorVersions,
      supportedProtocols: options.supportedProtocols,
      supportedInterfaces: options.supportedInterfaces
    });
    if (!negotiated.ok) throw new TruynError(negotiated.error);

    return {
      descriptor: verified.descriptor,
      selection: negotiated.selection,
      signer: verified.signer
    };
  }
}
