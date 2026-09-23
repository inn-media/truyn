# Documentation Sanitation — 2026-09-23

**Scope:** repository-wide documentation reconciliation against public `main` snapshot `eb25f0f8ad5bedb643f007ddfb0da107dab44b89` and durable GitHub task anchors.

This sanitation does not rewrite historical benchmark evidence. It corrects current-state wording and establishes a durable rule for future documentation maintenance.

## Reconciled facts

### Network scale

- Class C WAN: accepted.
- Class D-100: accepted.
- Class D-200: accepted; independent repeatability also accepted.
- Class D-500: execution/qualification machinery exists and multiple immutable launcher generations exist, but **no accepted D-500 terminal PASS is claimed**.
- Class D-1000: open.
- Permanent D-Series execution architecture is Swarm diagnostics/repair followed by mandatory full B01–B16 exact-SHA admission and live/collision gates before one real scale run. Issue #737 is the durable architecture-lock anchor.

### S-Series

The old repository wording `DEFINED / NOT YET EXECUTED` is stale.

S-50 has been executed diagnostically. Durable issue #726 records Attempt 13 as an immutable failure in the real 50-actor benchmark with `fast_socket_closed` after setup gates passed. Current public repair scope is WebSocket heartbeat/backpressure classification, 50-socket stability and reconnect/reconciliation without duplicate execution.

Therefore the factual status is:

**S-Series = EXECUTED / DIAGNOSTIC / NO ACCEPTED S PASS.**

A failed or diagnostic attempt is evidence, but not acceptance.

### E-Series

The previous blanket wording `NOT YET EXECUTED` is too strong. E-Series has active qualification/isolation/provider-smoke work. No final E/DECOMPOSE, E/PER-RESULT, E/KNEE or E/DEGRADE PASS is claimed.

Therefore the factual status is:

**E-Series = ACTIVE QUALIFICATION / NO FINAL E PASS.**

### Open 1.0

Issue #615 is the durable task anchor. At this snapshot:

- S01–S102 are completed;
- S103 is active on a task branch;
- S103 is not yet accepted into `main`;
- stable Open 1.0 remains forbidden until the full sequence and independent G1–G34 reconciliation complete.

### SDK / release ecosystem

Five first-party SDK clients are implemented and share executable conformance. Accepted immutable public releases remain:

- PyPI `truyn-sdk==0.1.0a1`;
- Go `github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1`;
- npm `@truyn/sdk@0.1.0-alpha.2`.

Maven Central and NuGet remain open.

## Documentation-state vocabulary

Current-state documentation must use these terms consistently:

- **implemented** — code/contracts exist and are test-covered;
- **exercised / diagnostic** — a real run occurred but did not close the gate;
- **accepted** — immutable evidence satisfies the fixed acceptance contract;
- **open** — acceptance is not closed.

Do not use `implemented` as a synonym for `accepted`, and do not use `executed` as a synonym for `passed`.

## Evidence preservation

Historical benchmark and acceptance evidence remains append-only under the existing **redact-not-delete** policy. Sanitation may correct indexes, summaries and current-state documents, but must not rewrite failed runs into success or delete evidence merely because it is old, failed or inconvenient.

## Canonical source order

When current-state documents disagree, use this precedence:

1. normative protocol/specification files for semantics;
2. immutable benchmark/evidence reports for accepted measured facts;
3. durable task anchors/issues for active execution state;
4. `docs/operations/NETWORK_SCALE_STATUS.md` for D-Series operational acceptance;
5. `docs/architecture/IMPLEMENTATION_STATUS.md` for repository-wide factual maturity;
6. `ROADMAP.md` for future gates;
7. README/index pages as summaries only.

## Known stale wording corrected by this sanitation

The following repository-wide claims must no longer be repeated as current facts:

- `S-Series: DEFINED / NOT YET EXECUTED`;
- `No S-Series workflow/run has been accepted yet` when used to imply no run ever occurred;
- `E-Series: NOT YET EXECUTED` as a blanket statement;
- snapshot date `2026-09-20` in current-status summaries without qualification.

Correct replacements are:

- S-Series: **executed diagnostically; no accepted S PASS**;
- E-Series: **active qualification; no final E PASS**;
- D-500: **active qualification/open; no accepted terminal PASS**;
- Open 1.0: **S01–S102 complete, S103 active, stable 1.0 not reached**.

## Non-goals

This sanitation does not:

- modify runtime behavior;
- weaken any acceptance threshold;
- relaunch D/S/E campaigns;
- convert diagnostic attempts into PASS;
- change private/public ownership boundaries;
- rewrite immutable benchmark reports.
