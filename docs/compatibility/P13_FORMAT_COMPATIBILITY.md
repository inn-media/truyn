# P13-FORMAT: stable format compatibility (independent release gate)

**Status: PRE-STABLE / not certified.** The normative policy is defined and bounded local evidence exists. This is not a Stable TRUYN/1 declaration.

## Scope: public, stable compatibility only

The owner of this lane is the public protocol/SDK contract. It covers canonical signed bytes and wire envelopes, required and optional semantics, Node ID derivation, protocol/feature negotiation, versioned local persisted formats, Agent Descriptor and five first-party SDK projections. Only a qualified released version and its immutable evidence can establish compatibility; an unversioned code sample or a green local test cannot.

**Deprecation:** stable exposed interfaces receive at least **180 calendar days** after a dated public notice before ordinary retirement. The actual normative policy, major-version restrictions, security exception and pre-v1 exception are in [migration.md](../../spec/protocol/v1/migration.md). A notice interval is not permission to reinterpret signed bytes or required semantics within the same generation.

**Breaking formats:** use a new immutable release/profile or protocol generation and explicit negotiation. Unknown required semantics and unsupported generations fail closed, without identity rotation, semantic downgrade or new billing/authorization bypass.

## Already implemented, but bounded

- A persisted local BYOK schema-1 → schema-2 conversion with owner quiescence, mode-0600 checkpoint, checksummed byte-exact rollback, identity continuity and corruption/symlink negatives: [test](../../tests/p13-migration-rollback-interoperability.test.js), [migrator](../../migrations/p13-byok-file.js).
- Actual base/required-semantic version negotiation negatives: [negotiation implementation](../../core/protocol/negotiation.js).
- Published-alpha five-language 20/20 interoperability: [wire qualification ledger](TRUYN1_WIRE_FREEZE_QUALIFICATION_LEDGER.md). This is not independently qualified stable-v1 wire interoperability.
- Canonical 180-day deprecation policy: [normative document](../../spec/protocol/v1/migration.md).

The format inventory is machine-readable at [p13-format-compatibility-plan.json](../../spec/compatibility/p13-format-compatibility-plan.json). The safe local report is `node scripts/p13-format-readiness.mjs`. Its current PRE_STABLE output is deliberately **not** a release-admission token.

## Stable format closure requires

A frozen normative contract and canonical vectors, actual positive/negative cross-version wire tests, conformance for **five exact published SDK versions**, fail-closed required-semantic/unsupported-generation tests, identity/local-format continuity, DCO/security/CI qualification on the **same exact head**, and independent post-merge `main` reconciliation. Preserve historical negative evidence; no silent alpha→stable promotion. Applicable P1–P12/P14 release gates are additional requirements for declaring Stable TRUYN/1.

**P13-FORMAT may be qualified independently of production storage migration** when its own exact-revision evidence passes. Do not include Azure, Cosmos, deployed topology, production traffic, PITR or live canary as a prerequisite for *format-contract qualification*.

## Out of scope: P13-OPS

The local BYOK rollback does **not** prove rollback of production authority, keys, revocations, inboxes, artifacts or accounting state. No real live-state migration, authority cutover or traffic change can be approved by this lane. Production inventory, isolated restore, per-domain migrators, private canary, independent attestation and rollback belong exclusively to [P13-OPS](../operations/P13_PRODUCTION_CUTOVER_READINESS.md) and its separate [operations plan](../../operations/p13-production-cutover-plan.json).

The two lanes must not inherit one another's PASS: **FORMAT PASS ≠ OPS PASS; OPS PASS ≠ FORMAT PASS**. Stable protocol publication and production deployment are separate decisions.

## Independent protocol publication

A **Stable TRUYN/1 Protocol** declaration must pass this format gate and all other applicable P1–P14 plus five-SDK/security/exact-head release gates, but **does not require** a live Azure/Cosmos production backup, PITR restore, canary or rollback. Those remain mandatory for an applicable **Stable TRUYN Service** production cutover and for Mainnet admission. [Machine-readable release scopes](../../spec/compatibility/stable-release-scopes.json). No declaration is made by this document.

## Exact prerelease pins for the five SDKs (not a stable assertion)

The accepted Wire Freeze public prerelease source SHA is `57971b134a41c3e3ea4b42f68e86a7d117036006`. The machine-readable immutable-version inventory is [truyn1-five-sdk-freeze.json](../../spec/compatibility/truyn1-five-sdk-freeze.json), and the read-only cross-check is `node scripts/truyn1-protocol-candidate-audit.mjs`. This separates the current Wire Freeze family from the **older historical** Developer Release coordinates in `sdk/release/public-coordinates.json`. Five accepted *pre-releases* qualify a bounded compatibility candidate, **not** stable first-party SDK release versions, cross-version full-lifecycle parity, or future protocol-stable admission. P13-FORMAT is still **PRE-STABLE**.
