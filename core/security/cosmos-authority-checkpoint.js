import { containerAppsManagedIdentityToken } from '../../adapters/providers/common/azure-auth.js';
import {
  productionControlPlaneSnapshotDigest,
  validateProductionControlPlaneSnapshot,
  verifyProductionControlPlaneSnapshotDigest
} from './production-control-plane-snapshot.js';

const DEFAULT_API_VERSION = '2018-12-31';
const DEFAULT_MAX_DOCUMENT_BYTES = 1_750_000;

function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function checkpointError(code, status = null) {
  const error = new Error(code);
  error.code = code;
  if (status != null) error.status = status;
  return error;
}

function sha(value, label = 'sourceSha') {
  const normalized = required(value, label).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) throw new Error(`${label} must be a 40-character Git SHA`);
  return normalized;
}

export function validateAuthorityCheckpointDocument(document, { maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES } = {}) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw checkpointError('authority_checkpoint_invalid');
  if (document.kind !== 'truyn-production-authority-checkpoint' || document.schemaVersion !== 1) throw checkpointError('authority_checkpoint_schema_invalid');
  required(document.id, 'checkpoint id');
  required(document.partitionKey, 'checkpoint partitionKey');
  if (!Number.isSafeInteger(document.revision) || document.revision < 1) throw checkpointError('authority_checkpoint_revision_invalid');
  sha(document.sourceSha);
  if (!Number.isFinite(Date.parse(document.committedAt || ''))) throw checkpointError('authority_checkpoint_time_invalid');
  validateProductionControlPlaneSnapshot(document.state);
  verifyProductionControlPlaneSnapshotDigest(document.state, document.stateDigest);
  const bytes = Buffer.byteLength(JSON.stringify(document));
  if (bytes > maxDocumentBytes) throw checkpointError('authority_checkpoint_document_too_large');
  return document;
}

export function createAuthorityCheckpointDocument({ id, partitionKey, revision, sourceSha, state, committedAt = new Date().toISOString(), maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES } = {}) {
  validateProductionControlPlaneSnapshot(state);
  const document = {
    id: required(id, 'checkpoint id'),
    partitionKey: required(partitionKey, 'checkpoint partitionKey'),
    kind: 'truyn-production-authority-checkpoint',
    schemaVersion: 1,
    revision,
    sourceSha: sha(sourceSha),
    committedAt,
    stateDigest: productionControlPlaneSnapshotDigest(state),
    state
  };
  validateAuthorityCheckpointDocument(document, { maxDocumentBytes });
  return document;
}

function cosmosAuthorization(token) {
  return encodeURIComponent(`type=aad&ver=1.0&sig=${token}`);
}

export function createCosmosAuthorityCheckpointStore({
  endpoint,
  database,
  container,
  checkpointId = 'production-authority',
  partitionKey = 'production-authority',
  fetchImpl = fetch,
  accessTokenProvider = containerAppsManagedIdentityToken,
  apiVersion = DEFAULT_API_VERSION,
  maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES,
  now = () => new Date()
} = {}) {
  const base = required(endpoint, 'Cosmos endpoint').replace(/\/$/, '');
  const db = required(database, 'Cosmos database');
  const coll = required(container, 'Cosmos container');
  const id = required(checkpointId, 'checkpoint id');
  const pk = required(partitionKey, 'checkpoint partitionKey');

  async function headers({ contentType = false, etag = null } = {}) {
    const token = await accessTokenProvider({ fetchImpl, resource: 'https://cosmos.azure.com/' });
    const result = {
      authorization: cosmosAuthorization(token),
      'x-ms-date': now().toUTCString(),
      'x-ms-version': apiVersion,
      'x-ms-documentdb-partitionkey': JSON.stringify([pk])
    };
    if (contentType) result['content-type'] = 'application/json';
    if (etag) result['if-match'] = etag;
    return result;
  }

  const collectionUrl = `${base}/dbs/${encodeURIComponent(db)}/colls/${encodeURIComponent(coll)}/docs`;
  const itemUrl = `${collectionUrl}/${encodeURIComponent(id)}`;

  async function read() {
    const response = await fetchImpl(itemUrl, { method: 'GET', headers: await headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw checkpointError('authority_checkpoint_read_failed', response.status);
    const document = await response.json();
    validateAuthorityCheckpointDocument(document, { maxDocumentBytes });
    const etag = response.headers?.get?.('etag') || document._etag || null;
    if (!etag) throw checkpointError('authority_checkpoint_etag_missing');
    return { document, etag };
  }

  async function create({ sourceSha, state, committedAt = now().toISOString() } = {}) {
    const document = createAuthorityCheckpointDocument({
      id,
      partitionKey: pk,
      revision: 1,
      sourceSha,
      state,
      committedAt,
      maxDocumentBytes
    });
    const response = await fetchImpl(collectionUrl, {
      method: 'POST',
      headers: await headers({ contentType: true }),
      body: JSON.stringify(document)
    });
    if (response.status === 409) throw checkpointError('authority_checkpoint_conflict', 409);
    if (!response.ok) throw checkpointError('authority_checkpoint_create_failed', response.status);
    const stored = await response.json();
    validateAuthorityCheckpointDocument(stored, { maxDocumentBytes });
    const etag = response.headers?.get?.('etag') || stored._etag || null;
    if (!etag) throw checkpointError('authority_checkpoint_etag_missing');
    return { document: stored, etag };
  }

  async function replace({ expectedEtag, revision, sourceSha, state, committedAt = now().toISOString() } = {}) {
    if (typeof expectedEtag !== 'string' || !expectedEtag) throw new Error('expectedEtag is required');
    const document = createAuthorityCheckpointDocument({
      id,
      partitionKey: pk,
      revision,
      sourceSha,
      state,
      committedAt,
      maxDocumentBytes
    });
    const response = await fetchImpl(itemUrl, {
      method: 'PUT',
      headers: await headers({ contentType: true, etag: expectedEtag }),
      body: JSON.stringify(document)
    });
    if (response.status === 409 || response.status === 412) throw checkpointError('authority_checkpoint_conflict', response.status);
    if (!response.ok) throw checkpointError('authority_checkpoint_replace_failed', response.status);
    const stored = await response.json();
    validateAuthorityCheckpointDocument(stored, { maxDocumentBytes });
    const etag = response.headers?.get?.('etag') || stored._etag || null;
    if (!etag) throw checkpointError('authority_checkpoint_etag_missing');
    return { document: stored, etag };
  }

  return Object.freeze({
    kind: 'cosmos-authority-checkpoint',
    checkpointId: id,
    partitionKey: pk,
    maxDocumentBytes,
    read,
    create,
    replace
  });
}
