# TRUYN SDK Quickstart

**Status:** five first-party relay clients implemented; npm/PyPI/Go accepted immutable prereleases; Maven Central/NuGet publication open.  
**Documentation audit:** 2026-09-23  
**Protocol:** `TRUYN/1` draft  
**Stable SDK API contract:** `1`

## Fastest local proof

From the repository root:

```bash
npm install --ignore-scripts --no-audit --no-fund
node --experimental-strip-types examples/sdk/hello-need-result.ts
```

The example starts an ephemeral loopback relay, creates an independent provider/requester pair, publishes an OFFER and completes signed `NEED → RESULT` through the real local relay.

Expected shape:

```json
{
  "ok": true,
  "output": {
    "text": "RESULT: hello TRUYN"
  }
}
```

This path does not require a cloud provider, billing account, production relay or D-Series infrastructure.

## Python path

Terminal 1:

```bash
npm run relay -- --host 127.0.0.1 --port 8787
```

Terminal 2:

```bash
python -m pip install --disable-pip-version-check -e ./sdk/python
PYTHONPATH=sdk/python/src TRUYN_RELAY_URL=http://127.0.0.1:8787 python examples/sdk/hello_need_result.py
```

The local-development relay is loopback-only by design.

## Full five-language proof

The required first-party clients are:

- TypeScript / JavaScript;
- Python;
- Go;
- Java;
- C# / .NET.

Run their shared executable conformance gate:

```bash
node sdk/conformance/run-five-language-e2e.mjs
```

The runner starts a real local relay and signed Agent Descriptor fixture, then independently exercises Descriptor verification plus OFFER / NEED / RESULT and direct requester-owned cancellation in each required language.

This is executable network behavior, not DTO/skeleton parity. Dedicated negative/lifecycle regressions remain authoritative for cases not covered by the common happy path.

## Public package state

Accepted immutable public prereleases:

```text
npm   @truyn/sdk@0.1.0-alpha.2
PyPI  truyn-sdk==0.1.0a1
Go    github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1
```

Implemented but public registry publication still open:

```text
Maven  org.truyn:truyn-sdk:0.1.0-alpha.1
NuGet  Truyn.Sdk 0.1.0-alpha.1
```

The immutable npm alpha.1 artifact is historical/superseded evidence and is never overwritten.

## Agent Descriptor

The runtime can explicitly opt in to serving:

```text
GET /.well-known/truyn-agent.json
```

Serving is default-off. The Descriptor is identity-signed, TTL-bounded and filtered to an explicit public capability subset. It is discovery/bootstrap metadata and never grants provider authorization.

### Current lifecycle fact

The old startup-only limitation is closed. Open-1.0 S102 implemented bounded automatic refresh/re-sign before expiry, with regression coverage in `tests/agent-descriptor-refresh.test.js`.

Still open is complete usable-interface negative/mapping parity across all five SDKs: malformed/missing endpoint cases and typed endpoint mapping must remain aligned everywhere.

## Streaming, cancellation and artifacts

The bounded SDK/runtime surface includes:

- authenticated relay event streaming;
- signed ordered generic `PARTIAL` streaming;
- direct NEED cancellation through signed REVOKE/lifecycle paths;
- reference-oriented object/artifact payloads;
- fail-closed signature/correlation checks.

`PARTIAL` is a generic ordered delta/chunk contract, not a universal tokenizer. Arbitrary chain-stage cancellation remains unsupported.

## What this proves / does not prove

This quickstart proves bounded local SDK behavior. It does **not** prove:

- stable `TRUYN/1`;
- production/mainnet readiness;
- remote account/tenant onboarding;
- D-500/D-1000 acceptance;
- complete Descriptor malformed-interface parity;
- Maven Central/NuGet publication;
- live developer-site deployment.

## Reference documents

- `../../sdk/README.md`
- `DX3_SDK.md`
- `../architecture/SDK_DEVELOPER_EXPERIENCE.md`
- `../compatibility/SDK_COMPATIBILITY.md`
- `../../sdk/release/PUBLISHING.md`
- `MVP_QUICKSTART.md`
