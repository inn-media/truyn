# TRUYN Open Architecture Contract

This document defines architecture ownership and prevents public protocol/reference code, private managed implementation and status claims from silently collapsing back into one repository.

## Repository architecture

TRUYN has two codebases:

```text
inn-media/truyn
TRUYN Open / Apache-2.0
protocol + SDK + Node/Relay reference + conformance
             │
             │ stable public contract / released versioned artifact
             ▼
inn-media/truyn-platform
TRUYN Platform / proprietary
managed control plane + global intelligence + commercial/ops
```

The reverse dependency is forbidden.

## OPEN ownership

A component belongs in TRUYN Open when it is required to independently implement, interoperate with, develop against, test, benchmark or self-host the public network:

- normative protocol/spec/schema;
- identity and signed-envelope semantics;
- Node/Relay reference implementation;
- self-hostable provider-policy/BYOK safety;
- public SDKs, Agent Descriptor and bridges;
- public object/provenance/trust primitives;
- conformance, D-200 and sanitized benchmark evidence.

## PRIVATE ownership

A component belongs in TRUYN Platform when its primary value comes from managed global state, network effects, commercial policy or proprietary operations:

- managed/global control plane;
- managed authority/revocation cloud service;
- global trust registry and reputation graph;
- managed routing/ranking intelligence;
- private telemetry/analytics;
- marketplace, licensing, entitlements, billing/payments and enterprise policy;
- private production operations/evidence.

## SHARED-CONTRACT ownership

A shared contract stays public. A private service may implement it without moving the contract private. Public consumers must be able to validate/interoperate without importing private code.

Current shared-contract examples include:

- `TRUYN/1` and wire/schema generations;
- `truyn.agent-descriptor/v1`;
- public SDK stable behavior;
- object/artifact reference semantics;
- authorization outcome/error vocabulary;
- authority snapshot/status contract used by an open Relay client.

## Authority boundary

TRUYN Open retains the self-hostable/reference authority kernel: account/organization/tenant concepts, provider grants, entitlement/accounting semantics, terminal revocation primitives, provider billing policy and durable local reference composition. These are needed to make the open network independently operable and to specify fail-closed behavior.

TRUYN Platform owns the **managed service implementation** of those semantics: managed global authority/revocation lifecycle, managed cloud persistence, operator/admin control surface, managed reconciliation and commercial/global state.

A public Relay may consume a managed authority through an open client contract. That does not make the managed authority server public.

## Migration exception contract

At the split baseline, three managed implementation files and related mixed tests/workflows remain physically in this repository. They are explicitly listed in `config/open-core-boundary.json` and are treated as `PRIVATE_TARGET` migration exceptions.

The exception exists because the managed coordinator currently imports the public local authority kernel directly. Full migration is gated on publishing that reusable kernel as a stable versioned public artifact. Until then:

- no new managed/private implementation may be added here;
- exceptions may only shrink;
- public documentation must not describe those exceptions as permanent public ownership;
- the private repository must not work around the gate with a branch/path/raw-source dependency or wholesale source snapshot.

## Identity / authorization / billing

Authority comes from authenticated identities plus authoritative server-side state. Requester-supplied ownership/tenant/billing metadata does not create authority.

Capability compatibility, visibility, authorization and billing are separate decisions. Execution-capable surfaces converge on the same provider/access/billing boundary before external side effects. Private/chargeable execution fails closed when identity, authorization, billing responsibility or entitlement cannot be resolved.

Public SDKs, Agent Descriptors, A2A and MCP do not become authorization sources.

## D-200 / network scale

D-200 is OPEN. Its network scripts, strict predicates and evidence remain in this repository. A D-200 change that alters a shared public contract requires linked private compatibility work, but the benchmark itself is not transferred to the private platform.

D-1000 and other public network-scale gates remain public qualification work.

## A2A / MCP

A2A and MCP are independently versioned interoperability adapters, not TRUYN/1 wire dependencies. Stable compatibility is declared only from accepted public evidence and public governance.

## SDK / DX

TypeScript/JavaScript, Python, Go, Java and C#/.NET first-party SDKs remain public. Accepted immutable public releases currently include npm alpha.2, PyPI alpha and Go alpha. Maven Central and NuGet remain open.

Private consumers use these released coordinates exactly; unpublished ecosystems have no source fallback.

## Governance separation

TRUYN Open protocol governance is public. Ownership/operator decisions inside TRUYN Platform are private commercial governance, but private platform ownership cannot silently redefine public protocol, conformance or compatibility semantics.

## Status discipline

A repository/runtime implementation claim is not a live production claim. A private platform deployment claim is not public protocol maturity. A public benchmark PASS is not automatically private commercial production readiness.

Historical evidence remains historical. Current public status follows accepted public `main` plus the explicit two-repository ownership contract.
