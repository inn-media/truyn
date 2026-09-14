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
