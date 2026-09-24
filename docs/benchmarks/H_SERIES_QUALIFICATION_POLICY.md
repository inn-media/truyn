# H-Series Qualification Policy

Status: **BINDING EXECUTION MODEL**

H-Series uses the following model for all lanes:

```text
Frozen Candidate → Branch Qualification → Admission to Main
```

This applies to H/CACHE-COMPOUND, H/SECOND-OPINION, H/ARBITRAGE and H/CHAOS-FUZZ.

## Core rule

**Expensive H-Series qualification belongs to a frozen candidate, not to moving `main`.**

A result is bound to exact candidate SHA plus the frozen benchmark/run manifest. Unrelated movement of `main` does not invalidate already collected candidate evidence.

Main movement triggers admission analysis, not an automatic full rerun.

## Admission rule

Before merge, compare:

```text
BASE_SHA → current main
```

and recompute H-sensitive fingerprints on the integration candidate formed from:

```text
current main + frozen candidate
```

If the main delta does not touch an H-sensitive surface, reuse the frozen candidate qualification/evidence and run only the admission gate.

If the main delta touches H-sensitive components, requalify only the affected blocks. A new live H run is required only when targeted compatibility checks cannot establish validity or when the frozen benchmark contract materially changes.

A GREEN historical branch SHA alone is never sufficient for merge. The final integration state must pass the Admission Gate.

## Required properties

- candidate SHA is explicit and immutable for expensive/live qualification;
- `BASE_SHA` is recorded;
- current main is observed at admission time;
- fingerprints are recomputed on the integration candidate;
- unrelated main movement never forces a full H rerun;
- H-sensitive main movement causes block-scoped requalification first;
- a stale admission snapshot is rerun cheaply against the new main;
- frozen expensive evidence remains valid unless the candidate/frozen inputs change;
- closed H/ARBITRAGE cannot be silently reopened by an admission rerun; a material ARBITRAGE change requires a new versioned successor.

## Public/private boundary

The public repository defines this execution invariant. The private platform repository owns the executable sensitive-surface map, automatic qualification manifest, fingerprints, targeted block tests, live provider bindings and admission workflow.

Private H runs consume an immutable public H contract pin. Mutable public `main` is not an execution dependency, so unrelated public-main movement cannot invalidate a frozen private H candidate.

## Evidence interpretation

An H evidence bundle proves the exact frozen candidate and run manifest that produced it. Admission proves that the already-qualified candidate is compatible with the current merge target. These are separate claims and must remain separate in evidence and automation.
