# A2A P3-A1 Extended Lifecycle Profile — Exact-Version Evidence

**Status:** bounded acceptance record for PR `#464`; merge acceptance additionally requires one exact head with DCO, full CI, hosted CodeQL and `behind=0`  
**Profile:** additive extension of `a2a-mcp-pre-v1/g1`  
**TRUYN protocol:** `TRUYN/1` — draft  
**Stable A2A/MCP v1:** **not declared**  
**A2A protocol:** `1.0`  
**Official A2A SDK:** `@a2a-js/sdk@1.0.1`  
**Official SDK release commit inspected:** `f5ca7d05945a69cbf3dcd357203d4ce99201494f`  
**Issue:** `#462`  
**PR:** `#464`

P3-A1 extends the already accepted bounded `a2a-mcp-pre-v1/g1` profile. It does not replace g1, change TRUYN wire semantics, or create a stable-v1 compatibility promise while `TRUYN/1` remains draft.

## Accepted lifecycle surface

The bounded profile covers:

1. `SendStreamingMessage` over JSON-RPC + SSE;
2. `SubscribeToTask` / official SDK `resubscribeTask()` against an already-running task;
3. `CancelTask` mapped to requester-owned TRUYN `REVOKE` and cooperative provider abort;
4. `CreateTaskPushNotificationConfig`;
5. `GetTaskPushNotificationConfig`;
6. `ListTaskPushNotificationConfigs`;
7. `DeleteTaskPushNotificationConfig`;
8. push event delivery through an explicitly injected application hook.

The original g1 defaults remain unchanged. Streaming, cancellation and push support are opt-in server capabilities. Existing non-lifecycle execution paths keep their prior behavior.

## Official SDK black-box

`tests/a2a-lifecycle-official-sdk.test.js` imports the pinned official package directly:

```text
@a2a-js/sdk@1.0.1
```

The test exercises the TRUYN A2A facade through the official SDK public client surface rather than through TRUYN's own lifecycle client.

The exact official SDK release source inspected for request and streaming semantics is:

```text
repository: a2aproject/a2a-js
commit:     f5ca7d05945a69cbf3dcd357203d4ce99201494f
file:       src/client/transports/json_rpc_transport.ts
```

The black-box predicates include:

- streaming yields one working task, ordered partial artifact updates and a completed terminal state;
- resubscription attaches to the existing task and does not create a second provider execution;
- cancellation reaches provider `AbortSignal`, leaves the A2A task canceled and rejects late result materialization;
- push config create/get/list/delete uses the official v1.0.1 request shapes;
- push completion is delivered through the configured explicit delivery hook;
- a real loopback callback endpoint remains untouched by the TRUYN server, proving that storing a callback URL does not cause implicit network fetching.

## Negative / security matrix

Executable P3-A1 negatives are in:

- `tests/a2a-lifecycle-profile.test.js`;
- `tests/a2a-lifecycle-security-matrix.test.js`;
- `tests/a2a-lifecycle-official-sdk.test.js`.

The profile fails closed for the following classes:

- lifecycle feature flags disabled: streaming/cancellation remain unsupported and the g1 Agent Card defaults remain false;
- cross-principal cancellation: task is indistinguishable from not-found and authoritative runtime state is unchanged;
- signed compact stream events from an unverified or wrong provider identity are ignored;
- missing, invalid, duplicate, out-of-order or non-contiguous partial sequence input fails the A2A task without producing an artifact;
- lifecycle SSE task/context correlation mismatch is rejected;
- JSON-RPC response-id mismatch is rejected;
- lifecycle SSE cumulative bytes are bounded and incomplete frames are rejected;
- push callback URL schemes outside HTTP(S) are rejected;
- URL-embedded credentials and fragments are rejected;
- insecure non-loopback HTTP callback URLs are rejected;
- push configuration access is owner-scoped;
- push configuration count is bounded per task;
- push URL storage performs no implicit HTTP fetch and therefore does not create an SSRF path;
- push delivery occurs only through the explicitly injected `deliverPushNotification` hook;
- delivery-hook failure is non-authoritative: it must not mutate task outcome or cause duplicate provider execution.

The lower TRUYN runtime sequence/revocation enforcement remains covered by the existing DX3 lifecycle/hardening regression tests, including strict partial sequencing, accepted-partial idempotency, requester-owned revoke, provider abort and late-result rejection.

## Security boundary

P3-A1 deliberately does **not** provide a generic callback fetcher.

```text
stored push URL
  ≠ network authority

stored push config
  → explicit application delivery hook
  → caller-controlled networking policy outside the A2A adapter
```

Likewise, remote referenced artifacts continue to require the existing explicit resolver and integrity-verification path. Lifecycle support does not weaken the C6/C8 URL-fetch or artifact-integrity boundaries.

## Regression gate

The lifecycle profile is accepted only together with the complete repository regression command:

```text
npm test
```

That command is the g1 regression gate; passing only the P3-A1 test files is insufficient.

PR acceptance additionally requires all of the following on one exact commit SHA:

```text
DCO = success
full CI / npm test = success
hosted CodeQL = success
behind main = 0
unresolved review threads = 0
```

Only that exact head may be marked ready and merged. After merge, ordinary CI and hosted CodeQL must pass again on the exact resulting `main` SHA.

## Boundary and limitations

This evidence establishes only the bounded lifecycle profile above. It does **not** claim:

- stable A2A/MCP v1 support;
- support for every optional A2A transport or extension;
- arbitrary callback URL fetching;
- delivery guarantees beyond the explicitly injected push delivery hook;
- replay of historical subscription events that the official v1.0.1 request surface does not request;
- changes to TRUYN/1 protocol stability.

Any future expansion of the claimed A2A lifecycle surface requires a new exact-version compatibility record and executable evidence.