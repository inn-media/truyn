# TRUYN Open / Platform Boundary

TRUYN is one architecture implemented by two deliberately separate codebases.

## TRUYN Open — `inn-media/truyn`

This public Apache-2.0 repository owns the independently implementable and interoperable layer:

- TRUYN/1 protocol and wire/schema definitions;
- cryptographic identity, signed envelopes, object/provenance primitives;
- Node and Relay reference implementation;
- CLI and self-hosting/reference runtime behavior;
- A2A, MCP and public/provider adapter contracts;
- first-party SDKs and Agent Descriptor;
- provider-policy/BYOK security primitives required for interoperable self-hosting;
- conformance suites;
- public benchmark methodology and sanitized evidence;
- D-200 and other public network qualification.

The public project remains useful without access to any InnMedia commercial service.

## TRUYN Platform — `inn-media/truyn-platform`

The private proprietary repository owns value that depends on managed/global state, commercial operations or proprietary network intelligence:

- managed control plane;
- global trust registry and reputation graph;
- managed authority/revocation lifecycle and cloud persistence;
- proprietary routing/ranking intelligence;
- private telemetry ingestion and analytics;
- marketplace;
- licensing, entitlements, billing and payments;
- enterprise organization/policy services;
- private production operations and operational evidence.

## SHARED-CONTRACT

A shared contract is open even when one implementation is private. Examples include TRUYN/1, Agent Descriptor, SDK stable APIs, artifact references, authorization outcome/error vocabulary, and a managed-authority client/snapshot interface consumed by an open Relay.

A shared contract does **not** permit public code to import private code.

## Dependency direction

```text
TRUYN Open
   │
   │ released/versioned artifact or stable public protocol contract
   ▼
TRUYN Platform
```

Forbidden:

```text
TRUYN Open ──import──> TRUYN Platform
TRUYN Platform ──git/path/raw-source──> TRUYN Open
```

## Current migration exception

At the 2026-09-13 split baseline, a bounded set of managed implementation still physically exists in the public tree. Ownership has changed, but deleting those files before publishing the reusable public authority-kernel contract would force private source-copy/path coupling.

The exact temporary allowlist is machine-readable in `config/open-core-boundary.json`. It includes the current managed authority coordinator, Cosmos checkpoint adapter, managed authority server, their mixed tests, and legacy production-operations workflows.

These files are **migration exceptions, not public ownership claims**. No new private-target implementation may be added to the public repository. The exception list may only shrink.

The self-hostable/local authority kernel, provider-policy/BYOK primitives, authority snapshot schema, and open Relay client remain public.

## D-200

D-200 is OPEN. Its scripts, network benchmark, thresholds and sanitized evidence live here.

- D-200-only change → public PR.
- public protocol/SDK/Descriptor contract changed by D-200 work → public PR plus linked private compatibility PR.
- managed global routing/ranking/telemetry intelligence derived from operational use → private platform.

## Licensing

The Apache-2.0 `LICENSE` in this repository is unchanged and applies to this public repository as stated. The existence of `inn-media/truyn-platform` does not narrow or revoke public Apache-2.0 rights.

The private repository has its own proprietary/confidential license and receives no special right to redefine the public protocol outside public governance.
