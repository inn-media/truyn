# C8 — A2A / MCP Formal Security Closure Evidence

**Verdict:** PASS  
**Repository:** `inn-media/truyn`  
**Implementation PR:** `#423`  
**Accepted exact head:** `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`  
**Merged exact main:** `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`

This record closes the bounded C8 adversarial cross-protocol security matrix. It is evidence for the exact implementation and merged-main SHAs above; it is not a claim of ecosystem-wide certification for every A2A/MCP version, transport, deployment, or third-party implementation.

## Exact-head acceptance

- CI run `33788446130`: PASS.
- DCO 1.1: PASS.
- Go, Java and .NET compile: PASS.
- five-language executable SDK conformance: PASS.
- release-package build/verification: PASS.
- full `npm test`: PASS.
- `git diff --check`: PASS.
- hosted CodeQL run `33788430642`: PASS for `actions`, `csharp`, `go`, `java-kotlin`, `javascript-typescript`, and `python`.
- unresolved review threads at merge gate: `0`.
- branch divergence at merge gate: `behind=0`.
- merge was pinned to exact head `14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee`.

## Exact-main acceptance

- merged main SHA: `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`.
- ordinary push CI run `33788764754`: PASS.
- full `npm test`: PASS.
- `git diff --check`: PASS.
- hosted CodeQL run `33788764035`: PASS for `actions`, `csharp`, `go`, `java-kotlin`, `javascript-typescript`, and `python`.

## Security matrix verdict

The accepted C8 suite proves the bounded contract in both bridge directions and its owning regressions:

- authorization-aware visibility and zero unauthorized dispatch: PASS;
- transport authentication never becoming TRUYN authorization: PASS;
- requester/provider/account/tenant/owner/billing anti-spoofing: PASS;
- current account/tenant authority lifecycle enforcement: PASS;
- substituted/replayed request, message, task, context and RESULT correlation: PASS;
- wrong-provider RESULT and duplicate RESULT replay: PASS;
- protocol/version/JSON-RPC/response-id/redirect/header negatives: PASS;
- bounded MCP response reads, oversize cancellation and bounded configurable request timeout: PASS;
- artifact digest/size/base64/integrity, SSRF/reference-fetch and provenance negatives: PASS;
- unauthorized remote execution cardinality: exactly `0`;
- valid remote execution cardinality: exactly `1`.

Primary executable evidence:

- `tests/interoperability-security-matrix.test.js`
- `tests/c8-review-hardening.test.js`
- `tests/a2a-wrong-provider-result-c8.test.js`
- `tests/relay-result-replay-c8.test.js`
- `docs/compatibility/A2A_MCP_C8_SECURITY_MATRIX.md`

## Canonical evidence payload

The SHA-256 below is calculated over the exact compact JSON line in this section, encoded as UTF-8 bytes, with keys recursively sorted and separators `,` and `:` without whitespace.

```json
{"acceptedHeadSha":"14757e0f1d182e8fdf15e2f9e7ffe67749efc4ee","invariants":{"accountTenantAuthority":"PASS","artifactIntegritySsrfProvenance":"PASS","authorityAntiSpoofing":"PASS","authorizationVisibility":"PASS","boundedMcpResponseReads":"PASS","boundedMcpTimeout":"PASS","correlationReplay":"PASS","protocolTransportNegatives":"PASS","unauthorizedRemoteExecutions":0,"validRemoteExecutionCardinality":1},"mergedMainSha":"b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38","postMerge":{"ciRunId":33788764754,"codeqlLanguages":{"actions":"PASS","csharp":"PASS","go":"PASS","java-kotlin":"PASS","javascript-typescript":"PASS","python":"PASS"},"codeqlRunId":33788764035,"gitDiffCheck":"PASS","npmTest":"PASS"},"pr":423,"preMerge":{"behindMain":0,"ciRunId":33788446130,"codeqlLanguages":{"actions":"PASS","csharp":"PASS","go":"PASS","java-kotlin":"PASS","javascript-typescript":"PASS","python":"PASS"},"codeqlRunId":33788430642,"dco":"PASS","gitDiffCheck":"PASS","npmTest":"PASS","unresolvedReviewThreads":0},"repository":"inn-media/truyn","schema":"truyn.c8.security-closure.evidence.v1","verdict":"PASS"}
```

`evidence_payload_sha256 = 9dad0fc96d8041570e59982a3d541937689bd23ded1c44f803a88159a6998f73`

## Closure rule

C8 is accepted only for the exact evidence above. Any future change to the covered authorization, authority, correlation, transport, artifact-integrity, replay or execution-cardinality contracts requires its own regression and normal repository acceptance; it does not mutate this historical evidence record.
