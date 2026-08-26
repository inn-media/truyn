import { randomUUID } from 'node:crypto';
import { createA2aClient } from '../a2a/client.js';
import { A2A_PROTOCOL_VERSION } from '../a2a/mapping.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAllowSkills(allowSkills) {
  if (allowSkills === undefined || allowSkills === null) return new Set();
  if (!Array.isArray(allowSkills)) throw new Error('allowSkills must be an array of exact A2A skill ids');
  return new Set(allowSkills.map((value) => String(value).trim()).filter(Boolean));
}

function defaultCapabilityName(skill, prefix) {
  return `${prefix}${skill.id}`;
}

function defaultMessageForInput(skill, input) {
  let parts;
  if (isObject(input) && Array.isArray(input.parts) && input.parts.length > 0) {
    parts = structuredClone(input.parts);
  } else if (typeof input === 'string') {
    parts = [{ text: input, mediaType: 'text/plain' }];
  } else if (isObject(input)) {
    parts = [{ data: structuredClone(input), mediaType: 'application/json' }];
  } else {
    parts = [{ data: { value: input ?? null }, mediaType: 'application/json' }];
  }
  return {
    messageId: randomUUID(),
    role: 'ROLE_USER',
    parts,
    metadata: {
      'io.truyn/skillId': skill.id
    }
  };
}

function validateMappedMessage(message, skillId) {
  if (!isObject(message)) throw new Error(`A2A skill ${skillId} mapInput must return a Message object`);
  if (message.role !== 'ROLE_USER') throw new Error(`A2A skill ${skillId} mapped Message must use ROLE_USER`);
  if (typeof message.messageId !== 'string' || !message.messageId) throw new Error(`A2A skill ${skillId} mapped Message requires messageId`);
  if (!Array.isArray(message.parts) || message.parts.length === 0) throw new Error(`A2A skill ${skillId} mapped Message requires parts`);
  return structuredClone(message);
}

export async function createA2aDiscoveryProvider({
  agentCardUrl,
  authHeaders = null,
  getAuthHeaders = null,
  allowSkills,
  filter,
  capabilityPrefix = 'a2a.',
  mapCapability,
  mapInput,
  useExtendedAgentCard = false,
  allowCrossOriginInterface = false,
  allowInsecureHttp = false,
  maxResponseBytes,
  taskTimeoutMs,
  pollIntervalMs,
  taskExecutionMode = 'blocking',
  fetchImpl = fetch
} = {}) {
  const allowed = normalizeAllowSkills(allowSkills);
  if (allowed.size === 0 && typeof filter !== 'function') {
    throw new Error('A2A discovery import requires an explicit allowSkills list or filter');
  }
  if (filter !== undefined && typeof filter !== 'function') throw new Error('filter must be a function');
  if (typeof capabilityPrefix !== 'string') throw new Error('capabilityPrefix must be a string');
  if (mapCapability !== undefined && typeof mapCapability !== 'function') throw new Error('mapCapability must be a function');
  if (mapInput !== undefined && typeof mapInput !== 'function') throw new Error('mapInput must be a function');

  const client = createA2aClient({
    agentCardUrl,
    authHeaders,
    getAuthHeaders,
    allowCrossOriginInterface,
    allowInsecureHttp,
    ...(maxResponseBytes !== undefined ? { maxResponseBytes } : {}),
    ...(taskTimeoutMs !== undefined ? { taskTimeoutMs } : {}),
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    taskExecutionMode,
    fetchImpl
  });
  const discovered = await client.discover({ extended: useExtendedAgentCard });
  const selected = [];
  const capabilityNames = new Set();

  for (const skill of discovered.card.skills) {
    if (allowed.size > 0 && !allowed.has(skill.id)) continue;
    if (filter && !(await filter(skill, discovered.card))) continue;
    const capability = mapCapability
      ? await mapCapability(skill, discovered.card)
      : defaultCapabilityName(skill, capabilityPrefix);
    if (typeof capability !== 'string' || capability.trim().length === 0) {
      throw new Error(`A2A skill ${skill.id} mapped to an invalid TRUYN capability`);
    }
    const normalizedCapability = capability.trim();
    if (capabilityNames.has(normalizedCapability)) throw new Error(`A2A skills map to duplicate TRUYN capability: ${normalizedCapability}`);
    capabilityNames.add(normalizedCapability);
    selected.push({ skill, capability: normalizedCapability });
  }

  if (selected.length === 0) throw new Error('No A2A skills selected after allowlist/filter');
  selected.sort((a, b) => a.capability.localeCompare(b.capability));
  const byCapability = new Map(selected.map((entry) => [entry.capability, entry.skill]));

  const remoteAgent = {
    name: discovered.card.name,
    version: discovered.card.version,
    provider: isObject(discovered.card.provider) ? structuredClone(discovered.card.provider) : null
  };

  return {
    name: 'a2a-discovery-import',
    version: '1',
    capabilities: selected.map(({ skill, capability }) => ({
      name: capability,
      description: skill.description || `Imported A2A skill ${skill.id}`,
      metadata: {
        interoperability: {
          protocol: 'a2a',
          protocolVersion: A2A_PROTOCOL_VERSION,
          remoteSkillId: skill.id,
          remoteAgent,
          inputModes: skill.inputModes || [],
          outputModes: skill.outputModes || [],
          taskExecutionMode
        }
      }
    })),
    discovery: {
      protocolVersion: A2A_PROTOCOL_VERSION,
      agentCardUrl: discovered.cardUrl,
      interface: structuredClone(discovered.interface),
      remoteAgent,
      extended: Boolean(useExtendedAgentCard),
      taskExecutionMode,
      selectedSkills: selected.map(({ skill, capability }) => ({ skill: skill.id, capability }))
    },
    async execute({ capability, input, need, policy }) {
      const skill = byCapability.get(capability);
      if (!skill) throw new Error(`Unknown imported A2A capability: ${capability}`);
      const mapped = mapInput
        ? await mapInput({ skill: structuredClone(skill), input: structuredClone(input), need, policy })
        : defaultMessageForInput(skill, input);
      const message = validateMappedMessage(mapped, skill.id);
      return client.execute({ skill, message });
    }
  };
}
