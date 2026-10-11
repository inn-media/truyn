# TRUYN/1 Migration and Deprecation Policy

**Status:** bounded Open 1.0 release-candidate policy.

This document defines how pre-v1 Developer Release behavior moves into the accepted bounded TRUYN/1 Open 1.0 profile and how later compatible/deprecated behavior must be handled.

## Pre-v1 to Open 1.0

1. Pre-v1/alpha SDKs, draft protocol documents and interoperability generations remain historical evidence; they are not silently re-labeled as stable TRUYN/1.
2. A client/runtime enters the Open 1.0 profile only after it implements the accepted bounded protocol contract and passes the applicable executable conformance for its exact source/artifact revision.
3. Existing persisted identities remain valid when their cryptographic key material and Node ID derivation satisfy the final TRUYN/1 identity contract. Migration MUST NOT rotate identity merely to change a release label.
4. Existing offers, needs, results, references or other persisted state MAY require explicit migration when their stored representation violates the final stable contract. Migration MUST be deterministic, auditable and fail closed; malformed or ambiguous state MUST NOT be guessed into validity.
5. Existing alpha package coordinates remain immutable historical artifacts. Stable packages use new immutable release coordinates/versions and MUST NOT overwrite alpha registry artifacts.
6. Public/private repository split ownership remains unchanged by protocol stabilization: public Open 1.0 cannot gain a private source/runtime dependency as part of migration.

## Compatible evolution inside TRUYN/1

A change MAY remain in the same protocol generation only when all of the following are true:

- existing required fields retain their accepted meaning;
- existing signed/canonical bytes are not reinterpreted incompatibly;
- new fields are optional or explicitly negotiated;
- peers that do not understand the optional extension can safely ignore/reject it as specified;
- authorization, provider ownership, billing, cancellation, provenance, replay and integrity boundaries are not weakened;
- executable compatibility evidence exists for every claimed interface affected by the change.

A required semantic that is not universally part of the accepted base profile MUST be advertised and negotiated explicitly. Required semantics MUST NOT be silently downgraded into optional behavior.

## Breaking changes

A change requires a new protocol generation or another explicitly versioned profile when it changes any required stable semantic incompatibly, including:

- canonical signing bytes/domain;
- Node ID derivation;
- required envelope fields or their meaning;
- lifecycle/terminal semantics;
- authorization/ownership meaning;
- object/reference integrity rules;
- stable normalized error meaning;
- any behavior that would cause a previously valid stable message to be interpreted differently rather than cleanly rejected.

A breaking change MUST NOT be shipped behind the same stable identifier merely because both implementations can compile.

## Deprecation

Deprecation is a compatibility state, not deletion of evidence.

**Uniform stable deprecation window: at least 180 calendar days.** For any publicly supported *stable* TRUYN protocol optional/negotiated behavior, Agent Descriptor feature, adapter interface or first-party SDK API, the earliest normal end of support is no sooner than 180 full calendar days after the first dated public deprecation notice. The notice MUST state the affected identifier and supported versions, replacement, concrete migration steps, UTC announcement date, earliest retirement date (UTC), and any longer product-specific promise. The clock starts on public notice, not on an unpublished decision; an existing longer promise MUST NOT be shortened retroactively. Published release notes and compatibility tables MUST refer to the same notice and deadline. Removal also obeys all stricter versioning constraints (including major-only SDK removals and new protocol generation/profile for breaking required semantics); 180 days alone never grants permission to break a stable contract.

For stable SDK APIs the deprecated symbol MUST additionally survive at least the next minor release, so the later of these requirements governs. Withdrawal of a supported stable major or protocol generation requires the same minimum public 180-day retirement notice and declared migration/negotiation path. Security emergencies may fail closed earlier only when continued support would violate a security invariant, with a dated public advisory, reasons, impact and migration guidance. Pre-v1 alpha/beta interfaces do **not** inherit a stable 180-day support guarantee: their breaking changes still require a new immutable package/profile version, explicit release notes and migration guidance. These time rules become enforceable on stable features when a stable release is actually declared; this release-candidate policy does not itself declare `TRUYN/1` stable.

- A deprecated stable feature remains documented throughout its published support window, which MUST satisfy the uniform 180-calendar-day minimum and any stricter versioning/support commitment.
- Security fixes MAY fail closed earlier when continued acceptance would violate an invariant; the reason and migration must be documented.
- Removal of a stable required semantic requires a new generation/profile unless the original contract explicitly defined it as optional/negotiated.
- Historical conformance/benchmark/release evidence is append-only/redact-not-delete and MUST remain distinguishable from current support claims.

## Release discipline

Draft/pre-v1 wording is removed only when exact-head and post-merge qualification prove the bounded TRUYN/1 release contract. A green partial test, old PR, old package, or documentation edit alone is not a stable-v1 declaration.

After any repair commit, prior exact-head qualification is stale. Stable release claims must point to the exact merged revision and immutable artifacts that passed the final applicable gates.
