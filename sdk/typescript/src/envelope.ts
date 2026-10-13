// TypeScript delegates wire signing/verification to the bundled Node runtime.
export { createEnvelope, verifyEnvelope, canonicalize, unsignedEnvelope } from '../../../core/protocol/index.js';
export { ENVELOPE_EXT_SEMANTIC, validateEnvelopeExt, envelopePriority } from '../../../core/protocol/envelope-ext.js';
