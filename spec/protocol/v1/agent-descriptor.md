# TRUYN/1 Agent Descriptor

**Status:** draft discovery metadata specification with implemented bounded Developer Release v1 serving, validation, signature-verification and negotiation semantics.  
**Wire status:** not a new top-level TRUYN envelope kind.

The **TRUYN Agent Descriptor** is a signed, cacheable self-description document used to bootstrap interoperability with a TRUYN-facing agent, service or node.

It exists to answer a narrow discovery/onboarding question:

> What participant is this, which TRUYN protocol/interface versions can it speak, which capability classes does it intentionally expose in this view, and how can a compatible client begin an interaction?

It does not replace signed `OFFER` messages, provider authorization, billing/entitlement policy, routing, Trustability or dynamic availability.

## 1. Discovery

An HTTP-facing participant SHOULD make its public descriptor available at:

```text
https://<domain>/.well-known/truyn-agent.json
```

A participant MAY additionally provide:

- a descriptor through authenticated TRUYN-native discovery;
- a descriptor URL/content through direct configuration;
- a registry/catalog entry that resolves to a descriptor.

A participant that is not intended for public discovery is not required to publish a public HTTP descriptor.

The current bounded Developer Release runtime implements the intentionally public HTTP form. Serving is disabled by default and requires explicit opt-in plus an explicit public capability allowlist. This implementation fact does not make every optional discovery form above mandatory or stable.

## 2. Descriptor visibility

A descriptor is always a **view**, not an unconditional dump of every provider/capability known to the node.

A public descriptor MUST contain only information intentionally public to unauthenticated requesters.

An authenticated implementation MAY return a richer requester-scoped descriptor after authentication/authorization. Such a view MUST NOT reveal a private capability/provider that the same requester would be unable to discover under provider policy.

Descriptor discovery MUST NOT become an authorization bypass.

The current Developer Release serving path implements the public view only; it does not create a requester-scoped authorization channel merely by serving metadata.

## 3. Required logical fields

A v1 descriptor contains the following logical fields:

- `schema` — descriptor schema identifier;
- `descriptorVersion` — version of the descriptor schema;
- `identity` — TRUYN participant/node identity or identity reference;
- `protocols` — supported TRUYN protocol generations;
- `interfaces` — one or more supported interaction interfaces, ordered by preference when relevant;
- `capabilities` — capability classes intentionally visible in this descriptor view;
- `issuedAt` — issuance time;
- `expiresAt` — expiry time;
- `signature` or `signatures` — integrity/authenticity proof bound to the TRUYN identity or an authorized descriptor-signing key.

Recommended fields include:

- `name`;
- `description`;
- `features`;
- `security`;
- `extensions`;
- `documentation`;
- `sdkHints` when useful and non-sensitive.

## 4. Capability entry

A capability entry SHOULD contain:

- stable capability ID;
- optional human-readable name/description;
- supported input media/content modes;
- supported output media/content modes;
- supported interaction modes such as request-response, async/polling or streaming;
- optional stable constraints that are safe to advertise.

A descriptor SHOULD NOT embed dynamic price, transient load, live quota, requester-specific entitlements or other rapidly changing provider-selection state. That belongs in `OFFER`/policy/routing state.

## 5. Interface entry

An interface entry SHOULD identify:

- interface type, for example `https`, `websocket`, `truyn-quic`, `mcp` or another registered extension;
- endpoint or endpoint reference when intentionally discoverable;
- optional protocol/binding version;
- optional content/serialization modes.

Private origins/backchannels MUST NOT be exposed merely because they exist operationally.

## 6. Security information

A descriptor MAY declare supported authentication/security mechanisms, but MUST NOT contain plaintext credentials, API keys, bearer tokens, provider secrets, private keys or long-lived secret-bearing URLs.

Security metadata is descriptive. Actual authorization remains server/node policy.

## 7. Signature semantics

A descriptor SHOULD be signed. The current executable Developer Release v1 path signs/verifies the participant's **current TRUYN identity key** using the same Ed25519 and canonical-JSON primitives already used for signed TRUYN values.

### 7.1 v1 identity-key signing input

For `truyn.agent-descriptor/v1`, the signing input is constructed as follows:

1. start from the complete descriptor object;
2. remove the top-level `signature` and `signatures` fields;
3. canonicalize the remaining JSON value with the TRUYN `canonicalize()` algorithm used by `core/protocol/index.js` / `core/identity/index.js`;
4. encode the resulting canonical JSON string as UTF-8 bytes;
5. sign those bytes with Ed25519;
6. encode the 64-byte signature using standard padded base64.

A verifier MUST resolve the participant public key **outside the descriptor** and MUST require:

```text
nodeIdFromPublicKey(resolvedPublicKey) == descriptor.identity
```

The descriptor MUST NOT become its own root of trust by supplying an untrusted key and asking the verifier to trust it.

A descriptor MAY use `signature` or `signatures[]`. Under the current identity-key path, verification succeeds when at least one syntactically valid signature verifies against the identity-bound public key. Both signature fields are excluded from the signed projection.

### 7.2 Delegated descriptor keys

The broader architecture permits a descriptor-signing key explicitly delegated by the participant identity. However, the current draft does not yet define a portable delegation proof, key identifier, validity window and revocation contract.

Therefore first-party SDKs MUST fail closed on a key that does not bind directly to `descriptor.identity` until such a delegation contract is specified and added to the shared conformance fixtures. Implementations MUST NOT silently treat an arbitrary non-identity key as delegated.

### 7.3 What a valid signature proves

A valid signature proves descriptor integrity and current identity-key binding. It does not prove capability quality, current availability, requester authorization or result truth.

Descriptors MUST be expiry-bound. Clients reject expired descriptors by default. An explicit offline/cache policy MAY opt into using an expired descriptor, but that is a caller policy decision rather than silent fallback.

## 8. Example

```json
{
  "schema": "truyn.agent-descriptor/v1",
  "descriptorVersion": "1",
  "identity": "truyn:node:example",
  "name": "Example Agent",
  "description": "Example public TRUYN participant",
  "protocols": ["TRUYN/1"],
  "interfaces": [
    {
      "type": "https",
      "endpoint": "https://agent.example/truyn"
    }
  ],
  "capabilities": [
    {
      "id": "reasoning.general",
      "inputModes": ["application/json", "text/plain"],
      "outputModes": ["application/json", "text/plain"],
      "interactionModes": ["request-response"]
    }
  ],
  "features": {
    "streaming": false,
    "artifacts": true,
    "trustReceipts": true
  },
  "security": {
    "signedEnvelopes": true,
    "authorization": "policy-before-dispatch"
  },
  "issuedAt": "2026-08-22T00:00:00Z",
  "expiresAt": "2026-08-23T00:00:00Z",
  "signature": "base64-ed25519-signature"
}
```

The example values are illustrative while TRUYN/1 remains draft. The executable canonicalization/signature contract and real cryptographic golden vector live under `sdk/conformance/v1/`.

## 9. Descriptor versus OFFER

| Concern | Agent Descriptor | `OFFER` |
|---|---|---|
| Bootstrap/self-description | primary | no |
| Protocol/interface compatibility | primary | secondary/not required |
| Public capability class | yes, if intentionally visible | yes |
| Dynamic provider availability | no | yes |
| Current price/capacity/conditions | no | yes |
| Authorization grant | never | never by itself |
| Routing candidate state | no | yes, after policy filtering |

Clients MUST NOT infer provider authorization merely because a capability appears in a Descriptor or `OFFER`.

## 10. Compatibility

Clients MUST inspect `descriptorVersion` and `protocols` rather than assuming that every descriptor has the latest schema or that every node supports the same TRUYN protocol generation.

Unknown optional fields/extensions SHOULD be ignored unless the extension declares different handling. Unknown required semantics MUST fail explicitly rather than being guessed.

The shared Developer Release v1 negotiation semantics are:

- descriptor schema/version validation happens first;
- protocol selection follows the client's declared supported-protocol preference order and selects the first protocol also advertised by the descriptor;
- interface selection follows descriptor interface order and chooses the first interface type supported by the client;
- no protocol overlap fails explicitly as `version_mismatch` / `unsupported_protocol`;
- no interface overlap fails explicitly as `version_mismatch` / `unsupported_interface`.

## 11. Relation to SDKs

All five required first-party Developer Release SDKs — TypeScript/JavaScript, Python, Go, Java and C#/.NET — implement the bounded common Descriptor lifecycle:

- HTTP descriptor retrieval;
- schema/version parsing;
- expiry validation;
- identity-bound Ed25519 signature validation;
- protocol/interface selection;
- visibility-safe capability enumeration;
- clear errors for unsupported descriptor/protocol/interface semantics.

The executable reference semantics and shared cryptographic/negotiation vectors are in:

- `sdk/conformance/reference/agent-descriptor.js`;
- `sdk/conformance/v1/golden-fixtures.json`;
- `sdk/conformance/v1/agent-descriptor-runtime-fixtures.json`;
- `sdk/conformance/run-five-language-e2e.mjs`.

The five required languages share the same logical `truyn.sdk-conformance/v1` contract and one executable five-language network conformance path. Language-local implementations must not silently redefine Descriptor semantics.

This implementation maturity does not make `truyn.agent-descriptor/v1` stable. The schema remains part of draft `TRUYN/1`, and delegated signing/revocation remains outside the current alpha contract.

See `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
