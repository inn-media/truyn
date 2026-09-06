import { normalizeMcpPromptName } from './prompts-client.js';

const DEFAULT_MAX_ARGUMENTS = 64;
const DEFAULT_MAX_ARGUMENT_VALUE_BYTES = 64 * 1024;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedName(value, label, maxLength = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || /\p{Cc}/u.test(value)) {
    throw new Error(`${label} must be a bounded non-empty string without control characters`);
  }
  return value;
}

export function validateMcpPromptArguments(promptDescriptor, argumentsValue = {}, {
  maxArguments = DEFAULT_MAX_ARGUMENTS,
  maxArgumentValueBytes = DEFAULT_MAX_ARGUMENT_VALUE_BYTES
} = {}) {
  if (!isObject(promptDescriptor)) throw new Error('MCP prompt descriptor must be an object');
  normalizeMcpPromptName(promptDescriptor.name);
  if (!Array.isArray(promptDescriptor.arguments ?? [])) throw new Error('MCP prompt descriptor arguments must be an array');
  if (!isObject(argumentsValue)) throw new Error('MCP prompt arguments must be an object');
  if (!Number.isSafeInteger(maxArguments) || maxArguments < 1) throw new Error('maxArguments must be a positive safe integer');
  if (!Number.isSafeInteger(maxArgumentValueBytes) || maxArgumentValueBytes < 1) throw new Error('maxArgumentValueBytes must be a positive safe integer');

  const descriptors = promptDescriptor.arguments ?? [];
  if (descriptors.length > maxArguments) throw new Error('MCP prompt descriptor exceeds argument limit');
  const declared = new Map();
  for (const argument of descriptors) {
    if (!isObject(argument)) throw new Error('MCP prompt argument descriptor must be an object');
    const name = boundedName(argument.name, 'MCP prompt argument name');
    if (declared.has(name)) throw new Error(`MCP prompt descriptor has duplicate argument name: ${name}`);
    if (argument.required !== undefined && typeof argument.required !== 'boolean') throw new Error(`MCP prompt argument ${name} required must be boolean`);
    declared.set(name, argument.required === true);
  }

  const supplied = Object.entries(argumentsValue);
  if (supplied.length > maxArguments) throw new Error('MCP prompt arguments exceed argument limit');
  const normalized = {};
  for (const [rawName, value] of supplied) {
    const name = boundedName(rawName, 'MCP prompt supplied argument name');
    if (!declared.has(name)) throw new Error(`MCP prompt argument is not declared: ${name}`);
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxArgumentValueBytes) {
      throw new Error(`MCP prompt argument ${name} must be a bounded string`);
    }
    normalized[name] = value;
  }

  for (const [name, required] of declared) {
    if (required && !Object.prototype.hasOwnProperty.call(normalized, name)) {
      throw new Error(`MCP prompt required argument is missing: ${name}`);
    }
  }
  return Object.freeze(normalized);
}

export function createMcpPromptSelectionClient(client) {
  if (!client || typeof client.getPrompt !== 'function') throw new Error('MCP prompt selection client requires getPrompt()');
  return Object.freeze({
    async getPromptFromDescriptor(promptDescriptor, {
      arguments: argumentsValue = {},
      inputResponses,
      requestState
    } = {}) {
      const name = normalizeMcpPromptName(promptDescriptor?.name);
      const normalizedArguments = validateMcpPromptArguments(promptDescriptor, argumentsValue);
      return client.getPrompt(name, {
        arguments: normalizedArguments,
        ...(inputResponses === undefined ? {} : { inputResponses }),
        ...(requestState === undefined ? {} : { requestState })
      });
    }
  });
}
