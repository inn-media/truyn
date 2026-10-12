import { PROTOCOL } from './index.js';

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function protocolGeneration(protocol) {
  // Only canonical, positive and safely representable TRUYN generations can
  // become a negotiated authority. Never treat arbitrary matching strings,
  // TRUYN/0, leading zeros or an imprecise integer as a protocol version.
  const match = /^TRUYN\/([1-9]\d*)$/.exec(protocol);
  if (!match) return -1;
  const generation = Number(match[1]);
  return Number.isSafeInteger(generation) ? generation : -1;
}

export function negotiateProtocol({
  localProtocols = [PROTOCOL],
  remoteProtocols = [],
  localSemantics = [],
  remoteSemantics = [],
  requiredSemantics = [],
  // For a future multiple-generation peer, bind semantics to each generation
  // explicitly. Legacy flat sets remain supported for the current RC1 fixture
  // and TRUYN/1-only wire surface; they do NOT prove cross-generation safety.
  localSemanticsByProtocol,
  remoteSemanticsByProtocol
} = {}) {
  const local = uniqueStrings(localProtocols);
  const remote = uniqueStrings(remoteProtocols);
  const common = local
    .filter((protocol) => protocolGeneration(protocol) > 0 && remote.includes(protocol))
    .sort((left, right) => protocolGeneration(right) - protocolGeneration(left) || left.localeCompare(right));

  if (common.length === 0) {
    return { ok: false, code: 'version_mismatch', reason: 'no_protocol_overlap' };
  }

  const selected = common[0];
  const scoped = localSemanticsByProtocol !== undefined || remoteSemanticsByProtocol !== undefined;
  const validMap = map => map && typeof map === 'object' && !Array.isArray(map)
    && Object.entries(map).every(([protocol,values]) =>
      protocolGeneration(protocol) > 0 && Array.isArray(values)
      && values.every(v => typeof v === 'string' && v.trim().length > 0));
  if (scoped && (!validMap(localSemanticsByProtocol) || !validMap(remoteSemanticsByProtocol)
    || !Object.hasOwn(localSemanticsByProtocol, selected)
    || !Object.hasOwn(remoteSemanticsByProtocol, selected))) {
    return { ok: false, code: 'version_mismatch', reason: 'invalid_semantic_advertisement' };
  }
  const localSemanticSet = new Set(uniqueStrings(
    scoped ? localSemanticsByProtocol[selected] : localSemantics));
  const remoteSemanticSet = new Set(uniqueStrings(
    scoped ? remoteSemanticsByProtocol[selected] : remoteSemantics));
  const required = uniqueStrings(requiredSemantics).sort();
  const missingSemantics = required.filter(
    (semantic) => !localSemanticSet.has(semantic) || !remoteSemanticSet.has(semantic)
  );

  if (missingSemantics.length > 0) {
    return {
      ok: false,
      code: 'version_mismatch',
      reason: 'required_semantic_unavailable',
      protocol: selected,
      missingSemantics
    };
  }

  const negotiatedSemantics = [...localSemanticSet]
    .filter((semantic) => remoteSemanticSet.has(semantic))
    .sort();

  return { ok: true, protocol: selected, semantics: negotiatedSemantics };
}
