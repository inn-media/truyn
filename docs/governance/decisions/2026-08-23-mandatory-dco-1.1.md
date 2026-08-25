# Decision: Adopt mandatory DCO 1.1 for TRUYN contributions

**Proposal/RFC:** Bootstrap governance decision recorded from Founding Steward approval  
**Decision class:** Governance  
**Date:** 2026-08-23  
**Authority:** Founding Steward  
**Outcome:** Accepted

## Decision

TRUYN adopts the **Developer Certificate of Origin (DCO) 1.1** as the mandatory provenance mechanism for new contribution commits.

Every new contribution commit proposed through the normal pull-request path must contain a valid `Signed-off-by` trailer. The repository CI must verify DCO compliance before merge eligibility.

TRUYN continues to accept contributions under the Apache License 2.0 and does not introduce a Contributor License Agreement, copyright assignment, or project-specific relicensing grant as part of this decision.

## Rationale

TRUYN is intended to evolve toward multi-organization and neutral stewardship. That requires a durable, auditable inbound-contribution provenance rule that does not grant a single vendor special ownership over community contributions.

DCO 1.1 provides a lightweight, widely understood certification that the contributor has the right to submit the contribution under the applicable open-source license. It improves IP hygiene and future stewardship portability while keeping participation friction lower than a project-specific CLA.

The policy is prospective: historical repository commits are not rewritten merely to add retroactive DCO trailers.

## Participants

- Founding Steward: approved adoption in the public project working session on 2026-08-23.

## Recusals / conflicts

None recorded.

## Material objections or minority view

None recorded at adoption. Future maintainers/TSC participants may revisit the contribution mechanism through the published governance process.

## Compatibility and security conditions

- The canonical DCO 1.1 text is kept verbatim in the repository root as `DCO`.
- The requirement applies to code, specifications, documentation, SDKs, tests, governance and repository configuration.
- CI checks pull-request commit sign-offs and fails closed on missing/mismatched sign-off.
- DCO does not replace Apache 2.0 licensing.
- No CLA, copyright assignment or InnMedia-specific relicensing right is created by this decision.
- A future material change to inbound contribution rights/provenance is itself a Governance change.

## Follow-up implementation / conformance work

- Add the canonical `DCO` file.
- Publish `docs/governance/CONTRIBUTION_IP_POLICY.md`.
- Update `CONTRIBUTING.md`, `GOVERNANCE.md`, governance architecture/index and roadmap.
- Add an automated DCO pull-request check to the existing CI workflow.
- Require the CI check in repository branch/ruleset protection so normal merges cannot bypass a failing DCO gate.

## Supersedes / superseded by

Supersedes the previous implicit contribution posture that relied on Apache-2.0 licensing without an explicit DCO/CLA provenance requirement.
