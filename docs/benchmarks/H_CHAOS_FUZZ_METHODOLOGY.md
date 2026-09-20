# H/CHAOS-FUZZ — Seeded Adversarial Robustness Methodology

Status: **METHODOLOGY / NOT YET A RESULT**

## Hypothesis

Under malformed, adversarial and failure-prone inputs, TRUYN fails closed: invalid authority/provenance is never silently accepted, unauthorized execution remains impossible, bounded failures are surfaced explicitly, and the system recovers without unbounded crash/hang/leak behavior. A seeded campaign should also discover previously unknown failure modes before production exposure.

H/CHAOS-FUZZ is a robustness and discovery program, not a throughput benchmark.

## 1. Core distinction: safe refusal vs failure

The same request may stop for two very different reasons:

### Designed fail-closed outcome — GOOD

Examples:

```text
invalid signature -> reject
revoked identity -> reject
ambiguous authority -> reject/dispute
unsupported version -> explicit protocol error
provider timeout -> bounded failure/reroute according to policy
```

### Unhandled system failure — BAD

Examples:

```text
process crash
panic/unhandled exception
memory growth without bound
hang without deadline
wrong answer marked verified
unauthorized provider invocation
corrupted provenance accepted
cleanup damages foreign run state
```

The benchmark reports these classes separately.

## 2. Seeded generator families

The public contract defines generator classes. Exact hidden seeds, mutation order and security-sensitive minimized repros remain private until safe disclosure.

### Protocol/message faults

- truncated NEED/CLAIM/RESULT/envelope;
- oversized fields/payloads;
- invalid encoding / unknown fields / wrong types;
- bad signatures / mismatched signing identity;
- unsupported/foreign protocol version;
- duplicate message ID;
- replayed message;
- out-of-order sequence;
- impossible/stale timestamps;
- conflicting fields / ambiguous authority.

### Provider faults

- malformed response;
- syntactically valid but semantically nonsensical output;
- plausible false output in a gold-known task;
- timeout/hang;
- early connection close;
- oversized response;
- inconsistent usage/cost metadata;
- transient/retryable error storms;
- persistent failure.

### Identity / authorization faults

- duplicate node ID;
- key mismatch;
- revoked key presented as valid;
- forged owner/tenant/provider identifiers;
- unauthorized provider targeting;
- Sybil-style identity burst;
- stale/forged authorization evidence.

### Timing/network/storage faults

- clock skew;
- latency spikes;
- packet loss/reordering;
- partition + heal;
- abrupt provider/socket close;
- holder/store unavailability;
- disk-full / write failure where safely injectable;
- restart during in-flight request.

### Trust/provenance faults

- forged/invalid ATTEST or trust evidence;
- spoofed lineage/provenance reference;
- stale trust receipt;
- dispute flood / verification amplification;
- contradictory claims from multiple providers.

## 3. Property-based safety invariants

Every event is evaluated against invariants rather than a single expected response body.

Critical invariants include:

```text
invalid_signature_accepted = 0
revoked_or_unauthorized_identity_accepted = 0
unauthorized_provider_execution = 0
known_invalid_provenance_accepted = 0
wrong_gold_known_answer_marked_verified = 0
ambiguous_authority_silently_accepted = 0
foreign_series_state_mutated_or_cleaned = 0
```

Runtime invariants include:

```text
unbounded_hang_without_timeout = 0
unbounded_retry_loop = 0
unhandled_process_crash = 0 for supported rejectable input classes
resource_leak_beyond_frozen_threshold = 0
```

Some infrastructure-loss classes may legitimately terminate a process/instance; the campaign must distinguish expected process loss from a software crash caused by malformed input.

## 4. Severity model

Classify every distinct failure mode:

- **CRITICAL:** unauthorized execution, acceptance of invalid/revoked authority, wrong/invalid result marked verified/valid, cross-tenant or cross-series breach;
- **HIGH:** unhandled crash/panic, permanent deadlock/hang, unrecoverable corruption, unsafe cleanup;
- **MEDIUM:** bounded but excessive recovery, repeated retry storm, material leak below crash severity, pathological amplification;
- **LOW:** diagnostics/observability defect or minor contract inconsistency without correctness/safety impact.

Severity is part of the immutable evidence record.

## 5. Procedure

1. Freeze public/private SHAs, generator profile digest, invariant set, fault-class coverage target and seed list/seed commitment.
2. Verify H owns all mutable fault targets through the cross-series R2 lease preflight.
3. Run a no-fault control with the same workload/invariant instrumentation.
4. Run deterministic campaigns for many independent seeds.
5. Emit every generated mutation/fault event with generator class and deterministic position in the seed trace.
6. Evaluate invariants continuously, not only at campaign end.
7. On any unexpected failure, preserve seed + trace + environment digest.
8. Minimize the reproducer while proving the minimized case still violates the same invariant/failure signature.
9. Repair in a separate code change without weakening the invariant.
10. Convert the minimized reproducer into a permanent regression test.
11. Re-run the exact seed/reproducer and a surrounding seed neighborhood after repair.
12. Preserve both negative pre-fix evidence and post-fix closure evidence.

## 6. Primary metrics

### Safety violations

```text
critical_safety_invariant_violations
```

Target for accepted closure: **0**.

### New distinct failure modes

A “new failure mode” is not every failed request. It is a deduplicated root-cause/signature class with its own minimized reproducer or clearly justified equivalence.

```text
new_distinct_failure_modes_found
new_distinct_failure_modes_closed
open_failure_modes_by_severity
```

Discovering failures is a useful output; it is not itself a benchmark failure unless unresolved acceptance criteria remain at final closure.

### Reproducibility

```text
reproduction_rate = reproduced_findings / findings_attempted
```

A finding that cannot reproduce under its recorded seed/environment is retained as flaky/unconfirmed evidence, not silently promoted to a confirmed defect.

### Recovery

Report by fault class:

```text
recovery_success_rate
recovery_latency_p50/p95/p99
requests_lost_or_controlled_failed
post-heal correctness
```

## 7. Coverage metrics

Track a matrix rather than a single percentage:

```text
fault_class × message_type/interface × execution_phase × expected_outcome_class
```

Example interface dimension:

```text
HTTP
WebSocket
MCP
A2A
native/SDK path where applicable
```

Required report includes:

- generator classes attempted;
- unique mutations executed;
- protocol message types exercised;
- identity/auth paths exercised;
- provider fault classes exercised;
- trust/provenance classes exercised;
- network/storage fault classes exercised;
- seeds executed and completed;
- seeds terminated by budget/lease/infra conditions.

Do not claim code-coverage percentage unless an actual instrumentation tool measured it.

## 8. Resource and amplification metrics

For adversarial amplification/DoS-like cases record:

- provider calls per incoming request;
- verification/dispute fan-out;
- retries/request;
- CPU/memory high-water mark where available;
- queue depth;
- bytes in/out;
- cost/request;
- rejection latency.

A rejected malicious request should not create unbounded downstream paid-provider work.

## 9. Signal vs noise

A finding counts as confirmed when:

- the exact recorded seed/trace reproduces it, or a minimized deterministic reproducer does;
- the failure signature/root cause is distinct or explicitly grouped with an existing issue;
- the issue is not explained solely by an undeclared foreign-series interference event.

A designed reject/fail-closed path is not counted as a defect merely because the request failed.

## 10. Cross-series safety

H/CHAOS-FUZZ is the H test most likely to contaminate D/S/T if misconfigured.

Therefore:

- all mutable fault targets are R2 exclusive;
- provider capacity changes, cache flushes, route changes, partitions and shared-store destructive faults require a lease;
- no fault may target a resource used by an active foreign measured run unless that run is outside the fault domain by construction;
- cleanup verifies `series_id/run_id` ownership before mutation/deletion;
- broad product-wide cleanup is forbidden.

If the required target is leased by another series, H records `WAITING_SHARED_RESOURCE`.

## 11. Repair closure rule

A repaired finding is CLOSED only when:

```text
minimized reproducer passes
original seed passes
neighbor/regression campaign passes
no invariant was weakened
full relevant CI/conformance passes
```

Changing an invariant or excluding the failing input class requires a separate reviewed methodology/version change and cannot retroactively turn the original run green.

## 12. What a PASS can prove

A final closure may support a bounded statement of the form:

> Across M frozen seeds and K declared adversarial fault classes, TRUYN recorded zero critical safety-invariant violations; discovered P distinct failure modes, closed Q before final qualification, and recovered within the reported class-specific latency bands for all accepted recoverable fault classes.

It does not prove absence of unknown vulnerabilities outside the tested generator/fault universe.
