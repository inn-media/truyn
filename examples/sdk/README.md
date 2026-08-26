# SDK examples

These examples are for DX-1 loopback developer onboarding. They use the existing local relay/runtime contract and do not require cloud credentials, paid AI providers, production relay access, QUIC/Kademlia, DHT or D-1000 infrastructure.

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

## Boundary

These examples are not stable package-publication examples. They intentionally import from the in-repository DX-1 reference SDK sources until npm/PyPI publication is defined in a later DX gate.

See `../../docs/getting-started/SDK_QUICKSTART.md` for the full guide.
