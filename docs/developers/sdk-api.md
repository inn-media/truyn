# Stable SDK API

Status: DX-3 stable API surface, internal packages only.

This page defines the developer-facing SDK shape that all first-party SDKs must converge on before stable package publication. It is a client API contract, not a new relay/runtime protocol.

## Stable primitives

| Primitive | Purpose |
|---|---|
| `NeedRequest` | High-level SDK request for a capability invocation. |
| `ResultResponse` | High-level SDK response for a completed capability invocation. |
| `StreamEvent` | Ordered streaming event emitted while a result is produced. |
| `ArtifactPayload` | Portable object/artifact input or output payload. |
| cancellation token / signal | Caller-owned cancellation mechanism. |

## Streaming

A streaming SDK method emits ordered `StreamEvent` values. The event type vocabulary is stable for SDKs:

```text
started · delta · artifact · result · error · completed · cancelled
```

The SDK must preserve event ordering from the transport and must not synthesize hidden provider state. `artifact` events carry an `ArtifactPayload`; `result` events carry the final `ResultResponse`.

## Cancellation

Cancellation is caller-owned:

- TypeScript uses `AbortSignal`.
- Python uses `CancellationToken` in `StableRequestOptions`.
- Go uses `context.Context`.
- Java exposes asynchronous cancellation through `CompletableFuture` and `cancel(requestId)`.
- C#/.NET uses `CancellationToken`.

When cancellation is observed before or during a stream, SDKs normalize it to the shared `cancelled` error code. A relay-side cancellation event uses `StreamEvent.type = cancelled`.

## Object/artifact payloads

`ArtifactPayload` supports three stable shapes:

| Kind | Required fields | Use |
|---|---|---|
| `uri` | `uri`, `contentType` | Reference an externally accessible object. |
| `inline` | `data`, `contentType` | Small inline base64 payload. |
| `bytes` | `data`, `contentType` | Binary payload encoded for the target language/transport. |

Optional fields are `name`, `sizeBytes`, `digest` and `metadata`. SDKs may expose idiomatic helpers such as `artifactFromText` or `artifact_from_text`, but the DTO names and field semantics remain stable.

## Language mapping

| Language | Streaming shape | Cancellation shape | Artifact DTO |
|---|---|---|---|
| TypeScript / JavaScript | `AsyncGenerator<StreamEvent>` | `AbortSignal` | `ArtifactPayload` |
| Python | `Iterator[StreamEvent]` | `CancellationToken` | `ArtifactPayload` |
| Go | `<-chan StreamEvent` | `context.Context` | `ArtifactPayload` |
| Java | `Flow.Publisher<StreamEvent>` | `cancel(requestId)` + async cancellation | `ArtifactPayload` |
| C#/.NET | `IAsyncEnumerable<StreamEvent>` | `CancellationToken` | `ArtifactPayload` |

## Non-goals in this slice

DX-3 does not publish packages, start cloud providers, change relay authorization, change DHT/QUIC/Kademlia behavior, or relax any D-1000 evaluator gate. Transport-backed streaming implementation can be added after this stable API contract is pinned by conformance.
