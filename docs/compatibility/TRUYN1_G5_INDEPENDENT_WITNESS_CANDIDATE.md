# G5 independent response witness and lost-ID recovery

Issue #990. Source candidate; NOT live Azure, vendor invoice finality or G5 PASS.

Ported from the supplied local recovery package onto accepted `main@8cd23898314fd3d96a4796b485935f812a59f2a1`. The accepted same-container Cosmos session cache and completed-response status checks from #1067 are preserved. No signed TRUYN/1 bytes, public message kinds, existing flags or private platform dependencies change.

## Sequence and boundaries

An explicit `TRUYN_G5_CORRELATED_RESPONSE_RECOVERY=1` extends the existing effect claim CAS with a scope digest and opaque correlation derived from NEED/requester/provider/fingerprint, execution token and configured Azure scope. Caller correlation is discarded. Only the claim winner may POST. Azure receives opaque metadata and X-Client-Request-Id; this is NOT advertised as an idempotent create key.

An independent collector must retain and sign a bounded completed-response record before that evidence disappears. Its Ed25519 private key is not a worker credential. The verifier accepts only pinned independent keys and exact schema, usage arithmetic, scope, time and correlation; contradictory response IDs remain blocked. Recovery resolves the ID from this witness, reads the stored provider response using GET, verifies echoed metadata/model/usage/output digest, rechecks the effect binding and writes the immutable receipt into the SAME effect document. No repeat POST, automatic terminal, ACK, settlement, refund or UNKNOWN-to-COMPLETED promotion occurs.

The collector signature is not a Microsoft signature or settled invoice. No collector is provisioned by this patch. Missing evidence, an expired response, a corrupt witness or multiple outcomes remain UNKNOWN, never proof that no external effect occurred. Old records without precommitted correlation cannot be upgraded by guessing. This profile must not be enabled before a real independent collector and its trust roots are reviewed and connected. The current runtime wrapper requires an injected verifier; user NEED/policy cannot supply it.

## Tests and acceptance

`tests/g5-independent-witness-recovery.test.js` exercises default-off compatibility, opaque precommit, one POST under competition, signature/key/owner/task/scope/usage/time negatives, conflicting outcomes, capture ambiguity, deadlines and GET-only recovery. `tests/g5-independent-witness-process.test.js` kills a real execution OS process BEFORE it receives response_id, then recovers in a fresh process; the independent test service retains a file-backed witness and signing key. Cosmos and Azure in that test are explicitly local emulators, NOT cloud or paid-provider evidence.

Require exact-head full CI, five SDKs, DCO, security, seven CodeQL analyzers, behind=0 and postmerge qualification. Live isolated multi-host faults, full shared OFFER authority/retention, financial reconciliation and independent final G5 evidence remain separate gates under #990.

## Primary interface references

- https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses

GET-by-ID and metadata support response verification; neither is an invoice-settlement guarantee.
