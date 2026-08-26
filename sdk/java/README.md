# TRUYN Java SDK

**Status:** DX-2 skeleton client surface. Internal only; not a public stable Maven-compatible release.

This directory now contains the first Java shape for the required first-party SDK matrix:

- `pom.xml` declares the in-repository Java skeleton project;
- `src/main/java/org/truyn/sdk/TruynClient.java` defines the client builder and async operation surface;
- `TruynModels.java` defines foundational DTOs and signed envelope payload records;
- `TruynException.java` defines the normalized error taxonomy.

The skeleton is pinned to:

```text
protocol: TRUYN/1
agent descriptor schema: truyn.agent-descriptor/v1
```

Run the shared source/fixture conformance gate from the repository root:

```bash
node sdk/conformance/run-conformance.mjs --language=java --json
```

DX-2 does not publish a Maven artifact, does not call cloud providers, does not start a relay, and does not change `network/**`, relay runtime, QUIC/Kademlia or D-1000 behavior.
