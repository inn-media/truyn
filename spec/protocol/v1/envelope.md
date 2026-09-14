# TRUYN/1 Bounded Core Envelope

**Status:** release-candidate normative contract for the bounded Open 1.0 core profile. Overall TRUYN/1 remains pre-stable until exact-head and post-merge qualification pass.

This document freezes the JSON signed-envelope contract used by the shared runtime and first-party Developer Release clients. The Protobuf files remain machine-readable protocol-development schemas; they do not override this bounded runtime contract where their broader draft object vocabulary is not yet promoted into the Open 1.0 core profile.

## Required fields

A bounded core envelope MUST contain all of the following top-level fields:

| Field | Required form | Semantics |
|---|---|---|
| `protocol` | non-empty string, exactly `TRUYN/1` for this generation | protocol generation identifier |
| `type` | one of the bounded core message kinds | message semantic kind |
| `id` | non-empty string | message/request correlation identifier |
| `from` | non-empty string | sender TRUYN Node ID |
| `createdAt` | non-empty RFC 3339 / ISO-8601 timestamp string | sender creation time |
| `publicKey` | non-empty public-key string accepted by the identity profile | verification key material for the current public runtime identity path |
| `payload` | non-null JSON object | type-specific bounded payload |
| `signature` | non-empty string using the accepted signature encoding | signature over the canonical unsigned envelope |

The bounded core message kinds are defined in `core.md` and MUST agree with the executable `MVP_TYPES` set.

## Optional field

`to` is optional routing/correlation metadata. The canonical runtime currently emits it explicitly as either a non-empty destination Node ID or `null`. A requester-controlled `to` value never grants provider authorization or tenant/billing authority.

Unknown optional fields MAY be ignored only when they do not claim required semantics or authority. An implementation MUST fail closed when it is asked to process an unknown required semantic extension.

## Required-field validation

For the bounded Open 1.0 core profile:

- missing required fields MUST be rejected before signature-dependent dispatch;
- empty-string identifiers, protocol, key or signature material MUST be rejected as missing/invalid required data;
- `payload` MUST be a non-null JSON object and MUST NOT be an array;
- an unsupported `protocol` MUST be rejected;
- an unsupported `type` MUST be rejected;
- `from` MUST match the Node ID derived from `publicKey` under the identity profile;
- a malformed/unparseable creation timestamp MUST be rejected;
- validation failure MUST NOT cause provider execution.

Expiry/replay acceptance windows, canonical signing bytes, signature domain, Node-ID derivation and normalized error codes are frozen by the following protocol-RC micro-sprints and MUST remain compatible with this field contract.

## Authority boundary

Envelope fields are signed requester/provider statements, not an automatic source of managed account, tenant, provider ownership, entitlement or billing authority. Execution-capable transports MUST converge on the same server/runtime authorization boundary before provider execution.
