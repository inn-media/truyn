import { createProviderBillingPolicy, managedProviderBillingMode } from '../core/security/provider-billing.js';

export function createRuntimeProviderBillingPolicy(env = process.env) {
  const mode = String(env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded').trim().toLowerCase();
  if (managedProviderBillingMode(mode)) {
    throw new Error(`managed provider billing mode ${mode} requires TRUYN Platform runtime`);
  }
  return createProviderBillingPolicy({ mode });
}
