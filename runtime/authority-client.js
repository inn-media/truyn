function required(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

async function readJson(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    if (response.ok) throw error;
  }
  if (!response.ok) {
    const error = new Error(body?.error || `authority_http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function createAuthorityHttpClient({ baseUrl, token, adminToken = null, fetchImpl = fetch, requestTimeoutMs = 10_000 } = {}) {
  const base = required(baseUrl, 'authority baseUrl').replace(/\/$/, '');
  const runtimeToken = required(token, 'authority runtime token');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 60_000) {
    throw new Error('authority requestTimeoutMs must be 100..60000');
  }

  async function request(path, { method = 'GET', body = null, admin = false } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('authority_request_timeout')), requestTimeoutMs);
    try {
      const selectedToken = admin ? required(adminToken, 'authority admin token') : runtimeToken;
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${selectedToken}`,
          ...(body == null ? {} : { 'content-type': 'application/json' })
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      return await readJson(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    snapshot: () => request('/v1/authority/snapshot'),
    authorizeAccess: (input) => request('/v1/authority/access/authorize', { method: 'POST', body: input }),
    reserveBilling: (input) => request('/v1/authority/billing/authorize', { method: 'POST', body: input }),
    reconcileBilling: (input) => request('/v1/authority/billing/reconcile', { method: 'POST', body: input }),
    adminMutate: (input) => request('/v1/authority/admin/mutate', { method: 'POST', body: input, admin: true })
  });
}
