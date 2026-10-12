// P13-FORMAT is an independent, read-only public compatibility inventory.
// It cannot approve production operations or certify stable-v1 by assertion.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = relative => resolve(root, relative);
const REQUIRED_STABLE_GATES = [
  'normative-wire-schema-and-canonical-signature-freeze',
  'cross-version-positive-negative-golden-vectors',
  'five-sdk-exact-version-compatibility-conformance',
  'required-semantics-fail-closed-and-no-downgrade',
  'identity-and-local-persisted-format-continuity',
  'exact-head-dco-security-ci-and-signed-evidence',
  'post-merge-main-independent-reconciliation'
];
const REQUIRED_EVIDENCE = [
  'public-deprecation-policy',
  'local-byok-schema1-to-schema2-and-byte-exact-rollback',
  'required-semantics-and-protocol-negotiation',
  'five-sdk-published-alpha-interoperability'
];

export function evaluateP13FormatReadiness(plan) {
  if (plan?.schema !== 'truyn.p13.format-compatibility-plan/v1'
    || plan.lane !== 'FORMAT' || plan.maturity !== 'pre-stable'
    || plan.productionCutover !== 'OUT_OF_SCOPE'
    || plan.deprecation?.minStableNoticeCalendarDays !== 180
    || plan.deprecation?.policy !== 'spec/protocol/v1/migration.md') {
    throw new Error('p13_invalid_format_contract');
  }
  if (!Array.isArray(plan.boundedEvidence)
    || plan.boundedEvidence.length !== REQUIRED_EVIDENCE.length
    || REQUIRED_EVIDENCE.some(id => plan.boundedEvidence.filter(x => x.id === id).length !== 1)
    || !Array.isArray(plan.stableQualification)
    || plan.stableQualification.length !== REQUIRED_STABLE_GATES.length
    || REQUIRED_STABLE_GATES.some(id => plan.stableQualification.filter(x => x.id === id).length !== 1)) {
    throw new Error('p13_incomplete_format_inventory');
  }
  for (const entry of plan.boundedEvidence) {
    if (typeof entry.reference !== 'string' || !entry.reference || !existsSync(file(entry.reference))) {
      throw new Error('p13_missing_format_reference:' + entry.id);
    }
  }
  const policy = readFileSync(file(plan.deprecation.policy), 'utf8');
  if (!/180 calendar days/i.test(policy)
    || !/public deprecation notice/i.test(policy)
    || !/new protocol generation/i.test(policy)) {
    throw new Error('p13_format_policy_drift');
  }
  // Only an independent exact-revision release admission can mark Stable.
  // Fields supplied in the plan do not constitute an attestation.
  return {
    schema: 'truyn.p13.format-readiness-report/v1',
    lane: 'FORMAT',
    status: 'PRE_STABLE',
    policyDefined: true,
    boundedEvidenceCount: plan.boundedEvidence.length,
    stableFormatCertified: false,
    productionCutoverAuthorized: false,
    productionEvidenceInspected: false,
    stableGatesPending: REQUIRED_STABLE_GATES,
    next: 'Independently qualify stable wire/schema and five published SDK versions at one exact SHA; then reconcile merged main.'
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const plan = JSON.parse(readFileSync(file('spec/compatibility/p13-format-compatibility-plan.json'), 'utf8'));
  process.stdout.write(JSON.stringify(evaluateP13FormatReadiness(plan), null, 2) + '\n');
}
