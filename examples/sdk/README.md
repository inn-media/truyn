# SDK examples

These are bounded **Developer Release source-checkout examples** for local onboarding. They use the existing loopback relay/runtime contract and do not require cloud credentials, paid AI providers, production relay access, QUIC/Kademlia, DHT or D-1000 infrastructure.

They cover TypeScript and Python as the shortest copy-paste onboarding paths. The required first-party SDK set is broader: TypeScript/JavaScript, Python, Go, Java and C#/.NET all participate in the common executable Developer Release conformance gate.

## TypeScript all-in-one

Runs an ephemeral local relay in-process, then completes one verified `NEED -> RESULT` exchange.

```bash
node --experimental-strip-types examples/sdk/hello-need-result.ts
```

## Python against a local relay

Terminal 1:

```bash
npm run relay -- --host 127.0.0.1 --port 8787
```

Terminal 2:

```bash
PYTHONPATH=sdk/python/src TRUYN_RELAY_URL=http://127.0.0.1:8787 python examples/sdk/hello_need_result.py
```

## Expected output

```json
{
  "ok": true,
  "output": {
    "text": "RESULT: hello TRUYN"
  }
}
```

## What these examples prove

They exercise real source-checkout SDK clients against the local relay contract and demonstrate signed `OFFER` / `NEED` / `RESULT` behavior for simple onboarding.

The broader Developer Release gate additionally covers all five required SDK languages, direct NEED cancellation, object/artifact reference shapes, Agent Descriptor retrieval/verification/negotiation and release package build/provenance.

## Boundary

These examples are not stable package-publication examples and do not prove native registry availability. They intentionally import from repository source until public release coordinates are externally observable.

`TRUYN/1` remains draft. A source example or SDK client never bypasses server-side provider authorization, visibility or billing policy.

See `../../docs/getting-started/SDK_QUICKSTART.md`, `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md` and `../../docs/compatibility/SDK_PACKAGING.md`.
