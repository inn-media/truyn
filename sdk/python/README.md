# truyn-sdk

**Status:** implemented Developer Release Python client; source/build complete, pre-stable, and awaiting observed public PyPI publication evidence.

The Python SDK is one of the five required first-party clients. Its bounded Developer Release contract includes:

- local Ed25519 identity and signed TRUYN envelopes;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER` / `NEED` / verified provider event / correlated `RESULT`;
- requester-owned direct NEED cancellation;
- stable API-v1 object/artifact reference shapes;
- authenticated event/stream helpers;
- Agent Descriptor HTTP retrieval, schema/version/expiry validation, identity-key signature verification and protocol/interface negotiation;
- normalized fail-closed errors.

Developer Release coordinate:

```text
truyn-sdk==0.1.0a1
import package: truyn
```

Source-checkout example:

```python
from truyn import TruynLocalNodeClient

client = TruynLocalNodeClient.connect("https://relay.example")
receipt = client.need("reasoning.general", {"question": "Hello"})
result = client.wait_for_result(receipt["needId"])
```

Run the Python source/fixture conformance gate from the repository root:

```bash
node sdk/conformance/run-conformance.mjs --language=python --json
```

Run the real five-language Developer Release network gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

Ordinary CI builds and verifies the Python wheel/sdist as part of the common release bundle and records exact source SHA, byte size and SHA-256 provenance.

Build/provenance is not public PyPI availability. Until `truyn-sdk==0.1.0a1` is observably published from the immutable release source, use the repository source/install path documented in the SDK quickstart.

This is a pre-stable `0.x` SDK and `TRUYN/1` remains draft. Provider authorization, visibility and billing remain server/runtime policy, never client-supplied authority.

See `../README.md`, `../conformance/README.md`, `../../docs/getting-started/SDK_QUICKSTART.md`, `../../docs/compatibility/SDK_PACKAGING.md` and `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
