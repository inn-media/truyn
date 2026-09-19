function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalStringArray(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new TypeError(`${field} must be a non-empty array of non-empty strings`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

function boundedSignal(value, field) {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be a finite number between 0 and 1`);
  }
  return value;
}

export function parseNlwebWhoInput(input) {
  const bounded = requireObject(input, 'input');
  const query = optionalString(bounded.query, 'input.query');
  const capability = optionalString(bounded.capability, 'input.capability');
  const sites = optionalStringArray(bounded.sites, 'input.sites');
  const languages = optionalStringArray(bounded.languages, 'input.languages');
  if (query === undefined && capability === undefined && sites === undefined && languages === undefined) {
    throw new TypeError('input must contain at least one supported WHO semantic field');
  }
  const intent = {};
  if (query !== undefined) intent.query = query;
  if (capability !== undefined) intent.capability = capability;
  if (sites !== undefined) intent.sites = sites;
  if (languages !== undefined) intent.languages = languages;
  return Object.freeze(intent);
}

export function compileNlwebWhoConstraints(intent) {
  const semantic = requireObject(intent, 'intent');
  const constraints = {};
  if (semantic.capability !== undefined) constraints.capability = optionalString(semantic.capability, 'intent.capability');
  if (semantic.query !== undefined) constraints.search = Object.freeze({ text: optionalString(semantic.query, 'intent.query') });
  if (semantic.sites !== undefined) constraints.sites = optionalStringArray(semantic.sites, 'intent.sites');
  if (semantic.languages !== undefined) constraints.languages = optionalStringArray(semantic.languages, 'intent.languages');
  if (Object.keys(constraints).length === 0) throw new TypeError('intent must contain at least one supported WHO semantic field');
  return Object.freeze(constraints);
}

export function bindNlwebWhoAuthority({ who, authority } = {}) {
  const authoritativeState = requireObject(authority, 'authority');
  const intent = parseNlwebWhoInput(who);
  const constraints = compileNlwebWhoConstraints(intent);
  return Object.freeze({ authority: authoritativeState, constraints });
}

/**
 * Filter discovery candidates through trusted server-side capability visibility
 * and authorization decisions before anything is returned to NLWeb WHO.
 * Candidate metadata is never itself treated as authority.
 */
export async function filterNlwebWhoCandidates({ candidates, constraints, canView, authorize } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const bounded = requireObject(constraints, 'constraints');
  if (typeof canView !== 'function') throw new TypeError('canView must be a function');
  if (typeof authorize !== 'function') throw new TypeError('authorize must be a function');

  const eligible = [];
  for (const candidate of candidates) {
    const item = requireObject(candidate, 'candidate');
    if (bounded.capability !== undefined) {
      const capabilities = Array.isArray(item.capabilities) ? item.capabilities : [];
      if (!capabilities.includes(bounded.capability)) continue;
    }
    if (!(await canView(item))) continue;
    if (!(await authorize(item))) continue;
    eligible.push(item);
  }
  return Object.freeze(eligible);
}

/**
 * Deterministically choose one reference from an already-authorized candidate
 * universe. Bounded public health/trust signals may change ranking, but they
 * cannot discover, append, authorize, or otherwise widen that universe.
 */
export function selectNlwebReference({ eligible, signals = {} } = {}) {
  if (!Array.isArray(eligible)) throw new TypeError('eligible must be an array');
  if (eligible.length === 0) return null;
  const signalMap = requireObject(signals, 'signals');

  const ranked = eligible.map((candidate, index) => {
    const item = requireObject(candidate, 'eligible candidate');
    const id = optionalString(item.id, 'eligible candidate.id');
    const signal = signalMap[id] === undefined ? {} : requireObject(signalMap[id], `signals.${id}`);
    const health = boundedSignal(signal.health, `signals.${id}.health`);
    const trust = boundedSignal(signal.trust, `signals.${id}.trust`);
    return { item, index, id, score: health + trust };
  });
  ranked.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id) || left.index - right.index);
  return ranked[0].item;
}

/**
 * Compose a WHO-selected candidate into ASK execution without introducing an
 * NLWeb execution shortcut. The selected endpoint is only handed to execution
 * after the canonical server-side authority path positively authorizes the
 * exact selected candidate and request under trusted authority state.
 */
export async function composeNlwebWhoToAsk({ selected, ask, authority, authorizeExecution, execute } = {}) {
  const candidate = requireObject(selected, 'selected');
  const request = requireObject(ask, 'ask');
  const authoritativeState = requireObject(authority, 'authority');
  if (typeof authorizeExecution !== 'function') throw new TypeError('authorizeExecution must be a function');
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');

  const decision = await authorizeExecution({ candidate, request, authority: authoritativeState });
  if (decision !== true) {
    const error = new Error('canonical authority denied NLWeb WHO→ASK execution');
    error.code = 'AUTHORIZATION_DENIED';
    throw error;
  }

  return execute({ candidate, request, authority: authoritativeState });
}

/**
 * Preserve the already-normalized NLWeb structured response together with the
 * trusted TRUYN correlation/provenance that proves which authorized WHO
 * selection executed it. Caller-controlled response fields cannot replace the
 * server-side evidence object.
 */
export function preserveNlwebWhoAskEvidence({ selected, response, correlation, provenance } = {}) {
  const candidate = requireObject(selected, 'selected');
  const structuredResponse = requireObject(response, 'response');
  const trustedCorrelation = requireObject(correlation, 'correlation');
  const trustedProvenance = requireObject(provenance, 'provenance');
  const providerId = optionalString(candidate.id, 'selected.id');
  const requestId = optionalString(trustedCorrelation.requestId, 'correlation.requestId');
  const traceId = optionalString(trustedCorrelation.traceId, 'correlation.traceId');
  const executionId = optionalString(trustedProvenance.executionId, 'provenance.executionId');
  const source = optionalString(trustedProvenance.source, 'provenance.source');

  return Object.freeze({
    response: structuredResponse,
    correlation: Object.freeze({ requestId, traceId }),
    provenance: Object.freeze({ providerId, executionId, source })
  });
}
