# TRUYN Go SDK

**Status:** DX-2 skeleton client surface. Internal only; not a public stable Go module.

This directory now contains the first Go shape for the required first-party SDK matrix:

- `go.mod` reserves the in-repository module path;
- `truyn.go` defines the client, config, foundational DTOs, signed envelope aliases and normalized error taxonomy;
- all network-facing operations fail closed with `unimplemented` until the Go transport binding is implemented.

The skeleton is pinned to:

```text
protocol: TRUYN/1
agent descriptor schema: truyn.agent-descriptor/v1
```

Run the shared source/fixture conformance gate from the repository root:

```bash
node sdk/conformance/run-conformance.mjs --language=go --json
```

DX-2 does not publish a Go module, does not call cloud providers, does not start a relay, and does not change `network/**`, relay runtime, QUIC/Kademlia or D-1000 behavior.
