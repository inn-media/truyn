import { createHash } from 'node:crypto';
import { canonicalize, verifyEnvelope } from '../../core/protocol/index.js';
import { performance } from 'node:perf_hooks';

// Cosmos DB for NoSQL DATA PLANE, using Microsoft Entra only. Never accept
// account keys, connection strings or cross-host SQLite WAL as distributed CAS.
// Each logical direct NEED/OFFER/effect is one document/partition identity,
// so every state + signed outbox mutation is a single-document ETag CAS.
function fault(status, code) {
  const e = new Error(code);
  e.httpStatus = status;
  e.publicCode = code;
  return e;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const nonempty = x => typeof x === 'string' && x.length > 0 && x.length <= 4096;
const kinds = new Set(['NEED','RESULT','REVOKE','PARTIAL']);
const TERMINAL = new Set(['completed','cancelled','failed']);
const clean = value => structuredClone(value);
function partitionId(kind, id) { return `${kind}-${hash(id)}`; }
// A permanently retained allocation register bounds total managed entity IDs.
// Bootstrap is deliberately offline/explicit: never create/reset it on absence.
const CAPACITY_ID = 'g5-container-admission-v1';
const capacityKey = () => partitionId('capacity', CAPACITY_ID);
function validRecordCapacity(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 4096;
}
export function lifecycleRecordCapacityFromEnv(env = process.env) {
  const raw = env.TRUYN_G5_LIFECYCLE_RECORD_CAPACITY;
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,3}$/.test(raw) || !validRecordCapacity(Number(raw)))
    throw new Error('invalid TRUYN_G5_LIFECYCLE_RECORD_CAPACITY');
  return Number(raw);
}
// Generates a seed document, NOT an assertion of empty-container safety or a
// write operation. Install only in a dedicated empty/quiesced verified scope.
export function createLifecycleCapacityDocument({endpoint, database, container, recordCapacity} = {}) {
  if (typeof endpoint !== 'string' || !/^https:\/\/[a-z0-9.-]+\.documents\.azure\.com(?::443)?\/?$/i.test(endpoint) ||
      ![database, container].every(x => typeof x === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(x)) ||
      !validRecordCapacity(recordCapacity)) throw new Error('invalid lifecycle capacity configuration');
  const scope = endpoint.replace(/\/$/, '') + `/dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}/docs`;
  const key = capacityKey();
  return {id:key, partitionKey:key, schemaVersion:1, kind:'capacity', logicalId:CAPACITY_ID,
    version:1, ttl:-1, capacityVersion:1, scopeDigest:hash(scope), recordCapacity,
    tickets:[], reserved:0, createdAt:new Date().toISOString()};
}
function eventId(kind, id, event = null) {
  return kind === 'PARTIAL' ? `partial:${id}:${event?.sequence}` : `${kind.toLowerCase()}:${id}`;
}
// Preserve the exact JSON commitment used by the accepted OFFER ledger. The
// signed JSON is stored as a string so Cosmos property ordering cannot change it.
function signedOffer(envelope, { id, owner, fingerprint }) {
  const json = JSON.stringify(envelope);
  if (!json || Buffer.byteLength(json) > 128_000) throw fault(413, 'lifecycle_offer_too_large');
  const verified = verifyEnvelope(envelope, { allowedTypes: ['OFFER'] });
  const capability = envelope?.payload?.capability?.name || envelope?.payload?.capability;
  if (!verified.ok || envelope.id !== id || envelope.from !== owner ||
      hash(json) !== fingerprint || !nonempty(capability))
    throw fault(409, 'lifecycle_offer_integrity_mismatch');
  return { offerDirectoryVersion: 1, offerJson: json, offerCapability: capability };
}
function restoreSignedOffer(doc, owner) {
  if (doc.owner !== owner || doc.offerDirectoryVersion !== 1 || typeof doc.offerJson !== 'string')
    throw fault(503, 'lifecycle_offer_directory_invalid');
  let envelope;
  try { envelope = JSON.parse(doc.offerJson); }
  catch { throw fault(503, 'lifecycle_offer_directory_invalid'); }
  const checked = signedOffer(envelope, { id: doc.logicalId, owner, fingerprint: doc.fingerprint });
  if (checked.offerCapability !== doc.offerCapability) throw fault(503, 'lifecycle_offer_directory_invalid');
  return envelope;
}
function deliveryFor({kind, id, recipient, event}) {
  if (!kinds.has(kind) || !nonempty(recipient) || !event || event.kind !== kind) throw fault(400,'invalid_lifecycle_delivery');
  const serialized = JSON.stringify(event);
  if (serialized.length > 128_000) throw fault(413,'lifecycle_delivery_too_large');
  return { eventId:eventId(kind,id,event), recipient, kind, event:clean(event), acknowledgedAt:null };
}

export function createCosmosLifecycleLedger({
  endpoint, database, container, getAccessToken, fetchImpl = fetch,
  maxDocumentBytes = 850_000, maxDeliveriesPerNeed = 256, maxCasAttempts = 5,
  requestTimeoutMs = 10_000, recordCapacity = null
} = {}) {
  if (typeof endpoint !== 'string' || !/^https:\/\/[a-z0-9.-]+\.documents\.azure\.com(?::443)?\/?$/i.test(endpoint))
    throw new Error('Cosmos account HTTPS endpoint required (no emulator/keys)');
  if (![database,container].every(x=>typeof x==='string' && /^[a-zA-Z0-9._-]{1,100}$/.test(x)))
    throw new Error('Cosmos database/container identifiers required');
  if (typeof getAccessToken !== 'function') throw new Error('Microsoft Entra getAccessToken() required');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 2_147_483_647) throw new Error('invalid requestTimeoutMs');
  if (!Number.isSafeInteger(maxDocumentBytes) || maxDocumentBytes < 2048 || maxDocumentBytes > 1_800_000) throw new Error('invalid maxDocumentBytes');
  if (!Number.isSafeInteger(maxDeliveriesPerNeed) || maxDeliveriesPerNeed < 1 || maxDeliveriesPerNeed > 2048) throw new Error('invalid maxDeliveriesPerNeed');
  if (!Number.isSafeInteger(maxCasAttempts) || maxCasAttempts < 1 || maxCasAttempts > 20) throw new Error('invalid maxCasAttempts');
  if (recordCapacity !== null && !validRecordCapacity(recordCapacity)) throw new Error('invalid recordCapacity');
  const base = endpoint.replace(/\/$/,'') + `/dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}/docs`;
  // Remember one session watermark per physical partition range, never per logical ID.
  const physicalSessionTokens = new Map();
  // NEED IDs must leave room for the longest generated eventId prefix and
  // a safe-integer PARTIAL sequence suffix. No accepted event may be un-ACKable.
  const validNeedId = id => nonempty(id) && id.length <= 4070;
  function compoundQuerySession() {
    const token=[...physicalSessionTokens.values()].join(',');
    if(Buffer.byteLength(token)>8192) throw fault(503,'lifecycle_session_token_capacity_reached');
    return token || null;
  }
  function rememberSessionTokens(header) {
    if (!header) return;
    for (const entry of header.split(',')) {
      const part=entry.trim();
      if (!part || part.length>4096) throw fault(503,'lifecycle_session_token_invalid');
      const separator=part.indexOf(':');
      const range=separator>0 ? part.slice(0,separator) : 'opaque-test-range';
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(range)) throw fault(503,'lifecycle_session_token_invalid');
      physicalSessionTokens.set(range,part);
    }
  }

  async function api({method,path = '',partitionKey,body,etag,query = false,continuation = null,signal = null}) {
    if (!query && !nonempty(partitionKey)) throw fault(400,'invalid_partition_key');
    const payload = body == null ? undefined : JSON.stringify(body);
    if (payload && Buffer.byteLength(payload) > maxDocumentBytes) throw fault(503,'lifecycle_document_capacity_reached');
    // One budget includes Entra acquisition, headers and body. Aborting fetch
    // alone cannot bound a token callback or a transport/body that ignores it.
    const controller = new AbortController();
    const expiresAt = performance.now() + requestTimeoutMs;
    let expired = false, timeout;
    const deadline = new Promise((_,reject) => {
      timeout = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(fault(503,'lifecycle_ledger_unavailable'));
      },requestTimeoutMs);
    });
    const active = () => {
      if (expired || signal?.aborted || performance.now() >= expiresAt) {
        expired = true;
        controller.abort();
        throw fault(503,'lifecycle_ledger_unavailable');
      }
    };
    const bounded = async work => {
      active();
      // The factory is guarded before invocation: a late token must never
      // cause a POST after the original caller already observed a timeout.
      const value = await Promise.race([
        Promise.resolve().then(() => { active(); return work(); }), deadline
      ]);
      active();
      return value;
    };
    try {
      let token;
      try { token = await bounded(() => getAccessToken()); }
      catch { throw fault(503,'lifecycle_ledger_auth_unavailable'); }
      if (typeof token!=='string' || token.length===0 || Buffer.byteLength(token)>16384) throw fault(503,'lifecycle_ledger_auth_unavailable');
      const headers = {
        authorization: encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
        'x-ms-date': new Date().toUTCString(),
        'x-ms-version': '2018-12-31',
        ...(partitionKey ? {'x-ms-documentdb-partitionkey':JSON.stringify([partitionKey])}:{}),
        // CAS is supplied by the partition ETag; strong reads cannot be
        // requested on accounts provisioned for session consistency.
        'x-ms-consistency-level': 'Session',
        ...(compoundQuerySession() ? {'x-ms-session-token':compoundQuerySession()} : {}),
        ...(query ? {'x-ms-documentdb-isquery':'True','x-ms-documentdb-query-enablecrosspartition':'True','x-ms-max-item-count':'100'}:{}),
        ...(continuation ? {'x-ms-continuation':continuation}:{}),
        accept: 'application/json'
      };
      if (payload) headers['content-type'] = query ? 'application/query+json' : 'application/json';
      if (etag) headers['if-match'] = etag;
      const response = await bounded(() => fetchImpl(base + path, {
        method, headers, body:payload, signal:controller.signal, redirect:'error'
      }));
      if ([401,403].includes(response.status)) throw fault(503,'lifecycle_ledger_auth_denied');
      if ([408,429,449,500,502,503,504].includes(response.status)) throw fault(503,'lifecycle_ledger_unavailable');
      if (![200,201,204,404,409,412].includes(response.status)) throw fault(503,'lifecycle_ledger_protocol_error');
      const receivedSession = response.headers.get('x-ms-session-token');
      if (receivedSession) rememberSessionTokens(receivedSession);
      // A read-session-unavailable 404 (substatus 1002) is NOT proof of absence.
      if (response.status===404 && response.headers.get('x-ms-substatus')==='1002')
        throw fault(503,'lifecycle_session_unavailable');
      if (response.status === 404) return { status:404, doc:null, etag:null };
      const responseEtag = response.headers.get('etag');
      let doc=null;
      if (response.status !== 204) {
        try { doc=await bounded(() => response.json()); }
        catch {
          // A timeout, including an error-body timeout, is not a confirmed
          // failed write and must not enter mutate()'s CAS retry path.
          if (expired) throw fault(503,'lifecycle_ledger_unavailable');
          if (response.status<400) throw fault(503,'lifecycle_ledger_invalid_response');
        }
      }
      return {status:response.status,doc,etag:responseEtag || doc?._etag || null,continuation:response.headers.get('x-ms-continuation')};
    } catch (error) {
      if (Number.isInteger(error?.httpStatus)) throw error;
      throw fault(503,'lifecycle_ledger_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
  const locator=(kind,id)=>({
    id:partitionId(kind,id),
    partitionKey:partitionId(kind,id),
    path:`/${encodeURIComponent(partitionId(kind,id))}`
  });
  async function get(kind,id,signal=null) {
    if (!(kind==='need' ? validNeedId(id) : nonempty(id))) throw fault(400,'invalid_lifecycle_id');
    const p=locator(kind,id),response=await api({method:'GET',path:p.path,partitionKey:p.partitionKey,signal});
    if (response.status===404) return null;
    if (response.status!==200 || !response.doc || response.doc.schemaVersion!==1 || response.doc.kind!==kind || response.doc.logicalId!==id || response.doc.ttl!==-1 || !response.etag)
      throw fault(503,'lifecycle_ledger_invalid_response');
    return {...response.doc,_etag:response.etag};
  }
  function packed(doc) {
    // Never inherit a container-level TTL: replay and effect tombstones are
    // immutable even if operators enable a default container expiry.
    if (doc.ttl !== -1) throw fault(503,'lifecycle_tombstone_ttl_unsafe');
    const bytes=Buffer.byteLength(JSON.stringify(doc));
    // An unACKed null becomes a full ISO date on ACK. Reserve that space
    // now so that a committed signed event always remains acknowledgeable.
    const pending=Array.isArray(doc.deliveries) ? doc.deliveries.filter(x=>x.acknowledgedAt===null).length : 0;
    if(bytes+pending*24+128>maxDocumentBytes) throw fault(503,'lifecycle_document_capacity_reached');
    return doc;
  }
  function validateCapacity(doc) {
    if (!doc || doc.id !== capacityKey() || doc.partitionKey !== capacityKey() ||
        doc.schemaVersion !== 1 || doc.kind !== 'capacity' || doc.logicalId !== CAPACITY_ID ||
        doc.ttl !== -1 || doc.capacityVersion !== 1 || doc.scopeDigest !== hash(base) ||
        doc.recordCapacity !== recordCapacity || !Number.isSafeInteger(doc.version) ||
        doc.version < 1 || doc.version >= Number.MAX_SAFE_INTEGER ||
        !Array.isArray(doc.tickets) || doc.tickets.length > recordCapacity ||
        doc.reserved !== doc.tickets.length || new Set(doc.tickets).size !== doc.tickets.length ||
        doc.tickets.some(key => typeof key !== 'string' || !/^(need|offer|effect|offer-owner)-[a-f0-9]{64}$/.test(key)))
      throw fault(503, 'lifecycle_capacity_contract_invalid');
    return doc;
  }
  async function reserveCreationCapacity(kind, id) {
    if (recordCapacity === null) return;
    const ticket = partitionId(kind, id);
    let result;
    try {
      result = await mutate('capacity', CAPACITY_ID, doc => {
        validateCapacity(doc);
        if (doc.tickets.includes(ticket)) return null;
        if (doc.reserved >= recordCapacity) throw fault(503, 'lifecycle_global_capacity_reached');
        doc.tickets.push(ticket);
        doc.reserved = doc.tickets.length;
        return doc;
      });
    } catch (error) {
      if (error.httpStatus === 404) throw fault(503, 'lifecycle_capacity_not_initialized');
      throw error;
    }
    const saved = validateCapacity(result.row);
    if (!saved.tickets.includes(ticket)) throw fault(503, 'lifecycle_capacity_commit_unverified');
  }
  async function create(kind,id,data) {
    const p=locator(kind,id);
    const doc=packed({id:p.id,partitionKey:p.partitionKey,schemaVersion:1,kind,logicalId:id,version:1,
      createdAt:new Date().toISOString(),ttl:-1,...data});
    // Allocation precedes entity creation. An ambiguous reply burns capacity
    // safely; no entity POST follows it. Tickets are never freed by compaction.
    await reserveCreationCapacity(kind, id);
    const r=await api({method:'POST',partitionKey:p.partitionKey,body:doc});
    if (r.status===409) throw fault(409,kind==='need'?'duplicate_request':kind==='offer'?'duplicate_offer':'duplicate_effect');
    if (r.status!==201 && r.status!==200) throw fault(503,'lifecycle_ledger_unavailable');
    return r.doc || doc;
  }
  async function mutate(kind,id,callback,signal=null) {
    for(let attempt=0;attempt<maxCasAttempts;attempt++) {
      const current=await get(kind,id,signal);
      if (!current) throw fault(404,'lifecycle_not_found');
      const next=callback(clean(current));
      if (next===null) return {changed:false,row:current};
      const p=locator(kind,id);
      next.version=current.version+1;
      delete next._etag;
      next.ttl=-1;
      packed(next);
      const r=await api({method:'PUT',path:p.path,partitionKey:p.partitionKey,etag:current._etag,body:next,signal});
      if (r.status===412) continue;
      if (r.status!==200) throw fault(503,'lifecycle_ledger_unavailable');
      return {changed:true,row:r.doc || next};
    }
    throw fault(503,'lifecycle_cas_contention');
  }
  // Recoverable snapshots share one bounded owner admission index across replicas.
  // Claim before CREATE; ambiguity keeps the slot reserved. Revocation releases
  // only the owner's active slot; global replay/capacity tombstones are retained.
  function validateOfferOwner(doc, owner) {
    if (doc.owner !== owner || doc.slotLimit !== 128 || !Array.isArray(doc.offerSlots) ||
        doc.offerSlots.length > 128 || doc.offerSlots.some(slot => !nonempty(slot?.id) || !nonempty(slot?.fingerprint)) ||
        new Set(doc.offerSlots.map(slot => slot.id)).size !== doc.offerSlots.length)
      throw fault(503, 'lifecycle_offer_owner_index_invalid');
  }
  async function claimOfferSlot({id,owner,fingerprint}) {
    if (!await get('offer-owner',owner)) {
      try { await create('offer-owner',owner,{owner,slotLimit:128,offerSlots:[]}); }
      catch(error) { if(error.httpStatus !== 409) throw error; }
    }
    await mutate('offer-owner',owner,doc=>{
      validateOfferOwner(doc,owner);
      const existing=doc.offerSlots.find(slot=>slot.id===id);
      if(existing) {
        if(existing.fingerprint!==fingerprint) throw fault(409,'lifecycle_offer_integrity_mismatch');
        return null;
      }
      if(doc.offerSlots.length>=doc.slotLimit) throw fault(503,'lifecycle_offer_owner_capacity_reached');
      doc.offerSlots.push({id,fingerprint}); return doc;
    });
  }
  async function releaseRevokedOfferSlot(offer) {
    if(offer.offerDirectoryVersion!==1) return;
    await mutate('offer-owner',offer.owner,doc=>{
      validateOfferOwner(doc,offer.owner);
      const slot=doc.offerSlots.find(entry=>entry.id===offer.logicalId);
      if(!slot) return null;
      if(slot.fingerprint!==offer.fingerprint) throw fault(503,'lifecycle_offer_owner_index_invalid');
      doc.offerSlots=doc.offerSlots.filter(entry=>entry.id!==offer.logicalId);
      return doc;
    });
  }
  function authorize(doc,{requester,provider}) {
    if (requester && doc.requester!==requester) throw fault(403,'not_request_owner');
    if (provider && doc.provider!==provider) throw fault(403,'provider_mismatch');
  }
  function appendDelivery(doc,delivery,expectedKind,recipient) {
    if (delivery==null) return;
    if (delivery.kind!==expectedKind || delivery.recipient!==recipient) throw fault(400,'invalid_lifecycle_delivery');
    if (doc.deliveries.length>=maxDeliveriesPerNeed) throw fault(503,'lifecycle_outbox_capacity_reached');
    const item=deliveryFor({...delivery,id:doc.logicalId});
    if (doc.deliveries.some(e=>e.eventId===item.eventId)) throw fault(409,'delivery_already_recorded');
    doc.deliveries.push(item);
  }
  return Object.freeze({
    kind:'cosmos-multi-host-v1',
    async verifyCapacityContract() {
      if (recordCapacity === null) return {enabled:false};
      const row = await get('capacity', CAPACITY_ID);
      if (!row) throw fault(503, 'lifecycle_capacity_not_initialized');
      const saved = validateCapacity(row);
      return {enabled:true,recordCapacity,reserved:saved.reserved,tombstonesRecyclable:false};
    },
    // Internal same-container receipt writes share this ledger's session cache.
    // This is not an HTTP/SDK endpoint and conveys no authorization capability.
    receiptSession: Object.freeze({
      scope: base,
      requestHeaders() {
        const token = compoundQuerySession();
        return token ? { 'x-ms-session-token': token } : {};
      },
      observeResponse(response) {
        const token = response.headers?.get?.('x-ms-session-token');
        if (token) rememberSessionTokens(token);
      }
    }),
    async getNeed(id){const doc=await get('need',id);if(!doc)return null;return {
      ...doc,status:doc.status,created_at:doc.createdAt,terminal_at:doc.terminalAt,
      partial_sequence:doc.partialSequence,partial_digest:doc.partialDigest
    };},
    async getOffer(id){return get('offer',id);},
    async getEffect(id){return get('effect',id);},
    async reserveNeed({id,requester,provider,fingerprint,capability,mode,scope,policyDigest,delivery=null}) {
      if (!validNeedId(id) || ![requester,provider,fingerprint,capability,mode,scope,policyDigest].every(nonempty)) throw fault(400,'invalid_lifecycle_reservation');
      const data={requester,provider,fingerprint,capability,mode,scope,policyDigest,status:'matched',
        terminalAt:null,partialSequence:0,partialDigest:null,deliveries:[]};
      if(delivery) appendDelivery({...data,logicalId:id},delivery,'NEED',provider);
      // appendDelivery mutates the temporary data object because its deliveries array is shared.
      return create('need',id,data);
    },
    async reserveOffer({id,owner,fingerprint,envelope=null}) {
      if(![id,owner,fingerprint].every(nonempty)) throw fault(400,'invalid_offer_reservation');
      const projection = envelope == null ? {} : signedOffer(envelope, { id, owner, fingerprint });
      if(envelope!=null) {
        if(await get('offer',id)) throw fault(409,'duplicate_offer');
        await claimOfferSlot({id,owner,fingerprint});
      }
      return create('offer',id,{owner,fingerprint,revoked:0,...projection});
    },
    async restoreOffers({owner,limit=128}) {
      if (!nonempty(owner) || !Number.isSafeInteger(limit) || limit < 1 || limit > 128)
        throw fault(400, 'invalid_offer_directory_query');
      const output = [], seen = new Set(), cursors = new Set();
      let continuation = null;
      for (let page = 0; page < 50; page++) {
        const query = { query: 'SELECT VALUE c FROM c WHERE c.kind = "offer" AND c.owner = @owner AND c.revoked = 0 AND c.offerDirectoryVersion = 1',
          parameters: [{ name: '@owner', value: owner }] };
        const result = await api({method:'POST',query:true,body:query,continuation});
        if (result.status !== 200 || !Array.isArray(result.doc?.Documents) || result.doc.Documents.length > 100)
          throw fault(503, 'lifecycle_offer_directory_invalid');
        for (const hint of result.doc.Documents) {
          if (hint?.kind !== 'offer' || hint.owner !== owner || !nonempty(hint.logicalId))
            throw fault(503, 'lifecycle_offer_directory_invalid');
          if (seen.has(hint.logicalId)) continue;
          if (seen.size >= 128) throw fault(503, 'lifecycle_offer_scan_capacity_reached');
          seen.add(hint.logicalId);
          const fenced = await mutate('offer', hint.logicalId, doc => {
            if (doc.owner !== owner) throw fault(403, 'not_target_owner');
            if (doc.revoked) return null;
            restoreSignedOffer(doc, owner);
            return doc;
          });
          if (fenced.row.revoked) continue;
          if (output.length >= limit) throw fault(503, 'lifecycle_offer_scan_capacity_reached');
          output.push(restoreSignedOffer(fenced.row, owner));
        }
        if (!result.continuation) return output;
        if (typeof result.continuation !== 'string' || result.continuation.length > 8192 || cursors.has(result.continuation))
          throw fault(503, 'lifecycle_offer_directory_cursor_invalid');
        cursors.add(result.continuation);
        continuation = result.continuation;
      }
      throw fault(503, 'lifecycle_offer_scan_capacity_reached');
    },
    // Compact only ACKed streaming PARTIAL payloads. The signed NEED, terminal
    // RESULT and REVOKE are retained for recovery, accounting and cancellation
    // reconciliation; tombstone IDs/fingerprints are never recycled.
    async compactNeed({id,requester}) {
      if (!validNeedId(id) || !nonempty(requester)) throw fault(400, 'invalid_lifecycle_compaction');
      const result = await mutate('need', id, doc => {
        authorize(doc, {requester});
        if (!TERMINAL.has(doc.status)) throw fault(409, 'lifecycle_compaction_requires_terminal');
        if (!Array.isArray(doc.deliveries)) throw fault(503, 'lifecycle_ledger_invalid_response');
        let changed = false;
        for (const event of doc.deliveries) {
          if (event.kind !== 'PARTIAL' || event.acknowledgedAt == null || event.event === null) continue;
          if (!Number.isFinite(Date.parse(event.acknowledgedAt)) || !event.event)
            throw fault(503, 'lifecycle_ledger_invalid_response');
          event.eventDigest = hash(JSON.stringify(event.event));
          event.event = null;
          event.payloadCompactedAt = new Date().toISOString();
          changed = true;
        }
        return changed ? doc : null;
      });
      return {compacted:result.changed,terminal:result.row.status,tombstoneRetained:true};
    },
    async compactOffer({id,owner}) {
      if (![id,owner].every(nonempty)) throw fault(400, 'invalid_lifecycle_compaction');
      const result = await mutate('offer', id, doc => {
        if (doc.owner !== owner) throw fault(403, 'not_target_owner');
        if (!doc.revoked) throw fault(409, 'lifecycle_compaction_requires_revocation');
        if (doc.offerJson == null) return null;
        restoreSignedOffer(doc, owner);
        delete doc.offerJson;
        doc.payloadCompactedAt = new Date().toISOString();
        return doc;
      });
      return {compacted:result.changed,revoked:true,tombstoneRetained:true};
    },
    async revokeOffer({id,owner}) {
      const result=await mutate('offer',id,doc=>{
        if(doc.owner!==owner) throw fault(403,'not_target_owner');
        if(doc.revoked) return null;
        doc.revoked=1;
        return doc;
      });
      await releaseRevokedOfferSlot(result.row);
      return result;
    },
    async transitionNeed({id,requester,provider,to,delivery=null}) {
      if(!TERMINAL.has(to)) throw fault(400,'invalid_lifecycle_transition');
      return mutate('need',id,doc=>{
        authorize(doc,{requester,provider});
        if(doc.status!=='matched') {
          if(to==='cancelled' && doc.status==='cancelled') return null;
          throw fault(409,doc.status==='cancelled'?'request_cancelled':doc.status==='failed'?'request_failed':'request_already_completed');
        }
        if(to==='failed' && delivery) throw fault(400,'invalid_lifecycle_delivery');
        if(to==='completed') appendDelivery(doc,delivery,'RESULT',doc.requester);
        if(to==='cancelled') appendDelivery(doc,delivery,'REVOKE',doc.provider);
        doc.status=to;
        doc.terminalAt=new Date().toISOString();
        return doc;
      });
    },
    // Explicit recovery only. One NEED-document CAS commits both operational
    // token usage and the signed RESULT outbox item. This is NOT vendor billing.
    async commitRecoveredResult({need,provider,delivery,receiptDigest,signal} = {}) {
      if (!need || need.type!=='NEED' || need.compact || need.chain ||
          !verifyEnvelope(need,{allowedTypes:['NEED']}).ok || !nonempty(provider) ||
          !/^[a-f0-9]{64}$/.test(receiptDigest || '')) throw fault(400,'invalid_recovered_result');
      // Detach caller-owned data before the first await.
      need=clean(need); delivery=clean(delivery);
      const signed=delivery?.event?.envelope;
      if (delivery?.kind!=='RESULT' || delivery.recipient!==need.from ||
          delivery.event.kind!=='RESULT' || signed?.type!=='RESULT' ||
          !verifyEnvelope(signed,{allowedTypes:['RESULT']}).ok ||
          signed.from!==provider || signed.to!==need.from || signed.payload?.requestId!==need.id ||
          typeof signed.payload.output!=='string') throw fault(400,'invalid_recovered_result');
      const effect=await get('effect',need.id,signal);
      const effectFingerprint=hash(JSON.stringify([need.id,need.from,need.payload]));
      if (!effect || effect.requester!==need.from || effect.provider!==provider ||
          effect.fingerprint!==effectFingerprint || !['started','unknown','completed'].includes(effect.status))
        throw fault(409,'effect_identity_conflict');
      const receipt=effect.effectReceipt, u=receipt?.usage;
      if (receipt?.version!==1 || receipt.provider!=='azure-openai' ||
          !/^resp_[a-zA-Z0-9_-]{1,200}$/.test(receipt.responseId || '') ||
          !nonempty(receipt.model) || receipt.model.length>256 ||
          !/^[a-f0-9]{64}$/.test(receipt.scopeDigest || '') ||
          receipt.outputDigest!==hash(signed.payload.output) ||
          !u || !['input_tokens','output_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0) ||
          !Number.isSafeInteger(u.input_tokens+u.output_tokens) || u.input_tokens+u.output_tokens!==u.total_tokens ||
          hash(canonicalize(receipt))!==receiptDigest)
        throw fault(409,'effect_receipt_unverified');
      const expectedMetadata={provider:'azure-openai',usage:clean(u),receiptDigest,
        recovered:true,usageAccounting:'operational-only',providerInvoiceVerified:false,accountingSettled:false};
      if(signed.id!=='g5-recovered-'+hash(need.id) || signed.createdAt!==effect.receiptCapturedAt ||
          canonicalize(signed.payload.metadata)!==canonicalize(expectedMetadata))
        throw fault(409,'invalid_recovered_usage_metadata');
      const usageRecord={schema:'truyn.g5.recovered-usage/v1',requestId:need.id,
        requester:need.from,provider,effectFingerprint,receiptDigest,
        inputTokens:u.input_tokens,outputTokens:u.output_tokens,totalTokens:u.total_tokens,
        resultDigest:hash(canonicalize(delivery.event)),vendorChargeVerified:false};
      const result=await mutate('need',need.id,doc=>{
        if(signal?.aborted) throw fault(409,'recovered_result_aborted');
        const original=doc.deliveries.find(d=>d.kind==='NEED')?.event?.envelope;
        if(doc.mode!=='legacy' || doc.requester!==need.from || doc.provider!==provider ||
            doc.scope!==need.from || !original ||
            doc.fingerprint!==hash(JSON.stringify(original)) ||
            canonicalize(original)!==canonicalize(need)) throw fault(409,'recovered_need_binding_mismatch');
        if(doc.status==='completed' && doc.recoveredUsage){
          const terminal=doc.deliveries.filter(d=>d.kind==='RESULT');
          if(canonicalize(doc.recoveredUsage)!==canonicalize(usageRecord) || terminal.length!==1 ||
              hash(canonicalize(terminal[0].event))!==usageRecord.resultDigest)
            throw fault(409,'recovered_result_conflict');
          return null; // Includes ACKed terminals: never recreate or un-ACK them.
        }
        if(doc.status!=='matched') throw fault(409,doc.status==='cancelled'?'request_cancelled':
          doc.status==='failed'?'request_failed':'request_already_completed');
        if(doc.recoveredUsage) throw fault(409,'recovered_result_conflict');
        appendDelivery(doc,delivery,'RESULT',doc.requester);
        doc.recoveredUsage=usageRecord;
        doc.status='completed';doc.terminalAt=new Date().toISOString();
        return doc;
      },signal);
      if(result.row.status!=='completed' || !result.row.recoveredUsage ||
          canonicalize(result.row.recoveredUsage)!==canonicalize(usageRecord) ||
          result.row.deliveries.filter(d=>d.kind==='RESULT').length!==1 ||
          hash(canonicalize(result.row.deliveries.find(d=>d.kind==='RESULT').event))!==usageRecord.resultDigest)
        throw fault(503,'recovered_result_commit_unverified');
      return {recorded:true,idempotent:!result.changed,usageRecord:clean(result.row.recoveredUsage),
        resultQueued:!result.row.deliveries.find(d=>d.kind==='RESULT').acknowledgedAt,
        terminalDelivered:false,providerInvoiceVerified:false,accountingSettled:false};
    },
    async acceptPartial({id,provider,sequence,digest,delivery=null}) {
      if(!nonempty(provider)) throw fault(400,'invalid_partial_provider');
      if(!Number.isSafeInteger(sequence)||sequence<0||!nonempty(digest)) throw fault(400,'invalid_partial_sequence');
      let idempotent=false,previousDigest=null;
      const result=await mutate('need',id,doc=>{
        authorize(doc,{provider});
        if(doc.status!=='matched') throw fault(409,doc.status==='cancelled'?'request_cancelled':doc.status==='failed'?'request_failed':'request_already_completed');
        if(sequence===doc.partialSequence-1 && digest===doc.partialDigest){idempotent=true;return null;}
        if(sequence!==doc.partialSequence) throw fault(409,'partial_sequence_mismatch');
        previousDigest=doc.partialDigest;
        if(!delivery) throw fault(400,'partial_delivery_required');
        if(delivery.event?.sequence!==sequence || delivery.event?.requestId!==id) throw fault(400,'invalid_partial_delivery');
        appendDelivery(doc,delivery,'PARTIAL',doc.requester);
        doc.partialSequence++;
        doc.partialDigest=digest;
        return doc;
      });
      return {idempotent:result.changed===false || idempotent,previousDigest};
    },
    async beginEffect({id,requester,provider,fingerprint}) {
      if(![id,requester,provider,fingerprint].every(nonempty)) throw fault(400,'invalid_effect_intent');
      try {
        await create('effect',id,{requester,provider,fingerprint,status:'started',terminalAt:null});
        return {acquired:true,existing:null};
      } catch(error) {
        if(error.httpStatus!==409) throw error;
        const existing=await get('effect',id);
        if(!existing) throw fault(503,'lifecycle_ledger_unavailable');
        if(existing.requester!==requester||existing.provider!==provider||existing.fingerprint!==fingerprint) throw fault(409,'effect_identity_conflict');
        return {acquired:false,existing};
      }
    },
    async finishEffect({id,provider,outcome}) {
      if(!['completed','failed','unknown'].includes(outcome)) throw fault(400,'invalid_effect_outcome');
      return mutate('effect',id,doc=>{
        if(doc.provider!==provider) throw fault(403,'provider_mismatch');
        if(doc.status!=='started') return null;
        doc.status=outcome;doc.terminalAt=new Date().toISOString();return doc;
      });
    },
    async acknowledgeDelivery({eventId,recipient}) {
      if(![eventId,recipient].every(nonempty)) throw fault(400,'invalid_delivery_ack');
      const separator=eventId.indexOf(':');
      if(separator<=0) throw fault(400,'invalid_delivery_ack');
      const prefix=eventId.slice(0,separator);
      if(!['need','result','revoke','partial'].includes(prefix)) throw fault(400,'invalid_delivery_ack');
      let id=eventId.slice(separator+1);
      if(prefix==='partial'){
        const last=id.lastIndexOf(':');
        if(last<=0 || !/^(0|[1-9]\d*)$/.test(id.slice(last+1))) throw fault(400,'invalid_delivery_ack');
        id=id.slice(0,last);
      }
      if(!nonempty(id)) throw fault(400,'invalid_delivery_ack');
      const result=await mutate('need',id,doc=>{
        const event=doc.deliveries.find(x=>x.eventId===eventId);
        if(!event||event.recipient!==recipient) throw fault(404,'delivery_not_found');
        if(event.acknowledgedAt) return null;
        event.acknowledgedAt=new Date().toISOString();
        return doc;
      });
      return {acknowledged:true,idempotent:!result.changed};
    },
    async pendingDeliveries({recipient,limit=32}) {
      if(!nonempty(recipient)||!Number.isSafeInteger(limit)||limit<1||limit>100) throw fault(400,'invalid_delivery_query');
      const output=[];let continuation=null;
      // Each page comes from Cosmos, never from one replica's local memory.
      // The shared container MUST index deliveries[].recipient/acknowledgedAt.
      for(let page=0;page<50;page++) {
        const query={query:'SELECT VALUE c FROM c WHERE c.kind = "need" AND EXISTS (SELECT VALUE e FROM e IN c.deliveries WHERE e.recipient = @recipient AND IS_NULL(e.acknowledgedAt) AND (e.kind != "NEED" OR c.status = "matched"))',
          parameters:[{name:'@recipient',value:recipient}]};
        const r=await api({method:'POST',query:true,body:query,continuation});
        if(r.status!==200 || !Array.isArray(r.doc?.Documents)) throw fault(503,'lifecycle_outbox_query_invalid');
        for(const doc of r.doc.Documents) {
          if(doc.kind!=='need' || !Array.isArray(doc.deliveries)) throw fault(503,'lifecycle_outbox_query_invalid');
          for(const d of doc.deliveries) {
            if(d.recipient!==recipient || d.acknowledgedAt!==null) continue;
            if(d.kind==='NEED' && doc.status!=='matched') continue;
            output.push({eventId:d.eventId,kind:d.kind,requestId:doc.logicalId,event:d.event,createdAt:doc.createdAt});
            if(output.length>=limit) return output; // Bounded resumable ACK batches; remaining records are never discarded.
          }
        }
        if(!r.continuation) return output;
        continuation=r.continuation;
      }
      throw fault(503,'lifecycle_outbox_scan_capacity_reached');
    },
    // Rolling back a committed distributed signed streaming frame could race
    // remote receiver consumption. Keep it durably pending for explicit ACK.
    async rollbackPartial() {throw fault(503,'distributed_partial_rollback_not_safe');}
  });
}
