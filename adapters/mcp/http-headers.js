const BASE64_PREFIX = '=?base64?';
const BASE64_SUFFIX = '?=';
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;

function usesBase64Sentinel(value) {
  return value.startsWith(BASE64_PREFIX) && value.endsWith(BASE64_SUFFIX);
}

function isPlainHeaderSafe(value) {
  if (!/^[\x20-\x7e]*$/.test(value)) return false;
  if (value.trim() !== value) return false;
  if (usesBase64Sentinel(value)) return false;
  return true;
}

export function encodeMcpHeaderValue(value) {
  const text = String(value);
  if (isPlainHeaderSafe(text)) return text;
  return `${BASE64_PREFIX}${Buffer.from(text, 'utf8').toString('base64')}${BASE64_SUFFIX}`;
}

export function decodeMcpHeaderValue(value) {
  if (typeof value !== 'string') return null;
  if (!usesBase64Sentinel(value)) return isPlainHeaderSafe(value) ? value : null;

  const encoded = value.slice(BASE64_PREFIX.length, -BASE64_SUFFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !BASE64_BODY.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) return null;
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return null;
  return decoded;
}
