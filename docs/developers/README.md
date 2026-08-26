# TRUYN developer docs

This directory is the repository-backed entrypoint for the external developer documentation site. Until public package publication, it is the canonical source for SDK onboarding and stable API shape.

## Start here

- [SDK quickstart](../getting-started/SDK_QUICKSTART.md)
- [Stable SDK API](./sdk-api.md)
- [Packaging and versioning](../compatibility/SDK_PACKAGING.md)
- [SDK compatibility matrix](../compatibility/SDK_COMPATIBILITY.md)

## Current DX-3 status

DX-3 defines the stable first-party SDK API surface before public distribution:

- streaming result events;
- cancellation hooks;
- object/artifact payload DTOs;
- stable request/response DTO names;
- external developer docs entrypoint.

This does not change relay runtime, routing, QUIC/Kademlia, provider policy, D-1000 evaluator thresholds or package publication status.

## Publication boundary

The developer docs are public-facing documentation, but packages remain internal/private until the stable package release gate is satisfied. The docs must not claim npm, PyPI, Maven, NuGet or Go module public availability until those release jobs exist and pass.
