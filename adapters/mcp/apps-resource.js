export const MCP_APPS_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
export const MCP_APPS_RESOURCE_MAX_BYTES = 512 * 1024;
export const MCP_APPS_RESOURCE_MAX_CONTENTS = 32;
export const MCP_APPS_UI_TRUST_BOUNDARY = Object.freeze({
  classification: 'untrusted-presentation-data',
  authority: Object.freeze({
    authorization: false,
    providerSelection: false,
    billing: false,
    entitlement: false,
    execution: false
  })
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freezeUntrustedUiData(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) freezeUntrustedUiData(entry, seen);
  } else {
    for (const entry of Object.values(value)) freezeUntrustedUiData(entry, seen);
  }
  return Object.freeze(value);
}

function mimeError({ resourceUri, index, received }) {
  const rendered = received === undefined ? 'missing' : JSON.stringify(received);
  const error = new Error(
    `Unsupported MCP Apps UI resource MIME at contents[${index}]: ${rendered}; expected ${MCP_APPS_RESOURCE_MIME_TYPE}`
  );
  error.code = 'MCP_APPS_RESOURCE_MIME_UNSUPPORTED';
  error.appResource = Object.freeze({
    resourceUri,
    index,
    expectedMimeType: MCP_APPS_RESOURCE_MIME_TYPE,
    receivedMimeType: received ?? null
  });
  return error;
}

function boundsError({ resourceUri, dimension, observed, max }) {
  const error = new Error(`MCP Apps UI resource exceeds ${dimension} limit: ${observed} > ${max}`);
  error.code = 'MCP_APPS_RESOURCE_BOUNDS_EXCEEDED';
  error.appResource = Object.freeze({ resourceUri, dimension, observed, max });
  return error;
}

function duplicateContentError({ resourceUri, firstIndex, duplicateIndex }) {
  const error = new Error(
    `MCP Apps UI resource contains duplicate content at contents[${duplicateIndex}] matching contents[${firstIndex}]`
  );
  error.code = 'MCP_APPS_RESOURCE_DUPLICATE_CONTENT';
  error.appResource = Object.freeze({ resourceUri, firstIndex, duplicateIndex });
  return error;
}

function missingResourceError(resourceUri) {
  const error = new Error(`MCP Apps UI resource is missing for requested URI: ${resourceUri}`);
  error.code = 'MCP_APPS_RESOURCE_MISSING';
  error.appResource = Object.freeze({ resourceUri });
  return error;
}

function uriMismatchError({ resourceUri, index, received }) {
  const rendered = received === undefined ? 'missing' : JSON.stringify(received);
  const error = new Error(
    `MCP Apps UI resource URI mismatch at contents[${index}]: ${rendered}; expected ${resourceUri}`
  );
  error.code = 'MCP_APPS_RESOURCE_URI_MISMATCH';
  error.appResource = Object.freeze({
    resourceUri,
    index,
    receivedResourceUri: received ?? null
  });
  return error;
}

function contentBytes(content, index) {
  const hasText = Object.prototype.hasOwnProperty.call(content, 'text');
  const hasBlob = Object.prototype.hasOwnProperty.call(content, 'blob');
  if (hasText === hasBlob) {
    throw new Error(`MCP Apps UI resource contents[${index}] must contain exactly one of text or blob`);
  }
  if (hasText) {
    if (typeof content.text !== 'string') {
      throw new Error(`MCP Apps UI resource contents[${index}].text must be a string`);
    }
    return Buffer.byteLength(content.text, 'utf8');
  }
  if (typeof content.blob !== 'string') {
    throw new Error(`MCP Apps UI resource contents[${index}].blob must be base64 text`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content.blob) || content.blob.length % 4 === 1) {
    throw new Error(`MCP Apps UI resource contents[${index}].blob must use canonical base64`);
  }
  const bytes = Buffer.from(content.blob, 'base64');
  const normalizedInput = content.blob.replace(/=+$/, '');
  const normalizedRoundTrip = bytes.toString('base64').replace(/=+$/, '');
  if (normalizedInput !== normalizedRoundTrip) {
    throw new Error(`MCP Apps UI resource contents[${index}].blob must use valid base64`);
  }
  return bytes.length;
}

function duplicateOf(content, seenContents) {
  const hasText = Object.prototype.hasOwnProperty.call(content, 'text');
  const value = hasText ? content.text : content.blob;
  return seenContents.find((entry) => entry.hasText === hasText && entry.value === value) || null;
}

export function validateMcpAppsResourceReadResult(resourceUri, readResult) {
  if (!isObject(readResult) || !Array.isArray(readResult.contents) || readResult.contents.length < 1) {
    throw missingResourceError(resourceUri);
  }
  if (readResult.contents.length > MCP_APPS_RESOURCE_MAX_CONTENTS) {
    throw boundsError({
      resourceUri,
      dimension: 'contents',
      observed: readResult.contents.length,
      max: MCP_APPS_RESOURCE_MAX_CONTENTS
    });
  }

  let totalBytes = 0;
  const seenContents = [];
  for (let index = 0; index < readResult.contents.length; index += 1) {
    const content = readResult.contents[index];
    if (!isObject(content)) {
      throw new Error(`MCP Apps UI resource contents[${index}] must be an object`);
    }
    if (content.uri !== resourceUri) {
      throw uriMismatchError({ resourceUri, index, received: content.uri });
    }
    if (content.mimeType !== MCP_APPS_RESOURCE_MIME_TYPE) {
      throw mimeError({ resourceUri, index, received: content.mimeType });
    }
    const bytes = contentBytes(content, index);
    const duplicate = duplicateOf(content, seenContents);
    if (duplicate) {
      throw duplicateContentError({
        resourceUri,
        firstIndex: duplicate.index,
        duplicateIndex: index
      });
    }
    const hasText = Object.prototype.hasOwnProperty.call(content, 'text');
    seenContents.push({ index, hasText, value: hasText ? content.text : content.blob });
    totalBytes += bytes;
    if (totalBytes > MCP_APPS_RESOURCE_MAX_BYTES) {
      throw boundsError({
        resourceUri,
        dimension: 'bytes',
        observed: totalBytes,
        max: MCP_APPS_RESOURCE_MAX_BYTES
      });
    }
  }

  return freezeUntrustedUiData(readResult);
}
