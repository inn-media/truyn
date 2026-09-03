# Production Security Rotation Lifecycle

**Status:** production rotation contract implemented. Live secret values, cloud identities, pager destinations and private topology stay outside the public repository.

TRUYN uses one canonical lifecycle for production credentials, proofs, identities and trust records:

```text
create -> overlap -> cutover -> verify -> revoke old -> audit
```

`operations/rotation-lifecycle.js` enforces that order and produces a hash-chained, secret-free audit history. A rotation is not complete merely because a new credential exists or a deployment succeeded.

## Covered resource classes

| Resource class | Overlap / cutover invariant | Required verification before old material is revoked |
| --- | --- | --- |
| origin proof | active/previous proof or protected staged equivalent; caller proof remains sanitized | public HTTP+WS healthy; direct Front Door/origin and forged proof denied; direct Container App denied |
| provider M2M proof | protected providers accept staged new proof without imposing it on BYOK/non-protected providers | registration/session use succeeds with new proof; fails with missing/invalid proof; BYOK lane unaffected |
| entitlement signing key | verifier trusts bounded old+new public keys while issuer moves signing to new key | new entitlements verify; expired/revoked/old-key entitlements fail after revoke; ambiguity never falls back to owner-funded execution |
| cloud workload identity | new federated/service identity receives only intended least-privilege scope before traffic/deploy cutover | intended workload succeeds; forbidden scope remains denied; old identity cannot authenticate after revoke |
| deployment credential | replacement deployment path is staged without widening repository/public access | exact-head deployment succeeds using new credential; old credential can no longer deploy after revoke; logs/evidence contain no credential value |
| node identity recovery/rotation | new identity material or succession record is staged before old material is retired | peer/session authentication succeeds on intended new identity; continuity/recovery evidence is recorded; old identity/key is rejected after revoke |
| bootstrap trust record | new signed/versioned bootstrap record is published with bounded overlap and monotonic version | new nodes bootstrap from new record; signature/expiry/version checks pass; stale/old record is rejected after revoke and rollback is not accepted |

## Canonical phase gates

### 1. Create

Generate or provision the replacement in its protected authority system. Record only a sanitized version/reference and scope. Never put secret material in Git, logs, tickets or evidence.

### 2. Overlap

Stage the replacement while preserving a safe recovery path. Standard rotation requires the old material to remain valid only for the bounded overlap necessary for cutover. Emergency compromise rotation still records the overlap phase, but the compromised old material is fenced rather than deliberately kept usable.

### 3. Cutover

Make the replacement primary and update every dependent verifier, route, workload or deployment path. Partial cutover is a failed rotation.

### 4. Verify

All rotations require three classes of evidence before revocation:

- positive path passes with the replacement;
- negative path denies invalid/old/bypass use as appropriate;
- continuity/recovery path is proven.

The resource-specific matrix above adds required checks.

### 5. Revoke old

Revoke/delete/disable the retired credential or trust record in its authoritative system and prove that the old material is rejected. Merely removing a value from application config is not revocation.

### 6. Audit

Store sanitized evidence with exact deployment/source SHA where applicable, timestamps, responsible operator roles, positive/negative results and rollback/recovery outcome. Audit evidence MUST NOT contain live credential values or private topology.

## Anti-rollback and emergency handling

Rotation tooling must reject phase skipping. Trust/bootstrap and signing-key systems must additionally enforce monotonic version/epoch semantics so a previously revoked generation cannot become authoritative again.

Suspected compromise uses `mode=emergency`: create replacement, stage it while fencing compromised material, cut over, run negative verification, revoke old authority, and audit the incident. Emergency mode never permits `verify` or `audit` to be skipped.

## Acceptance

Repository-level rotation acceptance requires:

- all seven resource classes present in the executable policy;
- canonical six-phase order enforced;
- no phase skipping;
- emergency compromise path represented without retaining compromised material unnecessarily;
- positive + negative + continuity checks required before revoke;
- old material explicitly proven rejected;
- sanitized, hash-chained audit history;
- CI regression tests green on the exact accepted SHA.

A repository-level PASS is not proof that every live production credential has already been rotated. Live deployment acceptance requires a sanitized drill/evidence record for the deployed authority being claimed.
