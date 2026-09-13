import { createProviderBillingPolicy } from '../core/security/provider-billing.js';

const PUBLIC_MODES = new Set(['byok', 'owner-funded']);

export function createRuntimeProviderBillingPolicy(env = process.env) {
  const mode = String(env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded').trim().toLowerCase();
  if (!PUBLIC_MODES.has(mode)) {
    throw new Error(`TRUYN_PROVIDER_BILLING_MODE=${mode} requires a compatible managed platform; public runtime supports only byok and owner-funded`);
  }
  return createProviderBillingPolicy({ mode });
}
