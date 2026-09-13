let statusProvider = null;

export function configureRelayAuthorityStatusProvider(provider = null) {
  if (provider != null && typeof provider !== 'function') {
    throw new Error('relay authority status provider must be a function or null');
  }
  statusProvider = provider;
}

export function relayAuthorityStatus() {
  if (!statusProvider) {
    return Object.freeze({ ready: false, revision: null, reason: 'authority_runtime_not_installed' });
  }
  const status = statusProvider();
  if (!status || typeof status !== 'object') {
    return Object.freeze({ ready: false, revision: null, reason: 'invalid_authority_runtime_status' });
  }
  return Object.freeze({ ...status, ready: status.ready === true });
}

// Transitional compatibility export for existing open relay bootstrap wiring.
// It is only a neutral status seam; no managed implementation exists in public.
export const managedRelayAuthorityStatus = relayAuthorityStatus;
