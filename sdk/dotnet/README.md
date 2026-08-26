# TRUYN C#/.NET SDK

**Status:** DX-2 skeleton client surface. Internal only; not a public stable NuGet release.

This directory now contains the first C#/.NET shape for the required first-party SDK matrix:

- `Truyn.Sdk.csproj` declares the in-repository .NET skeleton project;
- `Client.cs` defines the client options and async operation surface;
- `Models.cs` defines foundational DTOs and signed envelope payload records;
- `TruynException.cs` defines the normalized error taxonomy.

The skeleton is pinned to:

```text
protocol: TRUYN/1
agent descriptor schema: truyn.agent-descriptor/v1
```

Run the shared source/fixture conformance gate from the repository root:

```bash
node sdk/conformance/run-conformance.mjs --language=dotnet --json
```

DX-2 does not publish a NuGet package, does not call cloud providers, does not start a relay, and does not change `network/**`, relay runtime, QUIC/Kademlia or D-1000 behavior.
