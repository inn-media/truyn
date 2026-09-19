const OPERATIONS = Object.freeze(['ask', 'who']);
const SURFACES = Object.freeze(['rest', 'mcp', 'a2a']);

/**
 * S88: explicit NLWeb bridge matrix.
 *
 * NLWeb defines bounded ASK/WHO semantics; REST, MCP and A2A are transport /
 * interaction surfaces only. Every bridge therefore remains behind the same
 * canonical TRUYN authority, visibility, routing and provenance path. No cell
 * grants identity, tenant, provider, authorization, entitlement or billing
 * authority and no surface is allowed to widen discovery eligibility.
 */
export const NLWEB_BRIDGE_MATRIX = Object.freeze(
  OPERATIONS.flatMap((operation) => SURFACES.map((surface) => Object.freeze({
    operation,
    surface,
    capability: `nlweb.${operation}`,
    authority: 'canonical-truyn',
    visibility: operation === 'who' ? 'pre-return-filtered' : 'canonical-dispatch',
    provenance: 'preserved'
  })))
);

export function getNlwebBridge({ operation, surface } = {}) {
  if (!OPERATIONS.includes(operation)) throw new TypeError('operation must be ask or who');
  if (!SURFACES.includes(surface)) throw new TypeError('surface must be rest, mcp or a2a');
  return NLWEB_BRIDGE_MATRIX.find((entry) => entry.operation === operation && entry.surface === surface);
}

export function assertNlwebBridgeMatrix() {
  if (NLWEB_BRIDGE_MATRIX.length !== OPERATIONS.length * SURFACES.length) {
    throw new Error('NLWeb bridge matrix is incomplete');
  }
  const keys = new Set(NLWEB_BRIDGE_MATRIX.map(({ operation, surface }) => `${operation}:${surface}`));
  if (keys.size !== NLWEB_BRIDGE_MATRIX.length) throw new Error('NLWeb bridge matrix contains duplicate cells');
  for (const entry of NLWEB_BRIDGE_MATRIX) {
    if (entry.authority !== 'canonical-truyn' || entry.provenance !== 'preserved') {
      throw new Error('NLWeb bridge bypasses canonical TRUYN invariants');
    }
  }
  return true;
}
