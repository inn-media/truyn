# P10 — TRUYN/1 RC normalized error parity: accepted

**Status:** CLOSED for the bounded P10 release-candidate error-parity scope.
**Accepted on:** 2026-10-12. **Not a Stable TRUYN/1 declaration.**

## Scope, implementation and negative evidence

* Canonical specification: [`spec/protocol/v1/errors.md`](../../spec/protocol/v1/errors.md).
  Thirteen stable normalized classes; no private details or new protocol generation.
* Canonical executable mapping: [`sdk/conformance/v1/p10-error-mapping.json`](../../sdk/conformance/v1/p10-error-mapping.json);
  20 source/status/retry mapping cases verified by JavaScript/TypeScript, Python,
  Go, Java and .NET SDK conformance.
* Runtime classifier: [`core/protocol/normalized-errors.js`](../../core/protocol/normalized-errors.js);
  server-side REST/MCP/A2A/WebSocket projections preserve source native codes
  and JSON-RPC reasons; NLWeb pinned compatibility preserves its original profile
  error code while exposing the TRUYN classification.
* [`tests/p10-error-parity.test.js`](../../tests/p10-error-parity.test.js):
  REST/MCP/A2A cross-surface negative errors, bounded messages and no diagnostic
  leakage, a real authenticated WebSocket negative frame, and NLWeb source behavior.
* No provider credentials, owner-paid inference or deployment mutations are required
  to qualify this offline/public-protocol acceptance scope.

## Immutable qualification links

| Checkpoint | Reference | Result |
|---|---|---|
| Implementation PR | [#1046](https://github.com/inn-media/truyn/pull/1046) | merged |
| Exact PR head | [`7a961e9952409ea22b3abec1d93b4a61af490ae6`](https://github.com/inn-media/truyn/commit/7a961e9952409ea22b3abec1d93b4a61af490ae6) | source frozen |
| PR CI on that head | [run 38218279138](https://github.com/inn-media/truyn/actions/runs/38218279138) | SUCCESS: DCO, security, regression, component, integration, network, five-SDK release and full qualification |
| Merged main SHA | [`ffb86ec080455797dbdc1ce1c3ff962a1834fa78`](https://github.com/inn-media/truyn/commit/ffb86ec080455797dbdc1ce1c3ff962a1834fa78) | exact released tree |
| Merged-main CI | [run 38218804593](https://github.com/inn-media/truyn/actions/runs/38218804593) | SUCCESS: security, component, network, integration, regression, five-SDK release, full qualification |

## Acceptance limits

The `code` is semantically identical across the required projections;
interface-specific native wire formats, native numeric error IDs and source
reason fields intentionally differ. `retryable` is advisory only: it
does not authorize automatic duplicate dispatch or override authorization,
rate/quota limits, idempotency or exactly-once settlement.

This closes the **bounded P10 parity gate only**, not the overall TRUYN/1
Stable v1 readiness ledger, SDK publication guarantees, performance targets,
operations migration or unrelated P-series/D-series gates.
