# TRUYN/1 REVOKE

**Status:** bounded Open 1.0 release-candidate contract for NEED cancellation and OFFER revocation. Other revocation target kinds remain outside this bounded stable profile until separately specified and qualified.

`REVOKE` invalidates or supersedes a previously valid revocable object without erasing its historical provenance.

## Bounded Open 1.0 target namespaces

The bounded Open 1.0 profile defines two explicit target namespaces:

- `targetKind: "need"` — requester-owned cancellation of an accepted or pending `NEED`;
- `targetKind: "offer"` — provider/owner-controlled revocation of an `OFFER`.

`targetId` is interpreted only inside the declared `targetKind` namespace. A receiver MUST NOT allow an identifier collision between `NEED` and `OFFER` to make the target ambiguous. If a legacy request omits `targetKind` and the identifier exists in more than one revocable namespace, the receiver MUST fail closed rather than guess.

The signed payload for the bounded JSON profile contains:

- `targetId` — non-empty target identifier;
- `targetKind` — `need` or `offer` for new bounded-profile requests;
- `reason` — bounded human/machine-readable cancellation or revocation reason.

The signed TRUYN envelope authenticates the revocation issuer. Requester-controlled payload fields never override that cryptographic issuer identity.

## NEED cancellation authority

For `targetKind: "need"`, the authoritative issuer is the cryptographic requester that created the target `NEED`.

A receiver MUST verify that the signed `REVOKE` envelope `from` identity equals the authoritative requester recorded for the target request. A different principal MUST be rejected and MUST NOT change request state, abort provider work, consume provider capacity, or suppress a legitimate result.

A valid requester-owned cancellation transitions the request into the bounded terminal cancellation state. Retrying the same authoritative cancellation MAY be treated idempotently. Cancellation propagation to already matched provider work is transport/runtime behavior, but it MUST preserve the same requester authority.

Chain-stage cancellation is not claimed by this bounded profile unless a separately qualified contract explicitly enables it.

## OFFER revocation authority

For `targetKind: "offer"`, only the cryptographic owner/provider identity bound to the target `OFFER` (or another authority explicitly authorized by the applicable provider-policy contract) may revoke it.

Requester-controlled owner, tenant, provider, billing, metadata, or reason fields MUST NOT grant revocation authority.

Revoking an `OFFER` changes its current discoverability/validity but does not rewrite historical provenance or retroactively change the identity of work already accepted under the previous valid offer.

## Terminal and provenance invariants

Revocation does not erase historical provenance. It changes current validity/lifecycle state.

For a successfully cancelled `NEED`, receivers MUST reject provider output that would mutate the request after terminal cancellation. The detailed late `PARTIAL`/`RESULT` suppression and state-resurrection rules are specified by the RESULT/PARTIAL lifecycle contract and executable cancellation regressions.

A `REVOKE` that targets a missing object, an object already in an incompatible terminal state, an unsupported target namespace, or an object owned by another principal MUST fail deterministically and MUST NOT broaden authority.

## Future revocation targets

Claims, credentials, key bindings, capabilities, subscriptions, trust receipts and other security-sensitive objects may define revocation semantics in future compatible profiles. They are not silently promoted into the bounded Open 1.0 REVOKE contract by this document.

Security-critical key/credential revocations, when later specified, SHOULD receive high propagation priority and short cache invalidation latency without weakening issuer authorization.
