# @truyn/sdk

First-party JavaScript/TypeScript SDK for TRUYN.

**Status:** implemented Developer Release client. The latest accepted immutable public npm prerelease remains `@truyn/sdk@0.1.0-alpha.2`; the current source is versioned `0.1.0-alpha.4` for exact-main qualification and a future immutable publication of the managed auth/device v1 client contract. `0.1.0-alpha.4` is a source/release-candidate coordinate only and must not be described as released until the trusted-publishing workflow and independent public-registry verification complete successfully.

```js
import { TruynLocalNodeClient } from '@truyn/sdk';

const client = await TruynLocalNodeClient.connect({ relayUrl: 'https://relay.example' });
const receipt = await client.need('reasoning.general', { question: 'Hello' });
const result = await client.waitForResult(receipt.needId);
```

The current bounded Developer Release surface also includes authenticated relay event streaming, requester-owned direct NEED cancellation, signed generic `PARTIAL` delivery, portable object/artifact references and Agent Descriptor fetch/verify/negotiation.

## Managed auth/device v1

The public SDK exposes the pre-stable contract `truyn.managed-auth-device/v1` for managed Windows, macOS, Linux and Android clients.

The contract intentionally exposes only client-facing interoperability:

- bounded device registration fields (`contractVersion`, `clientDeviceId`, `platform`, optional `clientVersion`);
- read-only account, membership, device and session views returned by a managed service;
- self-scoped session revocation requests (`current_session`, `current_device`, `all_sessions`);
- fail-closed contract/version validation.

Account/tenant ownership, device/session identifiers, billing ownership, entitlements and authorization are **server-authoritative**. Client attempts to supply those authority fields are contract violations. The SDK contract does not move managed identity storage, tenant policy, billing, entitlement or revocation authority into the public repository.

Private managed deployments must consume this contract from an accepted immutable released SDK coordinate, never through a sibling checkout, raw GitHub source URL, branch dependency or source copy.

Run the shared executable Developer Release gate from the repository root:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI builds/verifies the npm release artifact and records exact source SHA, byte size and SHA-256 provenance. This package remains a **pre-stable `0.x` SDK**. `TRUYN/1` remains subject to its separate Open 1.0 qualification. Provider authorization, billing and visibility are enforced by TRUYN server/runtime policy, never by client-supplied metadata, managed auth request fields or Agent Descriptor contents.

See `../README.md`, `../conformance/README.md` and `../../docs/compatibility/SDK_COMPATIBILITY.md`.
