# C8 — A2A / MCP Security Matrix

**Scope:** one bounded interoperability security-matrix change. C8 does not change protocol semantics, provider-selection policy, billing policy, or acceptance thresholds.

## Security invariant

Every cross-protocol path is fail closed. A remote A2A or MCP identity, transport credential, metadata field, request/result correlation identifier, artifact claim, redirect, or retry is descriptive input only. None of it may become TRUYN requester authority, provider ownership, billing authority, or permission to execute.

## Matrix

### Authorization and visibility

- unauthorized A2A request => zero TRUYN NEED and zero MCP execution;
- unauthorized MCP request => zero imported A2A execution;
- private TRUYN OFFER / A2A skill / MCP tool is not surfaced through the opposite protocol;
- transport authentication never implies TRUYN authorization.

### Identity and authority anti-spoofing

Remote metadata cannot override authoritative TRUYN requester identity, provider owner, tenant/owner policy, billing responsibility, or entitlement. Those values are derived only from the authenticated TRUYN boundary.

### Correlation attacks

The following must fail closed and must not cause a second remote execution:

- substituted TRUYN `requestId`;
- substituted A2A `messageId`;
- substituted A2A `taskId`;
- substituted A2A `contextId`;
- result from the wrong provider;
- duplicate/result replay;
- cross-request RESULT injection.

### Protocol and transport negatives

- wrong A2A protocol version;
- wrong MCP protocol version;
- malformed JSON-RPC;
- JSON-RPC response ID mismatch;
- cross-origin A2A interface when cross-origin interfaces are not explicitly allowed;
- reserved/auth header injection;
- authorization/header leakage across redirects;
- oversized response;
- bounded request timeout.

MCP and A2A clients MUST use redirect-deny/fail-closed behavior when credentials are attached. Response bodies MUST be bounded while reading, not only after complete buffering.

### Artifact and data security

C8 consumes the accepted C6 integrity contract and proves it across the bridge:

- digest tampering fails;
- byte-size mismatch fails;
- malformed/non-canonical base64 fails;
- oversized artifact or aggregate artifact materialization fails before successful RESULT;
- URL/reference content is never fetched implicitly;
- resolver amplification is bounded;
- provider-supplied source/provenance cannot spoof authoritative provenance;
- corrupted/unverified artifacts never become a successful cross-protocol RESULT.

### Execution safety

For every negative matrix case:

- unauthorized remote execution count = 0;
- no fallback/retry may create a duplicate side effect.

For every valid matrix case:

- remote execution count = exactly 1.

## Required executable evidence

The bounded implementation MUST add `tests/interoperability-security-matrix.test.js` and keep focused transport/artifact regressions near their owning modules when useful. The matrix must cover both directions:

1. A2A -> TRUYN -> imported MCP;
2. MCP -> TRUYN -> imported A2A.

Before merge, the exact C8 head requires:

- security matrix suite PASS;
- full `npm test` PASS;
- `git diff --check` PASS;
- DCO PASS;
- CodeQL PASS.

After merge, exact `main` requires ordinary CI and CodeQL green. Only then may `ROADMAP.md` and `docs/architecture/IMPLEMENTATION_STATUS.md` be synchronized to record C4-C8 as implemented/accepted.

## Explicit non-goals

C8 does not add streaming/chunk reassembly, push lifecycle, new auth providers, new billing modes, new discovery semantics, or stable-v1 compatibility declarations.
