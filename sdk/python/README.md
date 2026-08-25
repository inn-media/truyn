# TRUYN Python SDK

**Status:** executable DX-1 reference core; private/in-repository and not yet a published stable PyPI package.

This directory contains the Python parity implementation for the shared `truyn.sdk-conformance/v1` contract established by the TypeScript reference SDK.

## Implemented in DX-1 PR4

- Agent Descriptor v1 parsing and validation;
- exact TRUYN canonical JSON signing payload semantics;
- identity-bound Ed25519/base64 signature verification;
- descriptor/protocol/interface negotiation;
- normalized error mapping;
- authenticated identity retrieval via existing `GET /v1/nodes/:id`;
- authorized provider discovery via existing requester-filtered `GET /v1/offers`;
- integrated descriptor retrieval, identity-key resolution, verification and negotiation.

Python does **not** maintain its own fixture copy or redefine descriptor semantics. Its conformance tests read the exact repository files:

- `../conformance/v1/golden-fixtures.json`
- `../conformance/v1/agent-descriptor-runtime-fixtures.json`

The Ed25519 backend uses the maintained Python `cryptography` package; PR4 does not introduce a handwritten cryptographic implementation.

## Current boundaries

PR4 does not yet implement registration, OFFER publish/revoke, NEED/RESULT, streaming, cancellation primitives, package publication, or stable-v1 compatibility guarantees. It does not change relay/network/D-1000 behavior.

## Package

Target distribution remains **PyPI**. The current project metadata uses `truyn-sdk` with import package `truyn`; it remains pre-publication DX-1 code.

Run the parity suite from the repository root after installing the package dependencies:

```bash
python -m pip install -e ./sdk/python
PYTHONPATH=sdk/python/src python -m unittest discover -s sdk/python/tests -p 'test_*.py' -v
```

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Shared contract: `../conformance/README.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
