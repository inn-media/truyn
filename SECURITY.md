# Security Policy

TRUYN is security-sensitive infrastructure. Do not publish exploitable vulnerabilities, credentials, private keys, private topology, operational allowlists, incident data, customer data or unremediated production bypasses in public issues.

**Documentation audit:** 2026-09-23  
**Protocol status:** `TRUYN/1` draft / pre-1.0

## Reporting

Use GitHub private vulnerability reporting when available. Never place credentials, private keys, production secrets, customer data or personally identifying data in a public report.

Security incidents may be coordinated under a bounded embargo. Material permanent changes to protocol/security semantics return to the public governance process after safe remediation/disclosure; an incident label is not a permanent private standards channel.

## Core security principles

### Open protocol != open billing account

Public TRUYN source, protocol, relay reachability or Agent Descriptor visibility never implies permission to spend another party's AI quota.

Normal users/providers are BYOK/owner-isolated unless an explicit authoritative policy grants otherwise.

### Server-side authorization

All chargeable/private execution converges on the same authority path before upstream provider invocation:

```text
authenticate
  → resolve server-bound identity/ownership/tenant
  → authorize provider/resource
  → resolve billing/entitlement responsibility
  → quota/policy gate
  → dispatch
  → provider-host recheck
  → execute
```

If identity, ownership, authorization, billing responsibility or required entitlement cannot be resolved, execution fails closed.

UI, CLI, SDK, MCP/A2A/NLWeb metadata, hidden IDs, DNS controls, edge routing or transport authentication are not substitutes for this authorization boundary.

### Provider ownership is not requester metadata

Provider ownership is bound to authenticated/signed provider identity and authoritative state. Requester-controlled `ownerId`, `tenantId`, provider ID or descriptive metadata cannot grant ownership or access.

Private/owner-only providers are filtered before discovery/dispatch for unauthorized requesters. Denial occurs before `adapter.execute()`; negative tests require zero provider execution for denied requesters.

### Credentials stay outside the network contract

Upstream provider keys/tokens/service credentials belong only to their local/provider runtime or managed private control plane. They do not belong in TRUYN envelopes, discovery metadata, Agent Descriptors, benchmark reports or public repository configuration.

### One execution boundary

Legacy HTTP, compact/fast HTTP, WebSocket, SDK, MCP, A2A, NLWeb and other compatible ingress paths must converge on the same provider authorization/billing decision before execution. A safer new route does not justify leaving an older bypass path.

## Current public-reference baseline

The public runtime is intentionally conservative:

- production-style registration/session paths are authenticated and freshness/replay bounded;
- provider access defaults fail-closed/owner-isolated unless explicit public mode is configured;
- public provider mode requires deliberate opt-in rather than accidental omission of policy;
- private providers are hidden from unauthorized discovery and denied before dispatch;
- provider-host authorization is a second independent check before adapter execution;
- sessions expire and registration replay IDs are rejected;
- HTTP/WebSocket payloads, relay queues and socket buffering are bounded;
- health responses are minimal by default and avoid secret/topology disclosure;
- local-development relay mode is loopback-only and must not silently coexist with production/public markers;
- optional edge/origin and protected-provider M2M guards are defense-in-depth transport boundaries, not provider authorization;
- fail-closed startup applies when a declared security boundary is incompletely configured.

Deployment-specific accepted security evidence remains under `docs/benchmarks/` and should not be duplicated into this policy as if every deployment automatically inherits it.

## Agent Descriptor security boundary

The TRUYN Agent Descriptor is signed bootstrap/self-description metadata, not authorization.

Public serving at:

```text
GET /.well-known/truyn-agent.json
```

is disabled by default and requires explicit opt-in. Public Descriptor generation exposes only an explicit public subset of actual capabilities and must not reveal credentials, private providers, backchannels, privileged allowlists, quotas, billing controls, internal deployment names or long-lived secret-bearing URLs.

Consumers verify supported schema/version/expiry, identity-key binding/signature and usable protocol/interface compatibility.

### Current lifecycle fact

The previous startup-only refresh limitation is obsolete. Open-1.0 S102 implemented bounded automatic Descriptor refresh/re-sign before expiry while preserving identity binding, capability filtering, TTL bounds and signature validity. `tests/agent-descriptor-refresh.test.js` covers this behavior.

Complete malformed/missing endpoint and typed usable-interface mapping parity across all SDKs remains a separate compatibility gate. Descriptor content never grants provider authorization.

## SDK security boundary

First-party SDKs for JavaScript/TypeScript, Python, Go, Java and C#/.NET are convenience clients over the same server-side rules. A modified SDK must not obtain any provider/resource capability that the same authenticated requester could not obtain by speaking the public protocol directly.

SDKs must not:

- expand discovery visibility client-side;
- reinterpret transport or Descriptor metadata as authority;
- embed provider credentials in network payloads;
- automatically follow arbitrary artifact URLs as trusted content;
- silently retry in a way that duplicates provider execution;
- accept cross-request/cross-provider RESULT/PARTIAL injection;
- generalize direct NEED cancellation to unsupported chain-stage cancellation;
- guess unknown required protocol/Descriptor semantics.

## Cancellation / exactly-once boundary

Requester-owned direct NEED cancellation is bounded and fail-closed. Pending work is removed where possible, in-flight work receives cancellation when supported, and late RESULT/PARTIAL after terminal cancellation is rejected.

Reconnect/retry logic must preserve request/provider correlation and must not create duplicate provider execution. Exactly-once claims require corresponding regression/evidence; connection recovery alone is not permission to replay paid work blindly.

## Public / private repository boundary

Public `inn-media/truyn` may contain:

- protocol/specification/governance contracts;
- generic reference implementation;
- generic adapters/SDKs/conformance;
- security invariants and local examples;
- benchmark methodology;
- sanitized durable benchmark evidence.

It must not contain unnecessary live operational material such as:

- credentials/private keys/access tokens/credential-bearing URLs;
- private cloud resource/deployment names or internal origins;
- unnecessary subscription/project/tenant identifiers;
- privileged owner provisioning/bootstrap secrets;
- real WIF/service-account/managed-identity topology;
- private bucket/container names;
- live quota/cost ceilings/kill switches/allowlists;
- hidden private provider inventories;
- raw benchmark logs exposing private topology, customer prompts/data or secrets.

Managed production authority/control-plane implementation, real cloud orchestration, commercial entitlement/billing state, private topology/identities/quotas/budgets and raw private telemetry belong to access-controlled `inn-media/truyn-platform` or other protected operational systems.

Dependency direction is one-way: private may consume accepted/versioned public artifacts/contracts; public must never depend on private code.

## Package/release security

Generated package verification checks expected structure, source/digest binding, legal files and forbidden archive entry names. This is useful packaging hygiene but is not proof that arbitrary secret bytes under innocent filenames cannot enter an archive.

Complete archive-member byte-content leakage scanning remains a separate hardening gate. Public registry publication and live developer-site deployment require their own least-privileged external release infrastructure/evidence.

## Benchmark evidence preservation

`docs/benchmarks/` is a protected evidence ledger. Security sanitation follows **redact-not-delete**:

- redact only the sensitive field/value or minimum necessary operational detail;
- preserve methodology, workload/corpus, gates, measured results, limitations and corrections;
- preserve tested source/run/artifact/digest identity when safe;
- record material redactions/corrections in history;
- never solve a secret problem by globally deleting benchmark reports or replacing them with empty summaries.

If an accepted report is later invalidated/superseded, preserve an explicit correction/tombstone pointing to the superseding evidence rather than silently erasing history.

## History / secret response

Removing a secret from the current tree is insufficient if it existed historically. Potentially exposed credentials must be revoked/rotated; hosting-side caches, PR refs, artifacts, forks/clones or package versions may require separate cleanup.

History rewriting is a last-resort secret-removal mechanism and must not be used to erase sanitized benchmark/governance evidence. After a necessary rewrite, safe evidence is restored into the new history immediately.

## Security acceptance invariants

The repository regression/security suite must continue to prove the bounded invariants relevant to current code, including:

- non-enrolled/replayed identity/session attempts fail;
- unauthorized private-provider discovery/dispatch fails before provider execution;
- forged requester owner/tenant/provider metadata cannot grant authority;
- authorized private/BYOK requester paths can succeed without making the provider globally public;
- all ingress paths share the same authorization filter;
- payload/queue/socket bounds fail safely;
- provider-host recheck remains independent;
- optional declared edge/M2M guards fail closed when proof/configuration is invalid;
- Agent Descriptor visibility/signature/refresh never becomes authorization;
- public repository/evidence/package guards reject secret/private-topology leakage while preserving safe benchmark evidence.

Historical deployment-specific security proofs remain durable benchmark evidence and are not generalized beyond their tested source/topology.

## Governance separation

Maintainer/TSC/Founding Steward status does not grant provider/resource authorization. Governance authority and operational access/billing authority are separate domains.
