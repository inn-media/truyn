export const ON_CALL_OWNERSHIP_DOMAINS = Object.freeze([
  'relay',
  'network-dht',
  'provider-runtimes',
  'authorization',
  'billing-entitlement',
  'semantic-retrieval',
  'external-a2a-mcp',
  'infrastructure',
  'security-rotation',
]);

export const DEFAULT_ESCALATION_POLICY = Object.freeze({
  SEV1: Object.freeze({ acknowledgeMinutes: 5, secondaryMinutes: 5, incidentCommanderMinutes: 10, serviceOwnerMinutes: 15 }),
  SEV2: Object.freeze({ acknowledgeMinutes: 15, secondaryMinutes: 15, incidentCommanderMinutes: 30, serviceOwnerMinutes: 30 }),
  SEV3: Object.freeze({ acknowledgeMinutes: 240, secondaryMinutes: 240, incidentCommanderMinutes: null, serviceOwnerMinutes: 480 }),
});

const HANDOFF_ITEMS = Object.freeze([
  'activeIncidentsReviewed',
  'activePagesAndSilencesReviewed',
  'errorBudgetsReviewed',
  'deploymentsAndChangesReviewed',
  'expiringRotationsReviewed',
  'openPostmortemsAndRisksReviewed',
]);

function requiredString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function instant(name, value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO-compatible timestamp`);
  return parsed;
}

export function validateOnCallRotation({ windows, ownership, escalation = DEFAULT_ESCALATION_POLICY } = {}) {
  if (!Array.isArray(windows) || windows.length === 0) throw new Error('at least one on-call window is required');
  if (!ownership || typeof ownership !== 'object') throw new Error('ownership map is required');
  for (const domain of ON_CALL_OWNERSHIP_DOMAINS) requiredString(`ownership.${domain}`, ownership[domain]);

  const normalized = windows.map((window, index) => {
    const primary = requiredString(`windows[${index}].primary`, window.primary);
    const secondary = requiredString(`windows[${index}].secondary`, window.secondary);
    if (primary === secondary) throw new Error(`windows[${index}] primary and secondary must be different humans`);
    const startsAt = instant(`windows[${index}].startsAt`, window.startsAt);
    const endsAt = instant(`windows[${index}].endsAt`, window.endsAt);
    if (endsAt <= startsAt) throw new Error(`windows[${index}] endsAt must be after startsAt`);
    return { ...window, primary, secondary, startsAt, endsAt };
  }).sort((a, b) => a.startsAt - b.startsAt);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].endsAt.getTime() !== normalized[index].startsAt.getTime()) {
      throw new Error('on-call windows must provide continuous coverage without gaps or overlaps');
    }
  }

  for (const [severity, policy] of Object.entries(escalation)) {
    if (!['SEV1', 'SEV2', 'SEV3'].includes(severity)) throw new Error(`unsupported severity ${severity}`);
    if (!Number.isFinite(policy.acknowledgeMinutes) || policy.acknowledgeMinutes <= 0) throw new Error(`${severity} acknowledgeMinutes must be positive`);
    if (!Number.isFinite(policy.secondaryMinutes) || policy.secondaryMinutes < policy.acknowledgeMinutes) throw new Error(`${severity} secondary escalation cannot precede acknowledgement deadline`);
  }

  return true;
}

export function recordOnCallHandoff({
  outgoingPrimary,
  incomingPrimary,
  incomingSecondary,
  checklist,
  acknowledgedBy,
  evidenceRef,
  at = new Date().toISOString(),
} = {}) {
  const outgoing = requiredString('outgoingPrimary', outgoingPrimary);
  const incoming = requiredString('incomingPrimary', incomingPrimary);
  const secondary = requiredString('incomingSecondary', incomingSecondary);
  if (incoming === secondary) throw new Error('incoming primary and secondary must be different humans');
  if (!Array.isArray(acknowledgedBy) || !acknowledgedBy.includes(incoming) || !acknowledgedBy.includes(secondary)) {
    throw new Error('handoff requires explicit acknowledgement from incoming primary and secondary');
  }
  for (const item of HANDOFF_ITEMS) {
    if (checklist?.[item] !== true) throw new Error(`handoff requires ${item}=true`);
  }
  const evidence = requiredString('evidenceRef', evidenceRef);
  return Object.freeze({
    type: 'on-call-handoff',
    at: instant('at', at).toISOString(),
    outgoingPrimary: outgoing,
    incomingPrimary: incoming,
    incomingSecondary: secondary,
    evidenceRef: evidence,
    checklist: Object.freeze({ ...checklist }),
  });
}

export const ON_CALL_HANDOFF_ITEMS = HANDOFF_ITEMS;
