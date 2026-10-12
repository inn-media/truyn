import { isDeepStrictEqual } from 'node:util';

const fault = code => Object.assign(new Error(code), { httpStatus: 503, publicCode: code });
// Dedicated container and Strong reads are mandatory for this profile. No
// session/eventual fallback, account keys, query bypass or physical deletion.
export function createCosmosDirectoryStore({ endpoint, database, container, getAccessToken,
  fetchImpl = fetch, timeoutMs = 10_000, maxBytes = 1_800_000 } = {}) {
  if (!/^https:\/\/[a-z0-9.-]+\.documents\.azure\.com\/?$/i.test(endpoint || '') ||
      ![database, container].every(v => typeof v === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(v)) ||
      typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 2048 || maxBytes > 1_800_000)
    throw fault('offer_directory_cosmos_configuration_required');
  const base = endpoint.replace(/\/$/, '') + `/dbs/${database}/colls/${container}/docs`;
  async function request(method, id, etag, document) {
    if (!/^g5-offer-directory-[a-f0-9]{64}$/.test(id || '')) throw fault('offer_directory_id_invalid');
    const controller = new AbortController(); let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(fault('offer_directory_store_timeout'));
    }, timeoutMs); });
    const bounded = promise => Promise.race([promise, deadline]);
    try {
      const token = await bounded(Promise.resolve().then(getAccessToken));
      if (typeof token !== 'string' || !token || Buffer.byteLength(token) > 16384)
        throw fault('offer_directory_auth_unavailable');
      const body = document === undefined ? undefined : JSON.stringify(document);
      if (body && Buffer.byteLength(body) > maxBytes) throw fault('offer_directory_capacity_reached');
      const response = await bounded(fetchImpl(base + (method === 'POST' ? '' : '/' + id), {
        method, redirect: 'error', signal: controller.signal,
        headers: { authorization: encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
          'x-ms-date': new Date().toUTCString(), 'x-ms-version': '2018-12-31',
          'x-ms-consistency-level': 'Strong', 'x-ms-documentdb-partitionkey': JSON.stringify([id]),
          accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}),
          ...(etag !== null && etag !== undefined ? { 'if-match': etag } : {}) }, body
      }));
      if ((method === 'POST' && response.status === 409) || (method === 'PUT' && response.status === 412)) return false;
      if (method === 'GET' && response.status === 404 && response.headers.get('x-ms-substatus') !== '1002') return null;
      if (![200,201].includes(response.status)) throw fault('offer_directory_store_unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw fault('offer_directory_invalid_response');
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const item = await bounded(reader.read());
          if (item.done) break;
          size += item.value.byteLength;
          if (size > maxBytes) { void reader.cancel().catch(() => {}); throw fault('offer_directory_response_too_large'); }
          chunks.push(Buffer.from(item.value));
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const currentEtag = response.headers.get('etag') || data?._etag;
      if (data?.id !== id || data.partitionKey !== id || typeof currentEtag !== 'string' || !currentEtag)
        throw fault('offer_directory_invalid_response');
      for (const key of ['_etag','_rid','_self','_attachments','_ts']) delete data[key];
      if (method !== 'GET' && !isDeepStrictEqual(data, document)) throw fault('offer_directory_commit_unknown');
      return method === 'GET' ? { document: data, etag: currentEtag } : true;
    } catch (error) {
      if (error?.httpStatus === 503) throw error;
      throw fault('offer_directory_store_unavailable');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    read: id => request('GET', id),
    cas(id, etag, document) {
      if (etag !== null && (typeof etag !== 'string' || !etag)) throw fault('offer_directory_etag_required');
      return request(etag === null ? 'POST' : 'PUT', id, etag, document);
    }
  });
}
