function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function executionTotalTokens(execution, fallback = null) {
  const metadata = execution?.metadata && typeof execution.metadata === 'object' ? execution.metadata : {};
  const usage = metadata.usage && typeof metadata.usage === 'object' ? metadata.usage : {};
  return positiveInteger(metadata.totalTokens)
    || positiveInteger(usage.total)
    || positiveInteger(usage.totalTokens)
    || positiveInteger(fallback);
}

export async function executeWithDurableAccounting({
  billingPolicy,
  need,
  accessPolicy,
  estimatedTokens,
  execute
} = {}) {
  if (!billingPolicy || typeof billingPolicy.authorize !== 'function') throw new Error('billingPolicy is required');
  if (typeof execute !== 'function') throw new Error('execute function is required');
  const estimate = positiveInteger(estimatedTokens);
  if (!estimate) return { ok: false, reason: 'billing_token_estimate_required', executed: false };

  const billing = billingPolicy.authorize(need, { accessPolicy, estimatedTokens: estimate });
  if (!billing?.ok) return { ok: false, reason: billing?.reason || 'billing_not_authorized', billing, executed: false };

  try {
    const execution = await execute({ billing, need });
    const actualTokens = executionTotalTokens(execution, billing.reservedTokens || estimate);
    if (typeof billing.finalize === 'function') {
      const reconciliation = billing.finalize({ outcome: 'completed', actualTokens });
      if (!reconciliation?.ok) {
        const error = new Error(reconciliation?.reason || 'accounting_reconcile_failed');
        error.code = reconciliation?.reason || 'accounting_reconcile_failed';
        error.execution = execution;
        error.billing = billing;
        error.reconciliation = reconciliation;
        throw error;
      }
      return { ok: true, executed: true, execution, billing, reconciliation, actualTokens };
    }
    return { ok: true, executed: true, execution, billing, reconciliation: null, actualTokens };
  } catch (error) {
    if (typeof billing.finalize === 'function' && !error?.reconciliation) {
      const release = billing.finalize({ outcome: 'failed', actualTokens: 0, reason: error?.code || error?.message || 'provider_execution_failed' });
      if (!release?.ok && release?.reason !== 'reservation_already_committed') error.accountingRelease = release;
    }
    throw error;
  }
}
