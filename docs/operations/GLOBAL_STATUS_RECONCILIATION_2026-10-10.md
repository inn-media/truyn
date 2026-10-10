# TRUYN cross-repository status reconciliation — 2026-10-10

Scope: public `main` at `35c937adf8e71119681c6f9243e8b00bcfd0c48e`, private `main` at `b21d15c5941f3596de63685d3dd52e31b45dc4aa`. This is a source-bounded audit, not a new benchmark result.

| Area | Evidence-qualified status |
| --- | --- |
| H-Series | 4/4 PASS/CLOSED; H/CHAOS-FUZZ proves isolated product-facing robustness, not physical infrastructure chaos |
| F-Series | Public PR #952 and private PR #444 merged; foundation only; no physical Attempt 1 |
| D-100/200/500/1000 | Accepted bounded network-scale gates; D-500/1000 have repeatability |
| D-5000 | No accepted final PASS established; PRs #950–#954 include Attempt 7–8 repairs and launches; do not describe Attempt 3 as current |
| S-Series | S-10/20/50/100 accepted; S-200+ open |
| T/BREAK-EVEN-REAL | Attempt 6 audited real diagnostic PASS, 57/57 correct; does not prove commercial break-even |
| T/HEAD-TO-HEAD | Negative economic result preserved; commercial superiority gate RED |
| E-Series | Qualification and real pilot work exist, no accepted final E lane established |
| N/SOVEREIGNTY-10 | GREEN control-plane qualification with deterministic fixture values; no final real 50/100-node measured PASS |
| A-Series | Public foundation and extensive private real-cloud preflights/smokes exist; 3600-second A-SOAK Attempt 1 not proven accepted |
| Open 1.0 | Historical S103 snapshot is not current sprint authority; stable 1.0 requires independent G1–G34 reconciliation |
| Managed authority and accounting | Implemented in bounded private TRUYN Platform scopes; live production acceptance remains separate |
| SDK / native clients | Accepted SDK prereleases and four-platform native build qualification; production signing/distribution separate |

## Interpretation

An implemented module is not automatically a measured, accepted, live deployed product. A privately implemented managed component must not be labelled absent just because public Open does not host it. Conversely, a merged private PR is not sufficient to close live operational acceptance.

Published benchmark artifacts, old failed attempts and dated operational records remain immutable. A stale status should be corrected in current-state indexes, not erased from historical evidence.

The public codebase contains roughly 1,400 tracked paths at the starting snapshot. This reconciliation corrects high-impact status indexes and records unresolved historical references; it does not authorize mass deletion of operational scripts without dependency and ownership proof.

Future revisions must re-read exact GitHub main, task anchors and accepted evidence. Dynamic running-job state should never be presented as a permanent README fact.
