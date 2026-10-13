# Class C Proposal B: OUTCOME Registry to P10 Error Compatibility

**Status:** PROPOSED INTERPRETATION, NO NEW PUBLIC ERROR CLASS OR WIRE ENCODING.

## Engineering decision

Preserve the **13** frozen machine-readable P10 public error codes and exact transport-specific response bytes. Core registry OUTCOME entries are abstract taxonomic descriptions, not alternative public tokens. For application-visible duplicate/idempotency conflict, display P10 `conflict` and retain existing legacy machine details. For unexpected internal failure, display `internal_error`. Keep `unavailable` reserved as a semantic family until a separately versioned, tested proposal is admitted.

Only explicit transport failure *before authoritative response* may become `transport_error`. Known backpressure/capacity can classify as `resource_exhausted` when already recognized by P10; bare HTTP 503 or an uninterpreted `unavailable` string cannot justify automatic replay. Provider effects, billing and exactly-once safety always outrank SDK retry hints.

## Why the network benefits

No fragmentation of five SDK public `code` enums, no new inconsistent retry branches, no change to P10 REST/A2A/MCP/NLWeb/WebSocket projections, and no risk of doubling paid provider calls after ambiguous results. Stable 13-code diagnostic vocabulary continues to drive all old/new clients. Exact historical signatures, source error token metadata and benchmark acceptance floors remain unchanged.

This does not promote source terminology to a stable wire identifier. All further additions require a separate RFC, machine corpus and full cross-SDK conformance. See `spec/protocol/v1/errors.md`, `sdk/conformance/v1/p10-error-mapping.json`, `core/protocol/normalized-errors.js` and source `spec/registry/truyn-core-v1.json`.
