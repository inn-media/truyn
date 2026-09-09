export const MCP_EXTENSIONS_CAPABILITY_KEY = 'extensions';
export const MCP_UI_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_KNOWN_EXTENSION_IDS = Object.freeze([MCP_UI_EXTENSION_ID]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readMcpExtensionCapability(capabilities, extensionId) {
  if (!isObject(capabilities)) throw new Error('MCP capabilities must be an object');
  if (typeof extensionId !== 'string' || extensionId.trim().length === 0) {
    throw new Error('MCP extension id must be a non-empty string');
  }

  if (!Object.prototype.hasOwnProperty.call(capabilities, MCP_EXTENSIONS_CAPABILITY_KEY)) {
    return { declared: false, capability: null };
  }

  const extensions = capabilities[MCP_EXTENSIONS_CAPABILITY_KEY];
  if (!isObject(extensions)) throw new Error('MCP capabilities.extensions must be an object when present');
  if (!Object.prototype.hasOwnProperty.call(extensions, extensionId)) {
    return { declared: false, capability: null };
  }

  const capability = extensions[extensionId];
  if (!isObject(capability)) {
    throw new Error(`MCP extension ${extensionId} must be an object when declared`);
  }

  return { declared: true, capability };
}

export function readMcpUiExtensionCapability(capabilities) {
  return readMcpExtensionCapability(capabilities, MCP_UI_EXTENSION_ID);
}

export function hasMcpUiExtensionCapability(capabilities) {
  return readMcpUiExtensionCapability(capabilities).declared;
}

export function analyzeMcpOptionalExtensions(capabilities) {
  if (!isObject(capabilities)) throw new Error('MCP capabilities must be an object');

  const ui = readMcpUiExtensionCapability(capabilities);
  const extensions = Object.prototype.hasOwnProperty.call(capabilities, MCP_EXTENSIONS_CAPABILITY_KEY)
    ? capabilities[MCP_EXTENSIONS_CAPABILITY_KEY]
    : {};

  if (!isObject(extensions)) throw new Error('MCP capabilities.extensions must be an object when present');

  const ignoredOptionalExtensionIds = Object.keys(extensions)
    .filter((extensionId) => extensionId !== MCP_UI_EXTENSION_ID)
    .sort();

  return Object.freeze({
    ui,
    ignoredOptionalExtensionIds: Object.freeze(ignoredOptionalExtensionIds)
  });
}
