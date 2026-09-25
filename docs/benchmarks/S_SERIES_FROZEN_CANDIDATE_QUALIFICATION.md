# S-Series Frozen Candidate Qualification and Admission

Status: **CANONICAL / NON-BYPASSABLE S-SERIES QUALIFICATION MODEL**  
Applies to: **all S-Series levels and successor attempts, including S-50, S-100, S-200 and S-500**

## Core invariant

Expensive S-Series qualification belongs to a **frozen candidate**, not to moving `main`.

A frozen candidate is the exact public/private candidate SHA pair plus its frozen public/private `BASE_SHA` pair. The expensive Swarm/live/provider evidence remains evidence for that candidate even when either repository `main` moves later.

**Main movement alone MUST NOT invalidate frozen candidate evidence and MUST NOT automatically trigger a full S rerun.**

## Required lifecycle

```text
Frozen Candidate
  public/private candidate SHA + BASE_SHA pair
        |
        v
Branch Qualification
  expensive evidence + per-block fingerprints
        |
        v
Admission to Main
  BASE_SHA -> current main impact analysis
  integration candidate fingerprints
        |
        +--> unchanged S-sensitive fingerprints
        |       reuse frozen evidence
        |
        +--> changed S-sensitive fingerprints
                requalify only affected blocks
                zero paid calls by default
                targeted live proof only if necessary
        |
        v
Final Admission Gate
  analyzed main snapshot still current
  targeted blocks GREEN
  collision/capacity GREEN
        |
        v
merge / exactly-one campaign dispatch
```

## BASE_SHA to current-main analysis is mandatory

Admission MUST compare `PUBLIC_BASE_SHA -> current public main` and `PRIVATE_BASE_SHA -> current private main`. Changed paths are mapped to canonical S-sensitive block surfaces.

A change outside every S-sensitive surface does not invalidate S qualification. A change inside a sensitive surface invalidates only that block's compatibility evidence until targeted requalification proves the integration state.

## Automatic qualification manifest

Every S candidate must emit `truyn.s-series.qualification-manifest/v1` recording frozen candidate/base SHAs, current admission snapshot, candidate and integration fingerprints, changed fingerprints, targeted blocks, reused evidence and the admission decision.

Fingerprints are SHA-256 over canonical sorted path/blob-identity pairs for each S-sensitive block surface. Decisions therefore depend on material code/config content, not branch names or timestamps.

## Integration candidate is mandatory

A historical old GREEN candidate SHA is **never sufficient** to authorize merge or campaign dispatch. Immediately before merge/admission, the system must evaluate compatibility with current main and recalculate fingerprints on the integration state.

If the integration candidate cannot be constructed cleanly, admission is RED. The expensive candidate evidence remains preserved; only admission must be repaired or repeated.

## Targeted requalification only

When admission finds changed S-sensitive fingerprints:

1. identify only affected B01-B22 blocks;
2. run zero-paid/local/isolated compatibility tests mapped to those blocks;
3. reuse frozen candidate evidence for every unaffected block;
4. request targeted live proof only where static/local proof is insufficient;
5. require a new live S successor only when targeted proof cannot establish compatibility.

`main` movement by itself is never a reason for a full paid rerun.

## Final snapshot rule

Admission is bound to the exact current-main snapshot it analyzed. Immediately before merge or campaign dispatch both mains are re-read. If either moved after analysis:

```text
frozen candidate evidence = still valid
admission snapshot         = stale
required action            = rerun the cheap admission analysis only
```

A new expensive qualification is required only when the refreshed admission analysis discovers a material S-sensitive change that cannot be cleared by targeted proof.

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

These rules are part of the S-Series architecture contract and must be regression-tested. Removal or relaxation is itself a contract change and must fail repository tests until intentionally versioned.
