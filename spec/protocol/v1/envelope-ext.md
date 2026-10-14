# TRUYN/1 negotiated envelope metadata

**Profile:** `truyn.envelope.ext/1`. This additive profile preserves the five signed JSON kinds and TCJ1/Ed25519 domain. It does not admit Stable TRUYN/1 or a new protobuf wire codec.

`ext` is optional and signed. Absence is exactly the legacy profile. A legacy verifier retains all present members in the signature and does not enforce extension semantics. A sender may emit new profile metadata only after an authenticated agreement includes `truyn.envelope.ext/1`. Passive advertisement or a field in the envelope is not that agreement. Required unsupported support fails with `version_mismatch` before sending or executing.

After successful signature verification, a negotiated receiver validates the following before dispatch:

| Field | Contract |
|---|---|
| `ext` | JSON object, at most 16 keys and 1024 TCJ1 UTF-8 bytes; empty object accepted |
| Key | ASCII `[A-Za-z][A-Za-z0-9]{0,31}` |
| Value except `crit` | String of 1–128 ASCII characters `[A-Za-z0-9._:;=/+-]`; no whitespace, nested values or numbers |
| `traceId` | Exactly 32 lowercase hexadecimal characters, not all zero; correlation only |
| `expiresAt` | Exactly `YYYY-MM-DDTHH:mm:ss.sssZ`, valid UTC calendar time, later than signed `createdAt` |
| `priority` | `background`, `normal` or `critical`; local policy may downgrade critical to normal |
| `contentType` | `application/json` or `application/json;profile=<id>`, where id is `[a-z0-9][a-z0-9._/-]{0,95}` |
| `crit` | At most 16 distinct valid key names, each present in this same object; must not name `crit` itself |

Known keys are exactly the five names above. Unknown noncritical fields are retained and ignored. Unknown critical fields fail closed. Supported payload profiles are `application/json` and `application/json;profile=truyn.<lowercase-envelope-type>/1`; admitting another profile requires an implemented versioned contract. A syntactically valid unsupported profile is `unimplemented`, not a parse failure.

| Failure | Reason | Detail |
|---|---|---|
| Signature mutation, removal or injection | `invalid_signature` | Signature verification happens first |
| Shape, character, count or size bound | `invalid_argument` | `invalid_ext` or `invalid_ext:<key>` |
| Unknown critical key | `version_mismatch` | `required_semantic_unavailable:<key>` |
| `now > expiresAt + 30000 ms` | `deadline_exceeded` | `envelope_expired` |
| Unsupported payload profile | `unimplemented` | `unsupported_content_type` |

The skew boundary itself is accepted. Expiry bounds admission, not completion, and does not replace registration freshness, replay retention, provider policy or `NEED.policy.deadline`. It never permits deletion of a nonterminal duplicate ledger entry. Receivers must recheck at the actual execution boundary after queueing. Existing signatures are never edited to add tracing. Applications copy a verified request trace into a newly signed response when both peers support this profile; compact PARTIAL remains its existing separate signed domain.

HTTP relay support is explicitly enabled with `createRelay({envelopeExtensions:true})`, off by default. The signed IDENTITY advertisement and authenticated relay session determine the agreement. Strict NEED dispatch requires a provider session with matching support. Relay event metadata carries the original negotiated context separately from the unchanged signed envelope, including in the durable outbox. A recipient must not apply its own session's semantics to a legacy sender. TypeScript/Node verifies this context before processing events.

QUIC stores the agreement from the signed HELLO/ACCEPT handshake on the actual connection. Its envelope handler checks that agreement, the signature and session sender binding before dispatch. Legacy sessions remain legacy. No compact, HELLO, ACCEPT, DHT or protobuf field is redefined.

Native SDK low-level APIs accept the authenticated agreement explicitly: Python `verify_envelope(..., negotiated_semantics=...)`, Go `VerifyEnvelopeWithOptions`, Java `EnvelopeExtensions.verify`, .NET `EnvelopeExtensions.Verify`; all use the same native crypto verifier as their existing live client. Native emitters reject missing agreement and invalid metadata. Their existing high-level relay clients continue the legacy profile until an application explicitly uses the negotiated API; they must not advertise implicit ext support. TypeScript exports the bundled runtime API from `envelope.ts`.

The shared source qualification covers 5 signed golden envelopes and 80 ext/crypto cases per SDK (425 outcomes). Negatives with valid signatures separately prove semantic rejection; crypto mutations reject even with legacy semantics. Registry publication and private-consumer activation require separate exact-artifact evidence.
