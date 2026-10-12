from pathlib import Path
import hashlib

def blob(s):
    b=s.encode();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
files={
 'network/relay/cosmos-lifecycle-ledger.js':('1ef5d7cd3cde33ad1f6e82d09f83da7895fd6e20','51772f59569d04a518cd435a244704f24a0db580'),
 'runtime/g5-provider-effect-ledger.js':('e660af9c3966427ab4db39c8760053e66cca98d8','b0e8f645f6169defaa49e1ac1758a0a8aaed00c2'),
 'runtime/g5-relay-lifecycle-ledger.js':('76dec013a0acb85ef316a28717091748c817cd7c','11e4770f72ff6fce2aa4ccce4fc741f475bc73e8')
}
sources={p:Path(p).read_text() for p in files}
for p,s in sources.items():
    if blob(s)!=files[p][0]:raise SystemExit('SOURCE_CHANGED:'+p)
s=sources['network/relay/cosmos-lifecycle-ledger.js']
anchor="function eventId(kind, id, event = null) {"
new=r'''// A permanently retained allocation register bounds total managed entity IDs.
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
'''
assert anchor in s;s=s.replace(anchor,new+anchor)
s=s.replace('requestTimeoutMs = 10_000\n} = {}) {','requestTimeoutMs = 10_000, recordCapacity = null\n} = {}) {',1)
anchor="  const base = endpoint.replace(/\\/$/,'')"
assert anchor in s;s=s.replace(anchor,"  if (recordCapacity !== null && !validRecordCapacity(recordCapacity)) throw new Error('invalid recordCapacity');\n"+anchor,1)
anchor='  async function create(kind,id,data) {'
new='''  function validateCapacity(doc) {
    if (!doc || doc.id !== capacityKey() || doc.partitionKey !== capacityKey() ||
        doc.schemaVersion !== 1 || doc.kind !== 'capacity' || doc.logicalId !== CAPACITY_ID ||
        doc.ttl !== -1 || doc.capacityVersion !== 1 || doc.scopeDigest !== hash(base) ||
        doc.recordCapacity !== recordCapacity || !Number.isSafeInteger(doc.version) ||
        doc.version < 1 || doc.version >= Number.MAX_SAFE_INTEGER ||
        !Array.isArray(doc.tickets) || doc.tickets.length > recordCapacity ||
        doc.reserved !== doc.tickets.length || new Set(doc.tickets).size !== doc.tickets.length ||
        doc.tickets.some(key => typeof key !== 'string' || !/^(need|offer|effect)-[a-f0-9]{64}$/.test(key)))
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
'''
assert anchor in s;s=s.replace(anchor,new+anchor)
anchor="      createdAt:new Date().toISOString(),ttl:-1,...data});\n    const r=await api({method:'POST'"
assert anchor in s;s=s.replace(anchor,"      createdAt:new Date().toISOString(),ttl:-1,...data});\n    // Allocation precedes entity creation. An ambiguous reply burns capacity\n    // safely; no entity POST follows it. Tickets are never freed by compaction.\n    await reserveCreationCapacity(kind, id);\n    const r=await api({method:'POST'",1)
anchor="    kind:'cosmos-multi-host-v1',\n"
new='''    async verifyCapacityContract() {
      if (recordCapacity === null) return {enabled:false};
      const row = await get('capacity', CAPACITY_ID);
      if (!row) throw fault(503, 'lifecycle_capacity_not_initialized');
      const saved = validateCapacity(row);
      return {enabled:true,recordCapacity,reserved:saved.reserved,tombstonesRecyclable:false};
    },
'''
assert anchor in s;s=s.replace(anchor,anchor+new,1)
sources['network/relay/cosmos-lifecycle-ledger.js']=s
for file in ['runtime/g5-provider-effect-ledger.js','runtime/g5-relay-lifecycle-ledger.js']:
    s=sources[file];s=s.replace('import { createCosmosLifecycleLedger }','import { createCosmosLifecycleLedger, lifecycleRecordCapacityFromEnv }',1)
    anchor="  const mode = env.TRUYN_G5_"
    assert anchor in s;s=s.replace(anchor,"  const recordCapacity = lifecycleRecordCapacityFromEnv(env);\n"+anchor,1)
    anchor="  if (mode === 'off') {"
    s=s.replace(anchor,anchor+"\n    if (recordCapacity !== null) throw new Error('G5 record capacity requires configured Cosmos ledger');",1)
    if 'provider-effect' in file:
        s=s.replace('const options = { endpoint, database, container, getAccessToken, fetchImpl };','const options = { endpoint, database, container, getAccessToken, fetchImpl, recordCapacity };',1)
    else:
        s=s.replace('createCosmosLifecycleLedger({endpoint,database,container,fetchImpl,getAccessToken})','createCosmosLifecycleLedger({endpoint,database,container,fetchImpl,getAccessToken,recordCapacity})',1)
        s=s.replace('  await ledger.verifyContainer();',"  await ledger.verifyContainer();\n  if (typeof ledger.verifyCapacityContract === 'function') await ledger.verifyCapacityContract();",1)
    sources[file]=s
for p,s in sources.items():
    if blob(s)!=files[p][1]:raise SystemExit('OUTPUT_MISMATCH:'+p+':'+blob(s))
for p,s in sources.items():Path(p).write_text(s)
print('G5_CAPACITY_EXACT_THREE_BLOBS_APPLIED')
