// Negotiated metadata only. Call after signature verification and before dispatch.
export const ENVELOPE_EXT_SEMANTIC = 'truyn.envelope.ext/1';
const known = new Set(['traceId', 'expiresAt', 'priority', 'contentType', 'crit']);
const name = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const value = /^[A-Za-z0-9._:;=/+\-]{1,128}$/;
const exact = (pattern, text) => typeof text === 'string' && !text.includes('\n') && pattern.test(text);
const failure = (reason, detail) => ({ ok: false, reason, detail });

export function validateEnvelopeExt(envelope, { negotiatedSemantics = [], now = Date.now() } = {}) {
  if (!negotiatedSemantics.includes(ENVELOPE_EXT_SEMANTIC) || !Object.hasOwn(envelope, 'ext')) return { ok: true };
  const ext = envelope.ext;
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return failure('invalid_argument', 'invalid_ext');
  const keys = Object.keys(ext);
  // Valid strings contain only ASCII with no JSON escapes: length equals TCJ1 bytes.
  if (keys.length > 16) return failure('invalid_argument', 'invalid_ext');
  for (const key of keys) {
    if (!exact(name, key)) return failure('invalid_argument', 'invalid_ext');
    if (key === 'crit') {
      if (!Array.isArray(ext.crit) || ext.crit.length > 16 || new Set(ext.crit).size !== ext.crit.length ||
          ext.crit.some(k => !exact(name, k) || k === 'crit' || !Object.hasOwn(ext, k)))
        return failure('invalid_argument', 'invalid_ext:crit');
    } else if (!exact(value, ext[key])) return failure('invalid_argument', `invalid_ext:${key}`);
  }
  if (Buffer.byteLength(JSON.stringify(ext), 'utf8') > 1024) return failure('invalid_argument', 'invalid_ext');
  if (Object.hasOwn(ext, 'traceId') && (!exact(/^[0-9a-f]{32}$/, ext.traceId) || /^0+$/.test(ext.traceId)))
    return failure('invalid_argument', 'invalid_ext:traceId');
  let expires;
  if (Object.hasOwn(ext, 'expiresAt')) {
    expires = Date.parse(ext.expiresAt);
    if (!exact(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, ext.expiresAt) || !Number.isFinite(expires) ||
        new Date(expires).toISOString() !== ext.expiresAt || !Number.isFinite(Date.parse(envelope.createdAt)) || expires <= Date.parse(envelope.createdAt))
      return failure('invalid_argument', 'invalid_ext:expiresAt');
  }
  if (Object.hasOwn(ext, 'priority') && !['background', 'normal', 'critical'].includes(ext.priority))
    return failure('invalid_argument', 'invalid_ext:priority');
  if (Object.hasOwn(ext, 'contentType') && !exact(/^application\/json(?:;profile=[a-z0-9][a-z0-9._/\-]{0,95})?$/, ext.contentType))
    return failure('invalid_argument', 'invalid_ext:contentType');
  for (const key of ext.crit ?? []) if (!known.has(key)) return failure('version_mismatch', `required_semantic_unavailable:${key}`);
  if (!Number.isFinite(now)) return failure('invalid_argument', 'invalid_ext:clock');
  if (expires !== undefined && now > expires + 30_000) return failure('deadline_exceeded', 'envelope_expired');
  if (ext.contentType && !['application/json', `application/json;profile=truyn.${envelope.type.toLowerCase()}/1`].includes(ext.contentType))
    return failure('unimplemented', 'unsupported_content_type');
  return { ok: true };
}

// Local admission hints never change signed bytes or grant priority authority.
export function envelopePriority(envelope, { negotiatedSemantics = [], allowCritical = false } = {}) {
  if (!negotiatedSemantics.includes(ENVELOPE_EXT_SEMANTIC)) return 'normal';
  const requested = envelope.ext?.priority;
  return requested === 'background' ? 'background' : requested === 'critical' && allowCritical ? 'critical' : 'normal';
}
