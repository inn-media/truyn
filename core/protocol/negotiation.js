import { PROTOCOL } from './index.js';

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function protocolGeneration(protocol) {
  const match = /^TRUYN\/(\d+)$/.exec(protocol);
  return match ? Number(match[1]) : -1;
}

export function negotiateProtocol({
  localProtocols = [PROTOCOL],
  remoteProtocols = [],
  localSemantics = [],
  remoteSemantics = [],
  requiredSemantics = []
} = {}) {
  const local = uniqueStrings(localProtocols);
  const remote = uniqueStrings(remoteProtocols);
  const common = local
    .filter((protocol) => remote.includes(protocol))
    .sort((left, right) => protocolGeneration(right) - protocolGeneration(left) || left.localeCompare(right));

  if (common.length === 0) {
    return { ok: false, code: 'version_mismatch', reason: 'no_protocol_overlap' };
  }

  const selected = common[0];
  const localSemanticSet = new Set(uniqueStrings(localSemantics));
  const remoteSemanticSet = new Set(uniqueStrings(remoteSemantics));
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
