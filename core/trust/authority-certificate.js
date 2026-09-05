import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export const AUTHORITY_CERT_PROTOCOL = 'truyn-authority-cert-v1';
export const AUTHORITY_CERT_VERSION = 1;

const PURPOSES = new Set([
  'delegate',
  'claim-issuer',
  'verifier',
  'source-owner',
  'lineage-signer',
  'provider-attester',
  'disputer'
]);
const SCOPE_KINDS = new Set(['global', 'domain', 'source', 'provider']);
const SCOPE_MATCHES = new Set(['exact', 'prefix', 'subdomain']);

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function iso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

export function normalizeAuthorityPurposes(value) {
  const values = Array.isArray(value) ? value : [value];
  const purposes = [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
  if (purposes.length === 0) throw new Error('authority purposes are required');
  for (const purpose of purposes) if (!PURPOSES.has(purpose)) throw new Error(`Unsupported authority purpose: ${purpose}`);
  return purposes.sort();
}

function normalizedScopeValue(kind, value) {
  if (kind === 'global') return '*';
  const normalized = requiredString(value, 'authority scope value').normalize('NFKC');
  if (kind === 'domain') {
    const domain = normalized.toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!domain) throw new Error('authority scope value is empty after domain normalization');
    return domain;
  }
  return normalized;
}

export function normalizeAuthorityScope(input = {}) {
  if (typeof input === 'string') {
    if (input === '*') return { kind: 'global', value: '*', match: 'exact' };
    return { kind: 'domain', value: normalizedScopeValue('domain', input), match: 'exact' };
  }
  const kind = requiredString(input.kind, 'authority scope kind').toLowerCase();
  if (!SCOPE_KINDS.has(kind)) throw new Error(`Unsupported authority scope kind: ${input.kind}`);
  let match = String(input.match || 'exact').trim().toLowerCase();
  if (!SCOPE_MATCHES.has(match)) throw new Error(`Unsupported authority scope match: ${input.match}`);
  if (kind === 'global') match = 'exact';
  if (match === 'subdomain' && kind !== 'domain') throw new Error('subdomain authority scope is only valid for domain');
  return { kind, value: normalizedScopeValue(kind, input.value), match };
}

export function normalizeAuthorityScopes(value) {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw new Error('authority scopes are required');
  const scopes = values.map(normalizeAuthorityScope);
  const deduped = new Map(scopes.map((scope) => [canonicalize(scope), scope]));
  return [...deduped.values()].sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)));
}

export function authorityScopeMatches(grantedInput, requestedInput) {
  const granted = normalizeAuthorityScope(grantedInput);
  const requested = normalizeAuthorityScope(requestedInput);
  if (granted.kind === 'global') return true;
  if (granted.kind !== requested.kind) return false;
  if (granted.match === 'exact') return requested.value === granted.value;
  if (granted.match === 'prefix') return requested.value.startsWith(granted.value);
  if (granted.match === 'subdomain') return requested.value === granted.value || requested.value.endsWith(`.${granted.value}`);
  return false;
}

export function authorityScopeContains(parentInput, childInput) {
  const parent = normalizeAuthorityScope(parentInput);
  const child = normalizeAuthorityScope(childInput);
  if (parent.kind === 'global') return true;
  if (parent.kind !== child.kind) return false;
  if (parent.match === 'exact') return child.match === 'exact' && child.value === parent.value;
  if (parent.match === 'prefix') return child.match !== 'subdomain' && child.value.startsWith(parent.value);
  if (parent.match === 'subdomain') {
    if (child.match === 'prefix') return false;
    return child.value === parent.value || child.value.endsWith(`.${parent.value}`);
  }
  return false;
}

export function authorityScopesContain(parentScopes, childScopes) {
  const parents = normalizeAuthorityScopes(parentScopes);
  const children = normalizeAuthorityScopes(childScopes);
  return children.every((child) => parents.some((parent) => authorityScopeContains(parent, child)));
}

function normalizeIssuerRef(input = {}) {
  const type = requiredString(input.type, 'authority issuer ref type').toLowerCase();
  if (!['root', 'certificate'].includes(type)) throw new Error(`Unsupported authority issuer ref type: ${input.type}`);
  const ref = { type, id: requiredString(input.id, 'authority issuer ref id') };
  if (type === 'root') ref.version = positiveInteger(input.version, 'authority root version');
  return ref;
}

function subjectFromInput(subject = {}) {
  const publicKey = requiredString(subject.publicKeyPem || subject.publicKey, 'authority subject public key');
  const derivedNodeId = nodeIdFromPublicKey(publicKey);
  const nodeId = requiredString(subject.nodeId || derivedNodeId, 'authority subject nodeId');
  if (derivedNodeId !== nodeId) throw new Error('authority subject key mismatch');
  return { nodeId, publicKey };
}

function issuerFromIdentity(identity) {
  const publicKey = requiredString(identity?.publicKeyPem, 'authority issuer public key');
  const privateKey = requiredString(identity?.privateKeyPem, 'authority issuer private key');
  const nodeId = requiredString(identity?.nodeId, 'authority issuer nodeId');
  if (nodeIdFromPublicKey(publicKey) !== nodeId) throw new Error('authority issuer key mismatch');
  return { nodeId, publicKey, privateKey };
}

export function createAuthorityCertificate({
  identity,
  issuerRef,
  authorityId,
  authorityVersion,
  subject,
  purposes,
  scopes,
  replacesCertificateId = null,
  issuedAt = new Date().toISOString(),
  notBefore = issuedAt,
  expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
} = {}) {
  const issuer = issuerFromIdentity(identity);
  const normalizedSubject = subjectFromInput(subject);
  const normalizedIssuedAt = iso(issuedAt, 'authority issuedAt');
  const normalizedNotBefore = iso(notBefore, 'authority notBefore');
  const normalizedExpiresAt = iso(expiresAt, 'authority expiresAt');
  if (Date.parse(normalizedExpiresAt) <= Date.parse(normalizedNotBefore)) throw new Error('authority expiresAt must be after notBefore');
  if (Date.parse(normalizedIssuedAt) > Date.parse(normalizedExpiresAt)) throw new Error('authority issuedAt must be before expiresAt');

  const body = {
    protocol: AUTHORITY_CERT_PROTOCOL,
    version: AUTHORITY_CERT_VERSION,
    issuerRef: normalizeIssuerRef(issuerRef),
    issuerNodeId: issuer.nodeId,
    authorityId: requiredString(authorityId, 'authorityId'),
    authorityVersion: positiveInteger(authorityVersion, 'authorityVersion'),
    subjectNodeId: normalizedSubject.nodeId,
    subjectPublicKey: normalizedSubject.publicKey,
    purposes: normalizeAuthorityPurposes(purposes),
    scopes: normalizeAuthorityScopes(scopes),
    replacesCertificateId: replacesCertificateId == null ? null : requiredString(replacesCertificateId, 'replacesCertificateId'),
    notBefore: normalizedNotBefore,
    expiresAt: normalizedExpiresAt
  };
  const certificateId = `truyn:authority-cert:${digest({ body, issuedAt: normalizedIssuedAt }).slice('sha256:'.length)}`;
  const signed = { certificateId, body, issuedAt: normalizedIssuedAt, issuerPublicKey: issuer.publicKey };
  return { ...signed, signature: signValue(signed, issuer.privateKey) };
}

export function verifyAuthorityCertificate(certificate, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!certificate?.certificateId || !certificate?.body || !certificate?.issuedAt || !certificate?.issuerPublicKey || !certificate?.signature) return { ok: false, reason: 'authority_certificate_missing_required_field' };
    const body = certificate.body;
    if (body.protocol !== AUTHORITY_CERT_PROTOCOL || body.version !== AUTHORITY_CERT_VERSION) return { ok: false, reason: 'authority_certificate_protocol_mismatch' };
    normalizeIssuerRef(body.issuerRef);
    normalizeAuthorityPurposes(body.purposes);
    normalizeAuthorityScopes(body.scopes);
    positiveInteger(body.authorityVersion, 'authorityVersion');
    if (nodeIdFromPublicKey(certificate.issuerPublicKey) !== body.issuerNodeId) return { ok: false, reason: 'authority_certificate_issuer_key_mismatch' };
    if (nodeIdFromPublicKey(body.subjectPublicKey) !== body.subjectNodeId) return { ok: false, reason: 'authority_certificate_subject_key_mismatch' };
    const issuedAt = iso(certificate.issuedAt, 'authority issuedAt');
    const notBefore = iso(body.notBefore, 'authority notBefore');
    const expiresAt = iso(body.expiresAt, 'authority expiresAt');
    if (Date.parse(expiresAt) <= Date.parse(notBefore) || Date.parse(issuedAt) > Date.parse(expiresAt)) return { ok: false, reason: 'authority_certificate_time_invalid' };
    if (!allowExpired && (now < Date.parse(notBefore) || now >= Date.parse(expiresAt))) return { ok: false, reason: 'authority_certificate_not_current' };
    const expectedId = `truyn:authority-cert:${digest({ body, issuedAt }).slice('sha256:'.length)}`;
    if (expectedId !== certificate.certificateId) return { ok: false, reason: 'authority_certificate_content_id_mismatch' };
    const signed = { certificateId: certificate.certificateId, body, issuedAt, issuerPublicKey: certificate.issuerPublicKey };
    if (!verifyValue(signed, certificate.signature, certificate.issuerPublicKey)) return { ok: false, reason: 'authority_certificate_signature_invalid' };
    return { ok: true, certificateId: certificate.certificateId, authorityId: body.authorityId, authorityVersion: body.authorityVersion };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}
