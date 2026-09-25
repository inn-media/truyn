# H-Series SECOND-OPINION v2 — Hidden Final Lineage 2 Outcome

Status: **INVALIDATED_BY_INFRASTRUCTURE_EXPOSURE / NOT_EVALUATED**

Date: 2026-09-25

## Immutable run identity

- workflow run: `36165951631`
- exact private candidate SHA: `54523584cb0a456d861fea85088eb7888194f965`
- artifact: `10881136706`
- artifact digest: `sha256:2547c1c4ad13cbee573524c3169ba60c98a8dc47a2f25e53a5f62ef189d6bdab`

## Classification

Lineage 2 is **not a scientific PASS or FAIL**. The run stopped before all 200 hidden items completed and before final Gate A/B/C/D evaluation.

The terminal event was an authentication-lifecycle infrastructure failure: the Vertex credential expired during the long-running final measurement and the request was rejected as unauthenticated.

At abort, 140 of 200 items were complete. Partial evidence is not admissible for final gates and may not be combined with a successor.

Because partial execution evidence exposed part of the hidden holdout, Lineage 2 is no longer eligible to be reused as a previously unseen public headline holdout.

## What this outcome does not change

This outcome does not modify the frozen SECOND v2 scientific contract, trust calibration, provider set, baselines, thresholds, bootstrap procedure, cost cap, or latency acceptance envelope.

A successor lineage must use a prospectively frozen new hidden sample and must close credential-lifecycle resilience before any measured provider call.
