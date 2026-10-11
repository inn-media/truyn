# TRUYN/1 OBJECT

**Status:** bounded Open 1.0 release-candidate reference/integrity contract. Broader object/state distribution remains extensible.

`OBJECT` represents immutable content addressed by cryptographic digest rather than by physical host location.

## Bounded reference fields

A referenced immutable object in the Open 1.0 profile carries or derives:

- object/reference identifier;
- digest algorithm and digest;
- exact byte size;
- media/content type when known;
- optional filename/display metadata;
- creator/source identity and authoritative provenance where applicable;
- explicit resolver/materialization context when bytes are not inline.

For the accepted bounded artifact profile, SHA-256 is the required integrity digest. The digest is lowercase hexadecimal over the exact materialized bytes. Byte size is the exact length of those same bytes.

## Integrity

A receiver MUST verify both declared byte size and digest before accepting materialized content as the referenced object.

- digest mismatch MUST fail closed;
- size mismatch MUST fail closed;
- absent required integrity metadata MUST fail closed for profiles that claim verified referenced artifacts;
- failed integrity verification MUST NOT be converted into successful application output or authoritative provenance;
- the reference metadata itself does not authorize execution, provider access, tenant access or billing.

## Explicit-only materialization

A URI, URL, filename, resource identifier or other locator is data, not fetch authority.

Referenced content MUST be materialized only through an explicit resolver authorized by the active interoperability/application profile. In the absence of such a resolver, the runtime MUST leave the reference unresolved or fail closed according to the calling profile. It MUST NOT implicitly issue arbitrary HTTP(S), filesystem, MCP, A2A or other network reads merely because a reference contains a locator.

The accepted A2A/MCP referenced-artifact profile is the executable precedent for this rule: explicit resolver only, exact size + SHA-256 verification, and zero implicit arbitrary URL fetches.

## Inline and chunked content

A compatible profile MAY carry bounded inline bytes or explicit chunk references. The same final byte-size and digest rules apply to the reconstructed immutable object. Chunk transport does not change object identity.

Content addressing enables deduplication, cache reuse and retrieval from any explicitly eligible provider/resolver possessing the same object. Mutable knowledge SHOULD use `STATE` that references immutable objects and/or deltas rather than rewriting immutable object identity.

## Verified reference conformance profile (P12)

The bounded Open 1.0 **verified-reference** profile is `truyn.object-reference-integrity/1`.
It does not add `OBJECT` to the five existing signed JSON envelope types,
nor does it activate general distributed OBJECT transport or storage.

The portable SDK projection uses `{ kind: "artifact", ref, mediaType, bytes, sha256 }`:
`ref` is an opaque non-empty identifier (even if formatted as an HTTPS URL),
`bytes` is a non-negative safe integer, and `sha256` is 64 hexadecimal
characters normalized to lowercase. In a verified reference, **both**
`bytes` and `sha256` are mandatory; optional SDK payload fields must not
be misread as evidence of a completed integrity verification.

For compatibility, an A2A integrity claim may spell these as `sizeBytes`
and `digest`; both aliases MUST agree if presented together. The existing
`proto/v1/object.proto` representation uses `ContentObject.size_bytes`,
`digest_algorithm`, raw `digest`, `inline_data`, and explicit `chunks`;
`proto/v1/common.proto` supplies the separate `Reference.id/uri/digest`
shape. A Protobuf `Reference` by itself does **not** prove a byte length,
grant authority, or imply that content has been fetched.

The executable strict verifier is `core/object/integrity.js`. It enforces:
1. required valid SHA-256 + exact byte size before any explicit resolver;
2. a bounded declared size *before* resolution and a bounded actual size *after* resolution;
3. digest/size comparison against the **final reconstructed bytes**, including
   explicitly supplied chunks in their declared order;
4. no synthetic success from an untrusted `verified` flag or from a URI;
5. no fallback, implicit HTTP(S)/file/MCP/A2A fetch, or automatic retry;
6. no expansion of provider, requester, tenant, execution, settlement or billing authority.

`resolveVerifiedObjectReference` requires the caller to install a resolver
explicitly. Without it, a reference remains unmaterialized and strict
resolution fails closed. The resolver must return actual bytes; the verifier
will not dereference a URL string. The local `verifyImmutableObjectBytes`
path verifies already-materialized inline bytes or already-resolved chunks
without performing IO.

Shared protocol vectors live in
`sdk/conformance/v1/p12-object-reference-vectors.json`; exact runtime,
wire/proto and SDK-shape conformance is covered by
`tests/truyn1-p12-reference-integrity.test.js`. The existing accepted
A2A/MCP C6/C8/Sprint E compatibility suite remains independently required.
Those legacy interoperability profiles are not silently tightened or
renegotiated by declaring this **new, opt-in strict** verified-reference
profile. Any adoption of it by another profile must be explicit and tested.
