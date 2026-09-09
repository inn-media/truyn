# TRUYN Production Trust Authority

**Status:** implemented bounded reference authority-of-keys layer. Operational revocation dissemination is CI-proven in the bounded reference topology defined by `OPERATIONAL_REVOCATION.md`; deployed multi-region/WAN production dissemination remains open.

## Authority contract

Production Trust Authority makes a valid object signature necessary but not sufficient. A key must also be authorized for the requested purpose and scope through a durable chain rooted in an explicitly provisioned Authority Root.

Supported purposes are `delegate`, `claim-issuer`, `verifier`, `source-owner`, `lineage-signer`, `provider-attester` and `disputer`. Supported scope kinds are `global`, `domain`, `source` and `provider`, with explicit `exact`, `prefix` and domain-only `subdomain` matching.

Delegation is monotonic-narrowing: child purpose, scope and validity may not exceed the issuer. A logical delegated authority keeps a stable `authorityId` and advances by exactly one `authorityVersion`; rollback, gaps and stale direct keys fail closed. Root rotation uses a signed continuity proof and cannot widen scope or purpose.

Requester public keys are normalized through the same authority identity path used for stored authority records before comparison. Equivalent PEM boundary whitespace therefore does not cause a false denial, while a supplied key whose derived `nodeId` does not match the requester still fails closed.

## Durable authority state

The reference registry persists:

- roots and root-version history;
- authority certificates and current logical authority versions;
- monotonic `authorityEpoch`;
- hash-linked authority events and current `headHash`;
- a separate anti-rollback anchor containing minimum store revision, minimum authority epoch and accepted head hash.

Registry rollback behind the retained anchor and same-epoch head replacement are rejected. This is local bounded anti-rollback evidence, not a globally witnessed transparency service.

## Terminal authority revocation

The shared `ProductionRevocationAuthority` is authoritative for terminal `authority-root`, `authority-certificate` and `authority-key` revocation. Revocation survives restart and is rechecked during authority decisions; unavailable/corrupt revocation state fails closed.

Normal rotation and terminal revocation remain distinct operations. A historical delegation may remain valid through a proven root rotation, but emergency revocation of a compromised historical key invalidates chains that depend on that key.

## Active Trustability integration

When `authorityRegistry` is supplied to `assessActiveTrust()`:

- a CLAIM issuer must have `claim-issuer` authority for the exact claim domain;
- an ATTEST signer must have `verifier` authority for the exact claim domain;
- a lineage certificate signer must have `source-owner` or `lineage-signer` authority for the exact source;
- a production `disputer` delegation can authorize lifecycle-changing disputes in the claim domain;
- unknown, expired, scope-mismatched, superseded, revoked, compromised or rollback-detected authority is rejected.

A production authority epoch/head is committed into the assessment output so the consulted authority state is identifiable.

Operational revocation additionally allows replicated `trust-evidence` revocation to remove an otherwise cryptographically valid attestation from active assessment. This converts evidence revocation from a standalone object into consumed runtime state.

## Operational Revocation closure

The bounded reference path is now executable end-to-end:

```text
REVOKE
  ↓
authoritative actor/scope/target validation
  ↓
durable ordered append
  ↓
bounded replication
  ↓
consumer notification + revocation epoch invalidation
  ↓
relay / provider / entitlement / Trustability re-evaluation
  ↓
future operation DENIED
```

Covered revocation classes are:

- membership;
- provider grant;
- entitlement;
- provider;
- authority/delegation;
- trust evidence.

Replica apply is strict: sequence gaps, out-of-order/conflicting state and invalid chain continuity fail closed; an exact replay is idempotent. Replica mode is read-only for local revoke mutation.

Decision caches bind entries to revocation epochs. Once a matching replicated event is applied, a warm allow is invalidated and the next decision is evaluated against the updated replica authority.

The deterministic partition/heal acceptance harness records durable append, replica apply, cache invalidation and first-denied timestamps, deriving `appendToReplicaMs`, `appendToInvalidationMs`, `revocationPropagationMs` and, when applicable, `healToDenialMs`. These are bounded acceptance measurements, not production WAN SLO observations.

See `docs/trustability/OPERATIONAL_REVOCATION.md` for the full bounded contract and deployment boundary.

## Acceptance evidence

`tests/production-trust-authority.test.js` covers scoped authority, widening denial, delegated/root rotation, stale-version denial, terminal delegation/key/root revocation, Active Trustability authority enforcement and anti-rollback detection.

`tests/operational-revocation.test.js` covers authoritative validation before append, ordered/hash-linked revocation state, replica gap/replay behavior, deterministic partition/heal, warm-cache invalidation, actual DENIED outcomes for all six required consumer classes, relay-level post-revocation denial with zero additional remote dispatch, trust-evidence invalidation and bounded propagation timing.

## Deliberate remaining production boundary

The following remain OPEN and must not be inferred from the bounded CI reference runtime:

- governance/process for choosing globally shared Authority Roots;
- DNS/WebPKI/DID or other external root-binding adapters;
- independently witnessed/public transparency-log consistency;
- managed replicated production authority backend and consensus/fencing model;
- actual deployed multi-node/multi-region/WAN revocation dissemination;
- production revocation propagation SLI/SLO evidence under real partitions;
- emergency fan-out/acknowledgement SLO;
- offline/HSM root procedures;
- operator API/RBAC/audit workflow;
- disaster recovery with externally pinned authority heads.

Therefore Production Trust Authority + Operational Revocation are **CI-proven bounded reference capabilities**, not a claim that the whole trust control plane is already multi-region Productionized.
