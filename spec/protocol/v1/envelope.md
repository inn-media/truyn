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

## Canonical unsigned representation

For signing and verification, the **unsigned envelope** is the complete bounded JSON envelope with the top-level `signature` member removed and every other present member preserved. Implementations MUST NOT drop `to: null`, payload members, or unknown optional members merely because their value is false, zero, empty, or null unless a separately negotiated schema explicitly defines that omission.

The unsigned value is encoded as **TRUYN Canonical JSON v1 (TCJ1)**:

1. JSON objects are serialized with member names sorted lexicographically by UTF-16 code units, recursively at every object depth.
2. JSON arrays preserve their original order.
3. Strings preserve Unicode scalar content and are encoded as UTF-8; only JSON-required escaping is emitted for quotation mark, reverse solidus and control characters U+0000 through U+001F. HTML characters such as `<`, `>` and `&` are not specially escaped.
4. JSON numbers MUST be finite. `NaN`, positive/negative infinity and implementation-specific non-JSON numeric values are invalid. Numeric serialization MUST use a shortest round-trippable JSON representation and MUST NOT depend on locale.
5. No insignificant whitespace, byte-order mark, trailing newline, or other prefix/suffix bytes are emitted.
6. JSON literals are exactly `true`, `false`, and `null`.

The resulting UTF-8 byte sequence is the canonical signed representation. A verifier MUST reproduce the same bytes from the received unsigned envelope before signature verification. A language/runtime that cannot reproduce TCJ1 exactly MUST fail compatibility rather than invent a language-specific signing representation.

Cross-language golden vectors are required before stable-v1 qualification; the current pre-stable SDK implementations must be reconciled to TCJ1 where their default JSON serializer differs.

## Signature algorithm and domain

The bounded Open 1.0 core identity-key profile uses **Ed25519** signatures over the TCJ1 bytes of the unsigned envelope.

TRUYN/1 deliberately does **not** prepend an additional out-of-band byte prefix to the signed message. Signature domain separation is carried inside the authenticated object itself by the required exact `protocol: "TRUYN/1"` member together with the bounded envelope structure and `type`. Therefore:

- the signed bytes are exactly `TCJ1(unsignedEnvelope)`;
- `signature` itself is excluded from the signed value;
- `protocol`, `type`, `id`, `from`, `to` when present/emitted, `createdAt`, `publicKey`, `payload`, and every other present optional member are inside the signed value;
- changing the protocol generation, type, correlation identifiers, routing metadata, creation time, key, payload, or an optional member after signing MUST invalidate verification;
- a signature generated for another protocol generation or non-envelope signed object MUST NOT be accepted merely because the same Ed25519 key is used;
- the core envelope signature encoding is standard Base64 and MUST decode to exactly 64 Ed25519 signature bytes.

This no-extra-prefix rule preserves the already deployed pre-stable signed-envelope byte domain while making the domain explicit and testable. A future protocol generation MAY define a different explicit domain construction, but it cannot silently alter TRUYN/1 verification semantics.

Expiry/replay acceptance windows, Node-ID derivation and normalized error codes are frozen by the following protocol-RC micro-sprints and MUST remain compatible with this field/canonicalization/signature contract.

## Authority boundary

Envelope fields are signed requester/provider statements, not an automatic source of managed account, tenant, provider ownership, entitlement or billing authority. Execution-capable transports MUST converge on the same server/runtime authorization boundary before provider execution.
