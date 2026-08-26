# TRUYN Python SDK

**Status:** executable DX-1 reference core with real local-node execution parity; private/in-repository and not yet a published stable PyPI package.

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

## Implemented in DX-1 PR6

- Python `TruynLocalNodeClient` execution path over the existing TRUYN/1 relay runtime;
- Ed25519 local identities with the same SPKI-derived `truyn:node:*` identity binding as the Node runtime;
- the same canonical signed envelope shape used by `createEnvelope()` / `verifyEnvelope()`;
- real registration, `OFFER`, `NEED`, event polling and `RESULT` exchange over the existing relay endpoints;
- normalized relay/transport errors through the existing DX-1 `TruynError` taxonomy;
- a real two-Python-client `NEED -> RESULT` E2E against an ephemeral JavaScript relay;
- one shared runtime-flow fixture consumed by both the TypeScript and Python E2E tests.

Python does **not** maintain its own conformance fixture copies or redefine descriptor/runtime-flow semantics. Its tests consume the exact repository sources:

- `../conformance/v1/golden-fixtures.json`
- `../conformance/v1/agent-descriptor-runtime-fixtures.json`
- `../conformance/v1/local-node-e2e.json`

The Ed25519 backend uses the maintained Python `cryptography` package; PR4/PR6 do not introduce a handwritten cryptographic implementation.

## Local-node API

```python
from truyn import TruynLocalNodeClient

provider = TruynLocalNodeClient.connect(relay_url, name='provider')
requester = TruynLocalNodeClient.connect(relay_url, name='requester')

provider.offer('sdk.echo')
receipt = requester.need('sdk.echo', {'text': 'hello'})
need = provider.next_need(timeout_ms=2000)
provider.result(need['needId'], {'text': 'echo:hello'})
result = requester.wait_for_result(receipt['needId'], timeout_ms=2000)
```

The local-node adapter deliberately uses the existing relay/runtime contract. It does not add a Python-specific relay endpoint, message type, routing rule, authorization rule or network behavior.

## Current boundaries

DX-1 still does not provide stable package publication, streaming abstractions, compact-frame/WebSocket parity, OFFER revoke helpers, or stable-v1 compatibility guarantees. PR6 does not change relay/network/D-1000 behavior.

## Package

Target distribution remains **PyPI**. The current project metadata uses `truyn-sdk` with import package `truyn`; it remains pre-publication DX-1 code.

Run the parity suite from the repository root after installing the package dependencies:

```bash
python -m pip install -e ./sdk/python
PYTHONPATH=sdk/python/src python -m unittest discover -s sdk/python/tests -p 'test_*.py' -v
npm test
```

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Shared contract: `../conformance/README.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
