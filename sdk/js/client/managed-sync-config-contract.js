export const MANAGED_SYNC_CONFIG_CONTRACT = Object.freeze({
  contract: 'truyn.managed-sync-config/v1',
  compatibility: 'backward-compatible',
  authority: Object.freeze({
    scope: 'server-derived',
    clientAuthorityFields: Object.freeze(['tenantId','accountId','principalId','organizationId','ownerId','roles','permissions','entitlements']),
  }),
  sync: Object.freeze({
    method: 'POST',
    path: '/v1/managed/sync',
    request: Object.freeze(['cursor','changes']),
    response: Object.freeze(['cursor','accepted','rejected']),
  }),
  config: Object.freeze({
    method: 'GET',
    path: '/v1/managed/config',
    request: Object.freeze([]),
    response: Object.freeze(['version','config']),
  }),
  platforms: Object.freeze(['windows','macos','linux','android']),
});

export function validateManagedSyncConfigClient(client = {}) {
  const platforms = MANAGED_SYNC_CONFIG_CONTRACT.platforms;
  return platforms.every((platform) => {
    const implementation = client[platform];
    return implementation &&
      implementation.contract === MANAGED_SYNC_CONFIG_CONTRACT.contract &&
      typeof implementation.sync === 'function' &&
      typeof implementation.getConfig === 'function';
  });
}
