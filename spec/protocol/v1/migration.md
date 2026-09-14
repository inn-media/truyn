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

- A deprecated stable feature remains documented until its replacement/migration path and support window are stated.
- Security fixes MAY fail closed earlier when continued acceptance would violate an invariant; the reason and migration must be documented.
- Removal of a stable required semantic requires a new generation/profile unless the original contract explicitly defined it as optional/negotiated.
- Historical conformance/benchmark/release evidence is append-only/redact-not-delete and MUST remain distinguishable from current support claims.

## Release discipline

Draft/pre-v1 wording is removed only when exact-head and post-merge qualification prove the bounded TRUYN/1 release contract. A green partial test, old PR, old package, or documentation edit alone is not a stable-v1 declaration.

After any repair commit, prior exact-head qualification is stale. Stable release claims must point to the exact merged revision and immutable artifacts that passed the final applicable gates.
