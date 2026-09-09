export const MCP_APPS_TOOL_META_FIELDS = Object.freeze(['resourceUri', 'visibility']);
export const MCP_APPS_RESOURCE_URI_MAX_BYTES = 2048;
export const MCP_APPS_TOOL_META_MAX_BYTES = 4096;
export const MCP_APPS_VISIBILITY_VALUES = Object.freeze(['model', 'app']);
export const MCP_APPS_DEFAULT_VISIBILITY = Object.freeze(['model', 'app']);

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function metadataError(message, details = {}) {
  const error = new Error(message);
  error.code = 'MCP_APPS_METADATA_INVALID';
  error.metadata = Object.freeze({ ...details });
  return error;
}

function uiMetadataSizeBytes(ui) {
  let serialized;
  try {
    serialized = JSON.stringify(ui);
  } catch {
    throw metadataError('MCP Apps _meta.ui must be JSON-serializable', { field: 'ui' });
  }
  if (typeof serialized !== 'string') {
    throw metadataError('MCP Apps _meta.ui must be JSON-serializable', { field: 'ui' });
  }
  return Buffer.byteLength(serialized, 'utf8');
}

function normalizeVisibility(value) {
  if (!Array.isArray(value)) {
    throw metadataError('MCP Apps _meta.ui.visibility must be an array', { field: 'visibility' });
  }
  if (value.length < 1 || value.length > MCP_APPS_VISIBILITY_VALUES.length) {
    throw metadataError('MCP Apps _meta.ui.visibility must contain one or two entries', { field: 'visibility' });
  }

  const seen = new Set();
  for (const entry of value) {
    if (!MCP_APPS_VISIBILITY_VALUES.includes(entry)) {
      throw metadataError(`MCP Apps _meta.ui.visibility contains unsupported value: ${String(entry)}`, {
        field: 'visibility',
        value: entry
      });
    }
    if (seen.has(entry)) {
      throw metadataError(`MCP Apps _meta.ui.visibility contains duplicate value: ${entry}`, {
        field: 'visibility',
        value: entry
      });
    }
    seen.add(entry);
  }

  return Object.freeze(MCP_APPS_VISIBILITY_VALUES.filter((entry) => seen.has(entry)));
}

export function normalizeMcpAppsResourceUri(value) {
  if (typeof value !== 'string') {
    throw metadataError('MCP Apps _meta.ui.resourceUri must be a string', { field: 'resourceUri' });
  }
  if (!value || value.trim() !== value) {
    throw metadataError('MCP Apps _meta.ui.resourceUri must be a non-empty trimmed string', { field: 'resourceUri' });
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw metadataError('MCP Apps _meta.ui.resourceUri must not contain control characters', { field: 'resourceUri' });
  }
  const sizeBytes = Buffer.byteLength(value, 'utf8');
  if (sizeBytes > MCP_APPS_RESOURCE_URI_MAX_BYTES) {
    throw metadataError(`MCP Apps _meta.ui.resourceUri exceeds ${MCP_APPS_RESOURCE_URI_MAX_BYTES} bytes`, {
      field: 'resourceUri',
      sizeBytes,
      maxBytes: MCP_APPS_RESOURCE_URI_MAX_BYTES
    });
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw metadataError('MCP Apps _meta.ui.resourceUri must be an absolute ui:// URI', { field: 'resourceUri' });
  }
  if (!value.startsWith('ui://') || parsed.protocol !== 'ui:') {
    throw metadataError('MCP Apps _meta.ui.resourceUri must use the ui:// scheme', {
      field: 'resourceUri',
      scheme: parsed.protocol || null
    });
  }
  return parsed.toString();
}

export function parseMcpAppsToolMetadata(meta) {
  if (meta === undefined || meta === null) {
    return Object.freeze({
      declared: false,
      resourceUri: null,
      visibility: MCP_APPS_DEFAULT_VISIBILITY
    });
  }
  if (!isObject(meta)) throw metadataError('MCP tool _meta must be an object when present');
  if (!Object.prototype.hasOwnProperty.call(meta, 'ui')) {
    return Object.freeze({
      declared: false,
      resourceUri: null,
      visibility: MCP_APPS_DEFAULT_VISIBILITY
    });
  }

  const ui = meta.ui;
  if (!isObject(ui)) throw metadataError('MCP Apps _meta.ui must be an object', { field: 'ui' });

  const sizeBytes = uiMetadataSizeBytes(ui);
  if (sizeBytes > MCP_APPS_TOOL_META_MAX_BYTES) {
    throw metadataError(`MCP Apps _meta.ui exceeds ${MCP_APPS_TOOL_META_MAX_BYTES} bytes`, {
      field: 'ui',
      sizeBytes,
      maxBytes: MCP_APPS_TOOL_META_MAX_BYTES
    });
  }

  const unknownFields = Object.keys(ui)
    .filter((field) => !MCP_APPS_TOOL_META_FIELDS.includes(field))
    .sort();
  if (unknownFields.length > 0) {
    throw metadataError(`MCP Apps _meta.ui contains unsupported fields: ${unknownFields.join(', ')}`, {
      field: 'ui',
      unsupportedFields: Object.freeze(unknownFields)
    });
  }

  const resourceUri = Object.prototype.hasOwnProperty.call(ui, 'resourceUri')
    ? normalizeMcpAppsResourceUri(ui.resourceUri)
    : null;
  const visibility = Object.prototype.hasOwnProperty.call(ui, 'visibility')
    ? normalizeVisibility(ui.visibility)
    : MCP_APPS_DEFAULT_VISIBILITY;

  return Object.freeze({ declared: true, resourceUri, visibility });
}
