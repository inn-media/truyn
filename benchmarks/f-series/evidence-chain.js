import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashRecord(record, previousHash = null) {
  return createHash('sha256')
    .update(canonicalJson({ previousHash, record }))
    .digest('hex');
}

export function appendHashChain(records) {
  let previousHash = null;
  return records.map((record, index) => {
    const hash = hashRecord(record, previousHash);
    const out = { index, previousHash, hash, record };
    previousHash = hash;
    return out;
  });
}

export function verifyHashChain(chain) {
  let previousHash = null;
  for (let i = 0; i < chain.length; i++) {
    const row = chain[i];
    if (row.index !== i || row.previousHash !== previousHash) return false;
    if (row.hash !== hashRecord(row.record, previousHash)) return false;
    previousHash = row.hash;
  }
  return true;
}
