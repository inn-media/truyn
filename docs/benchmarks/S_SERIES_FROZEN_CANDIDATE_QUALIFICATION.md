# S-Series Frozen Candidate Qualification and Admission

Status: **CANONICAL / NON-BYPASSABLE S-SERIES QUALIFICATION MODEL**  
Applies to: **all S-Series levels and successor attempts, including S-50, S-100, S-200 and S-500**

## Core invariant

Expensive S-Series qualification belongs to a **frozen candidate**, not to moving `main`.

A frozen candidate is the exact pair:

```text
PUBLIC_CANDIDATE_SHA
PRIVATE_CANDIDATE_SHA
```

with its corresponding frozen bases:

```text
PUBLIC_BASE_SHA
PRIVATE_BASE_SHA
```

The expensive Swarm/live/provider evidence remains evidence for that candidate pair even when either repository `main` moves later.

**Main movement alone MUST NOT invalidate frozen candidate evidence and MUST NOT automatically trigger a full S rerun.**

## Required lifecycle

```text
Frozen Candidate
  public candidate SHA + private candidate SHA
  public BASE_SHA + private BASE_SHA
        |
        v
Branch Qualification
  expensive S evidence belongs to candidate
  automatic per-block S-sensitive fingerprints
        |
        v
main may move independently
        |
        v
Admission to Main
  compare BASE_SHA -> current main in both repos
  map changed files to S-sensitive blocks
  build integration candidate
  recalculate fingerprints on integration state
        |
        +--> no S-sensitive fingerprint changed
        |       reuse frozen candidate evidence
        |
        +--> S-sensitive fingerprint changed
                run only affected targeted blocks
                no paid/full live rerun by default
                live successor only if targeted proof is insufficient
        |
        v
Final Admission Gate
  current mains still equal analyzed admission snapshot
  targeted blocks GREEN
  collision/capacity GREEN
        |
        v
merge / exactly-one campaign dispatch
```

## BASE_SHA to current-main analysis is mandatory

Admission MUST compare changes from each frozen base to the current repository main:

```text
PUBLIC_BASE_SHA  -> current public main
PRIVATE_BASE_SHA -> current private main
```

Changed paths are mapped to the canonical S-sensitive block surfaces. A change outside every S-sensitive surface does not invalidate S qualification.

A change inside a sensitive surface does not automatically invalidate the whole candidate either. It invalidates only the affected block compatibility evidence until that block is requalified on the integration state.

## Automatic S qualification manifest

Every S candidate must emit a machine-readable qualification manifest. The canonical schema is:

```text
truyn.s-series.qualification-manifest/v1
```

The manifest records at minimum:

- frozen public/private candidate SHA pair;
- frozen public/private BASE_SHA pair;
- candidate changes;
- current public/private main SHA during admission;
- BASE_SHA -> current-main changes in both repos;
- candidate per-block fingerprints;
- integration per-block fingerprints;
- changed fingerprints;
- affected/targeted blocks;
- blocks whose frozen evidence is reused;
- admission decision;
- whether a live successor is actually required.

Fingerprints are SHA-256 over canonical sorted `path + git blob identity` pairs for each S-sensitive block surface. This makes the decision depend on material code/config content, not branch names or timestamps.

## Integration candidate is mandatory before merge

A historical GREEN branch SHA is **never sufficient** to authorize merge or campaign dispatch.

Immediately before merge/admission, the system MUST evaluate the integration candidate against current main and recalculate fingerprints.

For the private repository this means the synthetic merge tree of:

```text
current private main + frozen private candidate
```

For the public dependency this means the exact current public source state admitted for compatibility with the frozen private candidate.

If the integration candidate cannot be constructed cleanly, admission is RED. The expensive candidate evidence remains preserved; only admission must be repaired/repeated.

## Targeted requalification only

When admission finds changed S-sensitive fingerprints:

1. identify only the affected B01-B22 blocks;
2. run the zero-paid/local/isolated compatibility tests mapped to those blocks;
3. reuse frozen candidate evidence for all unaffected blocks;
4. request a new live S successor only when targeted qualification cannot prove compatibility or an explicitly changed block requires fresh live proof.

`main` movement by itself is never a reason for a full paid rerun.

## Final snapshot rule

Admission is bound to the exact current-main snapshot it analyzed.

Immediately before merge or campaign dispatch the system re-reads both mains. If either moved after admission analysis:

```text
frozen candidate evidence = still valid
admission snapshot         = stale
required action            = rerun cheap admission analysis only
```

A new expensive qualification is not required unless the new admission analysis discovers a material S-sensitive change that cannot be cleared by targeted requalification.

## Non-bypassable rules

The following are forbidden across the entire S-Series:

- invalidating expensive candidate evidence merely because `main` moved;
- automatically rerunning the whole S campaign after unrelated main movement;
- merging or dispatching from an old GREEN candidate SHA without current-main admission;
- skipping `BASE_SHA -> current main` analysis;
- skipping integration-candidate fingerprint recalculation;
- silently treating a sensitive change as unrelated;
- silently reusing evidence for a block whose fingerprint changed;
- weakening acceptance thresholds to preserve GREEN;
- rewriting or deleting historical S evidence to make a new admission look clean.

These rules are part of the S-Series architecture contract and must be regression-tested. Removal or relaxation of the rules is itself a contract change and must fail repository tests until intentionally versioned.
