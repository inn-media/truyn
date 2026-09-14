# TRUYN/1 Identity

**Status:** release-candidate normative contract for the bounded Open 1.0 identity profile. Overall TRUYN/1 remains pre-stable until exact-head and post-merge qualification pass.

A Node ID is a cryptographic logical identity and MUST NOT be defined by the node's current IP address, DNS name or physical location.

## Bounded Open 1.0 identity profile

The bounded core profile uses an **Ed25519** public key encoded as an X.509 `SubjectPublicKeyInfo` (SPKI) structure.

The canonical Node ID derivation is:

1. parse the supplied public-key representation as an Ed25519 public key;
2. export the public key as the canonical DER bytes of its SPKI structure;
3. compute SHA-256 over those DER bytes;
4. encode the 32-byte digest as 64 lowercase hexadecimal characters;
5. prepend the literal ASCII prefix `truyn:node:`.

Therefore:

```text
NodeID = "truyn:node:" + lowercase_hex(SHA256(SPKI_DER(ed25519_public_key)))
```

The same Ed25519 key expressed with different harmless PEM line wrapping MUST derive the same Node ID because derivation uses parsed SPKI DER, not PEM text bytes.

A bounded identity implementation MUST reject a signed envelope when its `from` Node ID does not equal the Node ID derived from the authenticated `publicKey`. Implementations MUST NOT derive identity from IP addresses, DNS names, relay registration order, tenant names or requester-controlled owner/billing fields.

Identity records bind a Node ID to public-key material and supported protocol generations. Session authentication proves control of the relevant key; it does not prove the factual truth of claims made by that node.

## Identity is not provider entitlement

A valid TRUYN identity does not grant permission to use every provider reachable/discoverable on the network.

Provider ownership/tenant/visibility/billing authorization is a separate policy decision described in `provider-policy.md`.

Requester-controlled claims about owner, tenant or privileged role MUST NOT become authoritative merely because the requester signs them with a valid node key.

Routine address changes and software upgrades MUST preserve identity. Key rotation/recovery must be explicit, signed/authorized where possible and linked into provenance. Compromised key bindings MUST be revocable through `REVOKE` semantics.

Cross-runtime golden identity vectors are required before stable-v1 qualification and MUST prove identical Node ID derivation for the same SPKI key material in every required first-party SDK.
