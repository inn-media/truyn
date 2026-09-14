# TRUYN Open / Private Repository Boundary

## Architecture rule

TRUYN follows **Open Standard + Open Edge + Proprietary Network Intelligence**.

The permanent dependency invariant is:

> **Private may depend on Public. Public must never depend on Private.**

`inn-media/truyn` is the public Apache-2.0 repository. It owns the protocol and specification, public SDKs, open Node/Relay runtime, generic provider/BYOK/owner-funded behavior, public contracts, conformance fixtures, reference behavior, and generic infrastructure required by the supported open path.

`inn-media/truyn-platform` is the private managed platform. It owns managed account/tenant authority, production authority/control-plane and revocation behavior, commercial entitlement/accounting/billing, hosted managed authority runtime, proprietary routing/network intelligence, managed telemetry/analytics, marketplace/licensing, enterprise integrations, and private operations.

## Dependency direction

Private platform code may consume only one of these accepted immutable public surfaces:

1. a released/versioned public artifact with an explicit immutable coordinate; or
2. a stable public contract explicitly pinned by public repository + exact commit + canonical path + cryptographic digest, with compatibility validation proving the pinned bytes.

The second form is a released public contract mechanism, not permission to consume arbitrary GitHub source. It is limited to declared SHARED_CONTRACT fixtures/interfaces and must be recorded in the private dependency policy. Public code, tests, build tooling, and supported runtime paths must not require the private repository.

Forbidden coupling includes:

- public imports, package dependencies, source fetches, or filesystem references to `inn-media/truyn-platform`;
- private consumption through `../truyn`, sibling checkout paths, raw GitHub source URLs, mutable branches, unpinned git dependencies, submodules, or equivalent raw-source coupling;
- private copying of the public security/control-plane subtree as a hidden fork instead of consuming an accepted contract;
- normal private CI mutating the public repository;
- restoring managed/private implementation to the public tree solely to satisfy a public test.

## Placement rule

Classification is based on behavior, not filenames. Words such as `production`, `cloud`, `authority`, or `billing` do not by themselves make code private.

Keep code public when it implements protocol/open-edge behavior, generic infrastructure, SDK/contracts/conformance, provider adapters/policy, BYOK/owner-funded behavior, or reusable reference behavior without managed commercial ownership.

Place code in the private platform when it implements managed production authority, managed account/tenant administration, managed provider grants/revocation, production control-plane ownership, commercial entitlement/accounting/billing, hosted managed services, proprietary network intelligence, or private operational control.

When public behavior needs a managed extension point, expose a public contract/reference/injection seam and keep the managed implementation private.

## Shared-contract identity

A pinned SHARED_CONTRACT is accepted only when all of the following are true:

- the source repository is `inn-media/truyn`;
- the source commit is exact and immutable;
- the contract path is explicit;
- a cryptographic digest of the contract bytes is recorded;
- private CI verifies repository, commit, path, version and digest together;
- private production code does not import or fetch the public repository source tree at runtime/build time.

This permits stable public contract consumption while preserving the no-source-coupling invariant.

## Split guardrail

`scripts/check-open-private-boundary.mjs` runs in the mandatory public CI job. It fails when a classified migrated private path is reintroduced or when code-bearing public files acquire a dependency/reference to the private repository or raw private source.

The guardrail intentionally does not classify code from a keyword alone. Any future boundary change must update the architecture decision and guardrail deliberately, with public CI, CodeQL, DCO, and conformance remaining intact.
