# S-Series Swarm-Blockwise Admission

Status: **architecture contract**

Swarm-Blockwise is a campaign launch/qualification discipline. It is **not** a TRUYN network runtime, routing mode, provider runtime, or replacement for the S-Series benchmark contract.

The canonical source-binding model for all S-Series work is [S-Series Frozen Candidate Qualification and Admission](S_SERIES_FROZEN_CANDIDATE_QUALIFICATION.md).

## Why S-Series uses it

S-Series consumes real inference from the fixed seven-provider set: GPT, Gemini, Grok, DeepSeek, Llama, Mistral and Kimi. A transport or lifecycle defect discovered only after a full S campaign therefore costs materially more than the same defect discovered in a no-inference diagnostic run.

The S-50 WebSocket heartbeat/backpressure failure class is representative: persistent provider sockets, heartbeat closure, `1013 socket_backpressure`, reconnect and exactly-once reconciliation are admission concerns and must be exercised before a paid campaign.

## Frozen Candidate -> Branch Qualification -> Admission to Main

The expensive qualification target is an immutable candidate pair, not moving `main`:

```text
PUBLIC_BASE_SHA  -> PUBLIC_CANDIDATE_SHA
PRIVATE_BASE_SHA -> PRIVATE_CANDIDATE_SHA
                         |
                         v
                S-Series diagnostic Swarm
                   fail-collect DAG
                         |
                  complete evidence
                         |
                         v
                candidate Blockwise gate
                    B01 ... B22
                         |
                    22/22 GREEN
                         |
              frozen candidate evidence
                         |
            main may move independently
                         |
                         v
                Admission to current main
          BASE_SHA -> current-main impact analysis
          integration-candidate fingerprints
                         |
             +-----------+-----------+
             |                       |
      no sensitive drift       sensitive drift
             |                       |
      reuse candidate          targeted affected
         evidence              blocks only
             |                       |
             +-----------+-----------+
                         |
               final current-main reread
               collision/capacity check
                         |
                         v
                  ONE paid campaign
```

**Main movement alone does not invalidate the frozen candidate.** It invalidates only an admission snapshot that was computed against an older main.

A RED candidate block is localized and repaired without weakening acceptance. The affected blocks and aggregate are then requalified on the new frozen candidate pair. Historical candidate evidence remains immutable.

## Automatic qualification manifest

Every candidate/admission cycle must emit `truyn.s-series.qualification-manifest/v1` containing candidate/base identity, per-block fingerprints, BASE_SHA -> current-main changes, integration fingerprints, changed fingerprints, targeted blocks and reused evidence blocks.

Fingerprints are content-derived from canonical sorted path/blob identities. Branch labels, timestamps and the mere fact that main moved are not qualification inputs.

Before merge or campaign dispatch the final Admission Gate must recalculate fingerprints on the integration state. **An old GREEN branch SHA by itself can never authorize merge or launch.**

## B01-B16: shared accepted network substrate

S-Series inherits the accepted Class-D networking substrate. The S execution namespace may invoke the same reusable public modules and regression suites, but it must not call D-Series launchers, mutate D-Series campaign state, or write D-Series evidence.

| Block | Admission domain |
|---|---|
| B01 | contracts / repository boundary |
| B02 | runtime bundle / staging |
| B03 | cloud control-plane contract |
| B04 | topology / placement |
| B05 | process startup / identity |
| B06 | bootstrap / refresh / heartbeat |
| B07 | readiness / leases / backpressure |
| B08 | baseline routing |
| B09 | restart injection |
| B10 | post-restart routing |
| B11 | healing / convergence / recovery |
| B12 | durable writes / retention |
| B13 | adversarial partition / collision |
| B14 | safety / security negative paths |
| B15 | resources / telemetry / evidence |
| B16 | cleanup / terminal assembly |

B05-B07 must include the persistent WebSocket failure class relevant to S providers, not only short request/response transport checks.

## B17-B22: S-only admission extensions

These blocks are not copied from D-Series because Class D has no paid inference semantics.

### B17 — provider-access-quota

All seven required provider families must be reachable under the intended benchmark entitlement/capacity. `blocked_access`, missing deployment, missing quota or missing entitlement is RED/incomplete. A provider may not be silently replaced.

### B18 — provider-websocket-pressure

Exercise the provider-facing persistent WebSocket path at S-50 scale before the campaign:

- 50 persistent sockets across multiple heartbeat cycles;
- explicit `1013 socket_backpressure` closure;
- reconnect and reconciliation;
- exactly one provider execution / exactly one terminal result.

### B19 — correctness-retrieval

Fixed gate: answer/retrieval correctness **>= 99%**.

### B20 — provenance-minimal-context

Fixed gates:

- provenance verification **100%**;
- minimal-context correctness **100%**.

### B21 — zero-block-id-leakage

Internal block-ID leakage is **0**. The caller supplies natural-language question + root context identity, not the answer block identifier.

### B22 — paired-economics

A paired direct-vs-TRUYN micro qualification must prove before the campaign:

- provider input-token reduction **>= 90%**;
- comparable variable inference-cost reduction **>= 90%**.

This gate is deliberately small: it validates that the economic mechanism still works without paying for a full S campaign merely to discover a broken context path.

## Targeted requalification after main movement

Admission compares:

```text
PUBLIC_BASE_SHA  -> current public main
PRIVATE_BASE_SHA -> current private main
```

Only changes intersecting an S-sensitive block surface can require requalification. Even then, the default response is **targeted block qualification**, not a full S rerun.

Unchanged block fingerprints reuse the frozen candidate evidence. Changed block fingerprints must be cleared on the integration candidate. A fresh live S successor is required only when targeted/local proof cannot establish compatibility or the changed block explicitly requires new live evidence.

## Isolation

S execution state belongs to the S namespace. In particular:

```text
.github/s-series/...
S-Series workflow names
S-Series artifact names
S-Series run identities
```

must not be replaced by D-Series launchers/namespaces. Reusable public network modules may be shared; launcher state and evidence may not.

## Immutable campaign rule

Historical S attempts remain immutable and are never reused as a cheap retry mechanism. A successor attempt receives a new attempt identity.

A paid campaign is dispatchable only when:

1. frozen-candidate Swarm/live/Blockwise evidence is GREEN for the exact candidate pair;
2. an Admission-to-Main manifest exists for the current public/private main snapshot;
3. every changed S-sensitive fingerprint has targeted GREEN compatibility evidence;
4. the final admission snapshot is still current;
5. shared-resource/capacity collision checks are GREEN;
6. duplicate/single-shot history is clean.

If either main moves after admission analysis, **rerun the cheap admission analysis only**. The frozen candidate evidence remains valid unless the new analysis discovers a material sensitive change that cannot be cleared without a new live successor.
