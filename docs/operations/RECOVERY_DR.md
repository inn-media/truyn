# Production Recovery / Disaster Recovery

**Status:** production recovery/DR contract and executable restore-drill validator implemented. This is a repository/runtime policy claim, not proof that every live production dependency has already passed a restore drill.

Network convergence is only one recovery primitive. Production recovery must restore the serving system and its authoritative state without weakening identity, authorization, billing, artifact integrity or trust semantics.

The canonical recovery drill lifecycle is:

```text
declare -> contain -> restore -> revalidate -> resume -> audit
```

`operations/recovery-dr.js` machine-enforces this order, numerical RTO/RPO objectives, scenario-specific revalidation and a secret-free hash-chained evidence history.

## Recovery objectives

RTO is measured from declared production-impacting failure until the required serving path is safely resumed. RPO is the maximum accepted loss of committed authoritative state. A faster service restart that violates the RPO or security/correctness invariants is a failed recovery.

| Scenario | RTO | RPO | Recovery source | Drill cadence |
| --- | ---: | ---: | --- | --- |
| instance loss | <=5 min | <=5 min | redeploy + durable service state | monthly |
| regional failure | <=30 min | <=15 min | cross-failure-domain copy / alternate region | semiannual |
| durable-state corruption | <=60 min | <=15 min | last known-good integrity-bound backup | quarterly |
| identity/key loss | <=60 min | **0 committed identity-history loss** | protected authority backup or signed succession/rotation | semiannual |
| semantic-index corruption | <=60 min | **0 canonical-source loss** | rebuild/verify from canonical signed/object source | quarterly |
| provider outage | <=15 min | <=5 min | alternate healthy runtime / durable provider state | monthly |
| relay outage | <=5 min | **0** | stateless redeploy / alternate healthy relay instance | monthly |
| artifact-store outage | <=30 min | <=15 min | durable integrity-bound artifact copy | quarterly |
| entitlement/accounting outage | <=30 min | <=5 min | authoritative transactional/accounting restore | quarterly |

These objectives are production operations targets. They do not replace the network campaign gates such as D-1000 routing `>=99%` and recovery/convergence p95 `<=120s`.

## Backup policy

Backups are required for authoritative state that cannot be regenerated without data loss. They MUST be:

- encrypted at rest and in transit;
- access-controlled by least-privilege workload/operator identity;
- versioned and integrity-bound with a digest or equivalent immutable authority metadata;
- retained in a failure domain independent of the primary when the scenario claims regional recovery;
- protected from ordinary application deletion/overwrite paths;
- monitored for age so the configured backup interval can satisfy the applicable RPO;
- periodically restored into an isolated recovery context rather than treated as valid because a backup job returned success.

Backup contents and exact cloud resource identities are private operational data. Public evidence records only sanitized opaque references, timestamps, source/deployment SHA where applicable, sizes/digests where safe, and PASS/FAIL results.

### State classes

**Authoritative durable state** includes signed/trust state, entitlement/accounting state, durable artifacts and other committed data whose loss changes externally visible truth. It requires an RPO-bound backup/replication path.

**Protected identity/key authority** belongs in KMS/HSM/secret-manager or an equivalent protected authority. Recovery must never restore revoked material merely to regain availability. If the key cannot safely be recovered, use the node/security succession or rotation lifecycle and prove continuity plus rejection of the retired identity.

**Rebuildable state** includes routing/connection state and semantic indexes that can be recreated from canonical verified inputs. Rebuildable caches are not authoritative backups. Rebuild must validate the canonical inputs first.

**Stateless serving state** such as a relay process may be redeployed without an application-data restore, but the restored instance must still prove correct origin/authentication policy before traffic resumes.

## Restore policy

A production restore follows six gates.

### 1. Declare

Identify the failure class, affected service/domain, exact deployment/source revision where applicable and the recovery objective that now governs the incident.

### 2. Contain

Fence corrupt state, failing identity, unhealthy region/runtime or unsafe write path. New writes must not continue into a state that cannot meet the declared RPO. Billing/security ambiguity fails closed rather than converting into owner-funded execution or relaxed authorization.

### 3. Restore

Restore only from an integrity-verified source. Durable restores require a digest-bound backup/equivalent authority reference. Stateless/rebuildable scenarios may redeploy/rebuild instead of restoring a snapshot.

### 4. Revalidate

Before serving resumes, prove all of:

- restored integrity is valid;
- authoritative signatures/identity/trust are valid;
- negative security path still rejects bypass/forgery/unauthorized use;
- corrupt, stale or revoked state is rejected rather than silently accepted;
- scenario-specific continuity checks pass.

Scenario-specific requirements include:

- regional failure: alternate-region authority is intended and routing is rebuilt;
- durable corruption: signed state revalidates and the known corrupt state is rejected;
- identity/key loss: logical identity continuity/succession is proven and revoked identity is rejected;
- semantic corruption: canonical source validates and the index is rebuilt or integrity-verified;
- provider outage: provider authority and negative M2M/BYOK path remain correct;
- relay outage: public HTTP/WS path works and origin bypass remains denied;
- artifact outage: artifact integrity passes and missing/corrupt artifacts fail closed;
- entitlement/accounting outage: accounting consistency passes and ambiguity cannot fall back to owner-funded execution.

### 5. Resume

Resume traffic only after health plus a representative synthetic transaction passes with zero safety violation. Rebuilding transient DHT/routing state is allowed after durable trust/identity state is revalidated.

### 6. Audit

Persist sanitized evidence with observed RTO/RPO, exact source/deployment reference, responsible role, restore source digest/reference, revalidation results and final PASS/FAIL. A drill that exceeds either RTO or RPO is not accepted even if service eventually recovers.

## Failure-specific operating rules

### Instance loss

Replace the failed instance from immutable/declarative deployment source. Reload intended durable state, preserve logical node identity only when that identity is still valid, rebuild transient connections/routing and verify health before rejoining traffic.

### Regional failure

Fail over to an independently recoverable failure domain. Region-local credentials, storage and control dependencies must not make the alternate region nominally configured but unusable. Restoration must prove the intended authority boundary, not only DNS/network reachability.

### Durable-state corruption

Stop unsafe writes, select the newest known-good backup within RPO, verify digest/signature/version, restore in isolation, reject the known corrupt generation and only then resume.

### Identity/key loss

Do not copy keys from logs, repositories or arbitrary disk images. Recover through the protected authority or execute signed succession/rotation. Revoked/compromised generations may not become authoritative again.

### Semantic-index corruption

Treat the index as derived state. Validate canonical source objects/vectors and rebuild or verify the immutable persisted vectors. Do not preserve a corrupt index merely to meet RTO.

### Provider outage

Use an alternate healthy authorized runtime only when provider capability, owner/BYOK authority and billing semantics remain valid. A provider failover may not widen visibility or funded execution eligibility.

### Relay outage

Redeploy/fail over quickly, then prove both public serving health and origin-bypass denial. Public `/health` remains minimal.

### Artifact-store outage

Restore artifacts from integrity-bound durable storage. Missing/corrupt referenced artifacts must fail closed; recovery may not silently substitute different bytes.

### Entitlement/accounting outage

Protect correctness over availability. Restore the authoritative transactional state within RPO, reconcile counters/leases/grants and prove ambiguous entitlement never becomes owner-funded access.

## Restore drills

The drill cadence in the objective table is the minimum reference cadence for a production claim. Every productionized scenario needs at least one accepted live drill and then continuing evidence at the declared cadence.

A live restore drill must record:

- scenario and fault injection/real incident classification;
- opaque deployment/environment reference;
- exact source SHA where applicable;
- start, containment, restore, revalidation and resume timestamps;
- backup/recovery-source age and integrity evidence;
- observed RTO and RPO;
- positive serving probe;
- negative security/correctness probe;
- proof that corrupt/stale/revoked material is rejected;
- owner/on-call acknowledgement;
- final sanitized evidence location.

Synthetic/local tests prove the contract and validator. They do **not** satisfy live production DR acceptance.

## Production acceptance

Repository-level recovery/DR acceptance requires:

- all nine required failure classes in the executable policy;
- numerical RTO/RPO for each class;
- backup/source-of-truth classification;
- ordered restore lifecycle with no phase skipping;
- restore-source integrity checks;
- security/correctness revalidation before resume;
- scenario-specific negative checks;
- RTO/RPO enforcement at audit;
- secret-free hash-chained evidence;
- exact-head regression CI/CodeQL green.

Production deployment acceptance additionally requires real backups/replication configured to meet the objectives and sanitized successful live restore-drill evidence for every production dependency being claimed. A configured backup without a restore drill is not accepted DR evidence.
