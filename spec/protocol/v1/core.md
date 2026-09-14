# TRUYN/1 Core

**Status:** release-candidate normative contract for the bounded Open 1.0 core profile. TRUYN/1 as a whole remains pre-stable until the protocol RC exact-head and post-merge qualification gates pass.

TRUYN/1 defines a logical overlay protocol over existing IP transport. IP addresses are underlay reachability information; cryptographic Node IDs are logical identities.

## Envelope invariants

Every top-level exchange in the bounded Open 1.0 core profile MUST include:

- protocol generation (`TRUYN/1` / numeric equivalent);
- message ID;
- sender Node ID;
- creation time;
- exactly one payload;
- cryptographic signature over the canonical signed representation.

Receivers MUST reject unsupported protocol generations and invalid signatures according to local security policy.

## Bounded Open 1.0 core message vocabulary

The release-candidate top-level message vocabulary is frozen to the message kinds already implemented by the shared signed-envelope runtime and exercised by the first-party Developer Release path:

- `IDENTITY`;
- `OFFER`;
- `NEED`;
- `RESULT`;
- `REVOKE`.

This set is intentionally bounded. Implementations MUST NOT advertise another top-level message kind as part of the stable Open 1.0 core profile unless that kind is added by an explicitly versioned/negotiated protocol extension with executable conformance evidence.

The shared runtime constant `MVP_TYPES` is the executable source for this bounded envelope vocabulary and MUST remain exactly aligned with the list above for the Open 1.0 core profile.

`PARTIAL` is a signed streaming/lifecycle record in the current compact/runtime profile rather than an additional top-level core envelope kind; its bounded ordering/idempotency/terminal semantics are specified separately during the protocol RC lifecycle work.

## Extended protocol objects

The broader TRUYN/1 architecture also defines `OBJECT`, `CLAIM`, `ATTEST`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE` and `TRUST_RECEIPT`, with `CAPABILITY` as a reusable descriptor. Their schemas/specifications remain available for protocol development and explicitly negotiated extensions, but this release-candidate text does not silently promote them into the bounded stable Open 1.0 core message set before executable conformance proves the required semantics.

Evidence and provenance are referenced objects/relationships rather than separate mandatory core envelope types.

## Verification behavior

`CHALLENGE`, `VERIFY`, `DISPUTE` are composed behaviors. See `verification.md`.

## Compatibility

Unknown optional fields SHOULD be ignored when the wire encoding permits it. A node MUST NOT reinterpret a field with incompatible semantics inside the same protocol generation. Breaking semantic changes require a new protocol generation or an explicitly negotiated extension.
