// Admission policy, not signature verification: historical signed bytes remain
// verifiable after the window closes. Boundaries are inclusive at millisecond
// precision, just like the frozen IDENTITY registration profile.
export const NEED_MAX_AGE_MS = 300_000;
export const NEED_MAX_FUTURE_MS = 30_000;

export function assertNeedAdmissionWindow(envelope, now = Date.now()) {
  const createdAt = Date.parse(envelope?.createdAt);
  if (!Number.isSafeInteger(now) || !Number.isFinite(createdAt) ||
      createdAt > now + NEED_MAX_FUTURE_MS || now - createdAt > NEED_MAX_AGE_MS) {
    const error = new Error('need_outside_acceptance_window');
    error.httpStatus = 400;
    error.publicCode = 'need_outside_acceptance_window';
    throw error;
  }
}
