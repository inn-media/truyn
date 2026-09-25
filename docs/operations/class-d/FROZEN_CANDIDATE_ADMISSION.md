# D-Series Frozen Candidate Qualification and Admission

State: **LOCKED for all D-Series testing until `ALL_D_SERIES_TESTS_COMPLETE`**.

Machine authority:

- `config/d-series-frozen-candidate-policy.json`
- `config/d-series-swarm-blockwise-architecture-lock.json`
- `scripts/verify-d-series-frozen-candidate-policy.mjs`
- `scripts/verify-d-series-swarm-blockwise-architecture-lock.mjs`

## Permanent model

`Frozen Candidate -> Branch Qualification -> Admission to Main`

Expensive D-Series qualification belongs to a frozen candidate commit and its tree. It does **not** belong to a moving `main`.

The candidate records a `BASE_SHA`, exact candidate SHA/tree, successful Sanitation Swarm evidence, successful full B01-B16 Blockwise evidence, and D-sensitive fingerprints in `d-series-qualification-manifest.json`.

While that qualification runs, `main` may move normally. A main movement does not cancel the candidate and does not automatically invalidate its expensive evidence.

## Main movement rule

Admission always compares:

`BASE_SHA -> current main`

The result is classified against the machine-readable D-sensitive surfaces.

- If no D-sensitive surface changed, the expensive frozen-candidate evidence remains valid. Admission rebuilds the integration candidate, recomputes D-sensitive fingerprints, requires them to match the qualified candidate, runs the small integration gate, and may admit without another expensive D run.
- If D-sensitive surfaces changed, Admission selects the mapped B01-B16 blocks and reruns **only those blocks** on the integrated state.
- Main movement must never trigger an automatic full D-Series rerun.
- A new live D run is required only when the changed D-sensitive surface is explicitly marked `liveRerunRequired` by the locked policy. This requirement is fail-closed; it must not be bypassed by relabeling a change as unrelated.

## Final Admission Gate is mandatory

A GREEN branch/candidate SHA is never merge authority by itself.

Before merge, the system must construct the state produced by combining the frozen candidate with the then-current `main`, compute its integration tree, recompute D-sensitive fingerprints and run `D-Series Admission Gate`.

The Admission artifact binds at minimum:

- `BASE_SHA`
- frozen candidate SHA and tree
- current main SHA and tree
- integration tree SHA
- qualification policy digest
- Sanitation Swarm run
- Blockwise run
- `BASE_SHA -> current main` changed paths
- per-surface candidate and integration fingerprints
- impacted Bxx blocks
- whether expensive evidence is reusable
- whether fresh live evidence is required
- final admission status.

If `main` moves after Admission, that Admission is stale. Re-run the cheap Admission analysis against the new `main`; do **not** rerun the expensive qualification merely because main moved.

## Anti-bypass rule

The old model — “qualification is valid only while tested SHA equals current `main`” — is retired for D-Series expensive qualification.

It is equally forbidden to replace it with the unsafe opposite — “old GREEN candidate may merge directly”. The integration Admission Gate remains mandatory.

The architecture lock, policy verifier, regression tests, and launch verifier all enforce this. Removing, bypassing, weakening, renaming out of enforcement, or silently restoring the old exact-current-main qualification model requires an explicit user-authorized architecture change.
