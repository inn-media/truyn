# TRUYN Public / Private Information Boundary

**Status:** approved documentation and architecture policy.

## Rule of thumb

> If information explains **how TRUYN should work**, it is generally public.  
> If information reveals **how a specific production installation is configured**, it is generally private operational data.

TRUYN security must remain valid even when an attacker knows the public architecture and SDK source code. Secrecy of architecture is not a security control. At the same time, the project does not need to publish unnecessary production topology or billing/security internals.

## Public by design

The public repository may contain:

- protocol semantics and schemas;
- TRUYN Agent Descriptor schema/verification rules;
- first-party SDK source, package metadata, conformance fixtures and examples;
- provider ownership and authorization rules;
- BYOK architecture;
- default-deny/fail-closed behavior;
- generic provider adapter interfaces;
- logical capability taxonomy;
- generic cloud/deployment architecture;
- generic environment-variable names that reveal no sensitive identifier;
- artifact/result schemas;
- threat model and negative security tests;
- benchmark methodology and validated aggregate results;
- sanitized deployment-security evidence that records public hostname, tested commit/run identity, stable control semantics and pass/fail outcomes without publishing proof values/private resource identifiers;
- generic examples with placeholders;
- public service/domain names intentionally exposed to users;
- intentionally public Agent Descriptor fields such as public participant identity, public interface endpoint, supported protocol versions and public capability classes.

The accepted production origin-lock report is an example of this boundary: it may state that Cloudflare, Azure Front Door `SocketAddr` proof gating, `AzureFrontDoor.Backend` ingress restriction and direct HTTP/WebSocket 403 outcomes were proven, while exact private resource IDs, proof values and privileged enforcement automation remain outside the durable public evidence.

## Agent Descriptor visibility rule

A TRUYN Agent Descriptor is a **visibility-scoped view**, not an inventory dump.

An unauthenticated/public descriptor may expose only information the participant deliberately makes public. It MUST NOT reveal a private provider/capability that ordinary authorization-aware discovery would hide from an unauthenticated requester.

An authenticated/scoped descriptor may expose more information only after requester authentication/authorization and only to the same extent that provider-policy discovery would allow that requester to see it.

A Descriptor never contains upstream provider credentials or grants provider authorization.

For intentionally public HTTP-facing participants, the target location `/.well-known/truyn-agent.json` makes the descriptor location public by design; it does not make every provider behind that participant public.

## Private operational information

Do not intentionally publish through source, docs, SDK examples, test fixtures or Agent Descriptors:

- API keys, passwords, tokens, client secrets or private keys;
- production TRUYN identity private material;
- cloud service-account/managed-identity identifiers unless publication is explicitly required;
- WIF/OIDC provider strings and trust configuration where they expose operational identity topology;
- subscription, billing-account and internal tenant identifiers;
- private origin URLs or provider backchannel addresses;
- private bucket/container names;
- secret-manager/key-vault paths;
- real privileged caller/tenant allowlists;
- private provider IDs/capabilities that policy intentionally hides;
- exact production quotas, cost ceilings, emergency thresholds and credit balances;
- exact production firewall/WAF/rule-set/bypass configuration, private rule/resource IDs, live proof values or privileged mutation automation beyond the sanitized stable invariants needed for public architecture/evidence;
- private deployment names and topology where disclosure provides no user value;
- incident details before appropriate remediation/disclosure;
- sensitive user prompts, outputs or customer data;
- long-lived secret-bearing artifact/download URLs.

Some of these values may not be credentials by themselves. They are still withheld to minimize operational information leakage.

## Public identifiers

Some identifiers are intentionally public, for example a public domain name, published protocol version, public node/capability that its owner deliberately advertises, a tested public commit/status identifier in sanitized evidence, or an identity included in an intentionally public Agent Descriptor. Public status must be a deliberate property, not an accidental consequence of infrastructure-as-code, SDK logging, descriptor generation or a debug document.

## Deployment evidence boundary

A production security result may be published when it is sanitized and auditable. A good public evidence record may include:

```text
public service hostname
architecture/control invariant
tested source commit
public workflow/status identity
positive/negative probe matrix
HTTP/WebSocket outcomes
known limitations and re-acceptance triggers
```

It should not include:

```text
edge/origin proof values
private origin hostname
subscription/account/resource identifiers
private firewall/rule IDs
privileged cloud identity topology
secret-manager paths
one-shot privileged mutation scripts when they are no longer needed
```

This is why `docs/benchmarks/AZURE_ORIGIN_LOCK_2026-08-23.md` remains public durable evidence while the completed temporary origin-lock executors were removed from the current tree after acceptance.

## Repository and SDK examples

Public examples should use placeholders such as:

```text
<PROJECT_ID>
<SERVICE_ACCOUNT>
<PRIVATE_ORIGIN>
<PROVIDER_ID>
<OWNER_TENANT>
<TRUYN_NODE_URL>
```

rather than documenting a live production value.

First-party SDK quickstarts may use loopback/local endpoints or clearly fake public example domains. They must not normalize committing real API keys, bearer tokens or production backchannel addresses into source code.

## History caveat

Removing an operational value from the current branch does not remove it from Git history, package registries, Actions logs, artifacts, forks, caches or published SDK examples. If a previously published value is actually secret/credential material, it must be rotated and history/log/package cleanup evaluated separately.

Identifiers that are not credentials normally do not require emergency rotation solely because they were visible, but current documentation should still follow the disclosure boundary.

## Documentation and developer-experience review rule

Every public architecture/documentation/SDK/descriptor change should ask:

1. Is this needed to understand or implement TRUYN?
2. Is this a stable protocol/architecture fact, sanitized evidence fact or a live deployment detail?
3. Would a placeholder preserve the same public value?
4. Could this reveal credentials, privileged identity, topology, quota or security-control internals?
5. For an Agent Descriptor, would normal provider-policy discovery show this capability/interface/provider to the same requester?
6. For an SDK example, would a developer be encouraged to hard-code a secret or private operational address?
7. For deployment evidence, can the claim remain reproducible while private resource/proof values stay redacted?

When in doubt, publish the invariant and evidence outcome, and keep the live operational value private.
