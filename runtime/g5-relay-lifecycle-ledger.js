import { createDurableOfferDirectory } from '../network/relay/g5-offer-directory.js';
import { createCosmosDirectoryStore } from '../network/relay/g5-cosmos-directory-store.js';
import { verifyEnvelope, canonicalize } from '../core/protocol/index.js';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';
import { containerAppsManagedIdentityToken } from '../adapters/providers/common/azure-auth.js';

// Explicit opt-in only. Never replace an unconfigured production relay's
// historical behavior or turn local SQLite into a distributed authority.
export function createRuntimeG5RelayLifecycleLedger({ env = process.env, tokenProvider = null, fetchImpl = fetch } = {}) {
  const mode = env.TRUYN_G5_RELAY_LIFECYCLE_LEDGER || 'off';
  const directoryMode = env.TRUYN_G5_OFFER_DIRECTORY || 'off';
  if (!['off','cosmos-strong-v1'].includes(directoryMode) || (directoryMode !== 'off' && mode !== 'cosmos'))
    throw new Error('G5 OFFER directory requires explicit Cosmos lifecycle configuration');
  if (!['off','cosmos'].includes(mode)) throw new Error('unsupported G5 relay ledger mode');
  if (mode === 'off') {
    if (env.TRUYN_G5_REQUIRE_RELAY_LIFECYCLE_LEDGER === '1')
      throw new Error('G5 shared relay ledger is required but not configured');
    return null;
  }
  const endpoint = env.TRUYN_G5_COSMOS_ENDPOINT;
  const database = env.TRUYN_G5_COSMOS_DATABASE;
  const container = env.TRUYN_G5_COSMOS_CONTAINER;
  if (![endpoint,database,container].every(value=>typeof value==='string' && value.trim().length))
    throw new Error('G5 Cosmos endpoint, database and container are all required');
  if (!tokenProvider) {
    if (!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER)
      throw new Error('G5 relay Cosmos requires Azure managed identity, never an account key');
    let identityEndpoint;
    try { identityEndpoint = new URL(env.IDENTITY_ENDPOINT); }
    catch { throw new Error('G5 relay identity endpoint must be loopback'); }
    if (identityEndpoint.protocol !== 'http:' ||
        !['localhost','127.0.0.1','[::1]'].includes(identityEndpoint.hostname))
      throw new Error('G5 relay identity endpoint must be loopback');
  }
  const getAccessToken=tokenProvider || (()=>containerAppsManagedIdentityToken({
    fetchImpl,resource:'https://cosmos.azure.com/'
  }));
  const ledger=createCosmosLifecycleLedger({endpoint,database,container,fetchImpl,getAccessToken});
  // A missing database/container also returns 404 from a document GET.
  // Verify the actual resource metadata and its partition path first.
  const verifyContainer=async()=>{
    let token;
    try { token=await getAccessToken(); }
    catch { throw new Error('G5 Cosmos Entra container authorization unavailable'); }
    if(typeof token!=='string'||!token) throw new Error('G5 Cosmos Entra container authorization unavailable');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
    let response;
    try {
      response=await fetchImpl(endpoint.replace(/\/$/,'')+`/dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}`,{
        method:'GET',
        headers:{
          authorization:encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
          'x-ms-date':new Date().toUTCString(),
          'x-ms-version':'2018-12-31',
          accept:'application/json'
        },
        signal:controller.signal
      });
    } catch {
      const unavailable = new Error('G5 Cosmos container metadata unavailable');
      unavailable.httpStatus = 503;
      unavailable.publicCode = 'lifecycle_ledger_unavailable';
      throw unavailable;
    }
    finally { clearTimeout(timer); }
    if(response.status!==200) throw new Error('G5 Cosmos container metadata rejected');
    let metadata;
    try { metadata=await response.json(); }
    catch { throw new Error('G5 Cosmos container metadata invalid'); }
    if(!Array.isArray(metadata?.partitionKey?.paths) ||
       metadata.partitionKey.paths.length!==1 ||
       metadata.partitionKey.paths[0]!=='/partitionKey' ||
       (metadata.partitionKey.kind && metadata.partitionKey.kind!=='Hash'))
      throw new Error('G5 Cosmos partition key must be /partitionKey');
    return true;
  };
  let offerDirectory = null;
  if (directoryMode !== 'off') {
    const directoryContainer = env.TRUYN_G5_OFFER_DIRECTORY_CONTAINER;
    if (!directoryContainer || directoryContainer === container || !env.TRUYN_G5_OFFER_DIRECTORY_AUTHORITY)
      throw new Error('G5 OFFER directory requires a dedicated container and pinned authority');
    const storage = createCosmosDirectoryStore({endpoint,database,container:directoryContainer,getAccessToken,fetchImpl});
    offerDirectory = createDurableOfferDirectory({storage,verifyEnvelope,canonicalize,
      authorityId:env.TRUYN_G5_OFFER_DIRECTORY_AUTHORITY});
  }
  return Object.freeze({...ledger,verifyContainer,...(offerDirectory ? {offerDirectory} : {})});
}

// Read-only fail-closed smoke before accepting any public relay traffic.
// A 404 is a valid response for this reserved sentinel ID; RBAC errors,
// transport failure and wrong Cosmos partition configuration are not.
export async function verifyRuntimeG5RelayLedger(ledger) {
  if (!ledger) return { enabled:false };
  if (ledger.kind !== 'cosmos-multi-host-v1') throw new Error('G5 relay requires cross-host Cosmos authority');
  if(typeof ledger.verifyContainer!=='function') throw new Error('G5 Cosmos container metadata preflight required');
  await ledger.verifyContainer();
  const record = await ledger.getNeed('g5-readonly-startup-canary::v1');
  // The identity is never reserved or altered by this probe.
  if (record && record.logicalId !== 'g5-readonly-startup-canary::v1')
    throw new Error('G5 relay canary returned another record identity');
  if (ledger.offerDirectory) await ledger.offerDirectory.inspectCapacity();
  return { enabled:true, readable:true };
}
