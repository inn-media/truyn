# TRUYN/1 OFFER

**Status:** release-candidate normative contract for the bounded Open 1.0 core profile. Overall TRUYN/1 remains pre-stable until exact-head and post-merge qualification pass.

`OFFER` advertises that the signed provider node can provide a named capability. It is a revocable provider advertisement, not a requester entitlement or an authorization grant.

## Bounded payload

The bounded Open 1.0 core OFFER payload is:

```json
{
  "capability": { "name": "<non-empty capability name>" },
  "metadata": { }
}
```

Requirements:

- `capability` MUST resolve to one non-empty capability name; the canonical public client emits `capability.name`;
- `metadata` is OPTIONAL and, when present, MUST be a JSON object;
- capability metadata MAY describe safe provider-owned information such as description, schema/version hints, availability/validity, locality, quality/history hints or optional price/usage terms;
- raw provider credentials, cloud secrets, private keys and private authorization tokens MUST NOT be present;
- the envelope `from` identity is the signed provider identity and MUST pass normal envelope/identity verification;
- an accepted OFFER is keyed by its signed envelope `id` and can be invalidated through bounded REVOKE semantics.

A requester is not required to know the provider before issuing a `NEED`.

## Offer is not entitlement

An OFFER does not mean every requester is authorized to discover or execute the capability.

Provider ownership, visibility, grants and billing/entitlement decisions are evaluated separately under `provider-policy.md` and the applicable runtime authority boundary.

Provider-signed metadata may carry compatibility hints such as an access-mode request or an explicit allowlist only where the selected open/reference policy profile defines that behavior. Such metadata MUST NOT override an authoritative server/provider grant source when one is configured and MUST NOT turn requester-controlled owner, tenant or billing fields into authority.

## Default privacy

A newly registered execution provider is private/owner-scoped by default unless the provider deliberately publishes a broader visibility policy through the accepted public/reference policy mechanism or an authoritative managed policy grants it.

An implementation MUST NOT infer `network/public` visibility merely because an OFFER reached a public relay.

## Discovery filtering

Discovery MUST apply authorization/visibility filtering before returning private offers. If a requester learns an offer/provider ID by another route, execution authorization still applies independently before dispatch.

## Stable-v1 acceptance

Stable qualification requires an executable positive signed OFFER vector plus negative tests proving that malformed capability data, invalid signatures, private-offer discovery attempts and forged authority metadata cannot widen execution access.
