# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot date:** 2026-09-03  
**Production/reference baseline:** `main@476cc1333b2db7d85599c7e7f32c7b954b79611f`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73` / merged PR `#399`  
**Sprint C exact executable proof:** `a435ed16e559226ed095959b7b95aa7067271302`  
**Sprint D exact executable proof:** `0a40e635533f6a9623b19057b3320ba2a888f1f1`  
**Sprint E exact executable proof:** `14984e4a1409dafe0e3a056128292d83895cc6f4`  
**Protocol generation:** `TRUYN/1` draft

This document answers one question: **what is actually implemented and proven now, versus only defined, attempted, or still open?** Architecture documents define contracts; tests and durable evidence prove bounded claims. Old operational issues and historical acceptance reports remain audit records and do not become current status merely because they still exist.

## Status vocabulary

- **Defined** — architecture/specification exists.
- **Implemented** — executable reference code exists.
- **CI-proven** — bounded automated evidence exists.
- **Bounded real-testnet proven** — exercised across real processes/hosts/network paths in a bounded topology.
- **Independent black-box proven** — exercised against an independently running external SDK/reference implementation through its public interface.
- **Productionized** — lifecycle/recovery/durability/security/observability gates are satisfied for the intended deployment class.
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
- **Stable** — a compatibility guarantee is declared.

An admission/preflight/diagnostic PASS authorizes or informs later work; it does not convert a failed D-1000 campaign into PASS.

## Canonical system matrix

| Subsystem | Current factual state | Evidence / next gate |
|---|---|---|
| Cryptographic node identity / signed envelopes | **Implemented / CI-proven** | protocol remains draft |
| QUIC underlay / authenticated peer sessions | **Implemented / CI-proven** | broader Internet lifecycle/SLO closure open |
| Kademlia discovery/state RPC | **Implemented / CI-proven** | larger operational repair/durability scale open |
| Direct-first P2P + relay fallback | **Implemented / CI-proven + bounded WAN proof** | broader production SLO closure open |
| STUN / same-port hole punching | **Implemented bounded reference path** | universal NAT traversal not claimed |
| Class C heterogeneous WAN | **ACCEPTED / PASS** | durable Azure/GCP WAN, partition/heal, NAT/CGNAT-like and relay recovery evidence |
| Class D-100 | **ACCEPTED / PASS** | 100 real processes/identities/QUIC endpoints |
| D-200 diagnostics | **Implemented bounded diagnostic/remediation slices** | PRs `#417`/`#418`: parallel restart/timing parsing; PR `#419`: bounded packet-partition diagnostic patcher; none changes D-1000 acceptance |
| Class D-1000 | **OPEN — latest full pinned campaign FAIL** | one new exact pinned 20×50 accepted campaign required |
| Semantic index/retrieval | **Implemented / CI+benchmark proven** | larger open-network operating scale remains separate |
| Distributed semantic retrieval | **Implemented / CI+benchmark proven** | broader decentralized holder/adversarial scale open |
| Byzantine read-quorum placement | **Implemented reference slice / CI+benchmark proven** | open-network adversarial scale open |
| Claim-centric + active Trustability | **Implemented / CI+benchmark proven** | production authority/revocation operations continue |
| Provider ownership / visibility | **Implemented fail-closed reference boundary** | richer account/org tenant control plane open |
| Provider discovery authorization | **Implemented / negative-test proven** | richer grants/account binding open |
| Provider-host access control | **Implemented / negative-test proven** | production tenant binding remains broader work |
| BYOK | **Implemented reference CLI/runtime flow** | OS-native secure-store integrations incomplete |
| Billing safety | **BYOK/owner-funded implemented; sponsored guarded; prepaid/subscription fail closed** | production entitlement/accounting control plane open |
| DCO 1.1 | **Implemented for PR contribution range** | exact PR base→head; post-merge main does not rerun DCO |
| MCP server/configured provider | **Implemented / bounded CI-proven** | broader optional MCP surfaces remain separate |
| General MCP discovery/import | **Implemented / bounded CI-proven — C2** | PR `#332` |
| A2A server facade | **Implemented / bounded CI-proven — C3** | Agent Card, SendMessage/GetTask, RESULT→Artifact |
| A2A client/provider adapter | **Implemented / bounded CI-proven — C4** | PR `#340` |
| A2A polling async lifecycle | **Implemented / bounded CI-proven — C5** | exactly-one SendMessage + bounded GetTask polling |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** | digest/size/canonicalization/no implicit SSRF/provenance |
| A2A→TRUYN→MCP | **C7 + independent official MCP SDK black-box proven — Sprint D** | `@modelcontextprotocol/server@2.0.0`, separate process |
| MCP→TRUYN→A2A | **C7 + independent official A2A SDK black-box proven — Sprint C** | `@a2a-js/sdk@1.0.1`, separate process |
| Complete A2A/MCP adversarial matrix | **OPEN — C8** | PR `#369`; full exact-head + post-merge acceptance still required |
| External referenced file/artifact profile | **ACCEPTED / independent bidirectional black-box CI-proven — Sprint E** | official A2A/MCP SDK processes, explicit resolution, SHA-256/size/MIME/filename/provenance, exactly-once and fail-closed negatives; `docs/compatibility/A2A_MCP_EXTERNAL_ARTIFACT_BLACK_BOX.md` |
| TypeScript/JavaScript SDK | **Implemented Developer Release client / executable conformance** | public registry publication still open |
| Python SDK | **Implemented Developer Release client / executable conformance** | public registry publication still open |
| Go SDK | **Implemented Developer Release relay client / executable conformance** | public module/tag release evidence still open |
| Java SDK | **Implemented Developer Release relay client / executable conformance** | Maven Central publication evidence still open |
| C#/.NET SDK | **Implemented Developer Release relay client / executable conformance** | NuGet publication evidence still open |
| Five-language executable conformance | **Implemented / CI-proven happy path** | real local relay + valid signed Descriptor fixture; not every negative invariant is covered by this runner |
| Direct NEED cancellation | **Implemented / bounded compact lifecycle CI-proven** | signed REVOKE/provider abort/late-output fail closed; legacy `waitForResult` is not guaranteed to terminate on revoke |
| Signed PARTIAL streaming | **Implemented / bounded CI-proven** | generic ordered delta/chunk, strict correlation/order/backpressure/terminal rules |
| Async fast NEED lifecycle status | **Implemented / bounded CI-proven** | owner-only compact status + bounded expiry |
| Chain-stage cancellation | **Not supported** | requires separate future bounded contract |
| Standardized cross-provider tokenizer/token wire format | **Not defined** | generic PARTIAL intentionally does not prescribe tokenizer semantics |
| TRUYN Agent Descriptor | **Partially implemented / bounded happy-path CI-proven** | default-off startup-signed serving + five-language valid-fixture fetch/signature/expiry flow; automatic re-sign-before-expiry and full usable endpoint validation/mapping parity remain open |
| Package verification builds + provenance | **Implemented / CI-proven per build** | npm/PyPI/Go/Maven/NuGet CI artifacts bind to exact source SHA + digest; ordinary CI does not enforce immutable version-to-source binding |
| Native public package publication | **OPEN** | immutable release source/version + registry ownership/trusted-publishing + accepted release infrastructure + observed publication |
| Public developer site | **Source implemented; live activation/liveness OPEN** | deployment/settings/public URL evidence still required |
| Settlement adapters x402/AP2 | **Defined, not implemented** | settlement-neutral core; deferred extension work |
| Governance | **G1 / bootstrap Founding Stewardship** | external maintainers/TSC/neutral stewardship are not facts |
| Production relay origin perimeter | **Deployment-proven current reference perimeter** | Cloudflare → Azure Front Door → Container Apps direct-bypass denial evidence |
| Production SLI / SLO contract | **Defined numerical target contract** | rolling 28-day SLIs, exclusions, error budgets and burn-rate policy are defined in `docs/operations/PRODUCTION_SLO.md`; real production telemetry/dashboards/alerting/on-call compliance evidence remains OPEN |
| Mainnet | **Not productionized** | D-1000 + operations + compatibility/stability + governance maturity |

## Network productionization

### Class C — accepted

The accepted Class C evidence proves a heterogeneous Azure/GCP bounded WAN topology with direct cross-cloud QUIC, packet-path partition/heal, NAT cases, authenticated relay fallback/outage behavior, recovery and cleanup. It is not a universal carrier-network claim.

### Class D-100 — accepted

The accepted D-100 evidence proves 100 real processes, 100 identities and 100 QUIC endpoints on four hosts with the required routing/recovery/adversarial/cleanup predicates.

### Class D-1000 — OPEN

The current canonical negative D-1000 acceptance record remains the full pinned candidate:

```text
tested source: 0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094
pinned ref: d1000/pinned-0e7f16c1
immutable preflight: PASS
full run: 32869078719
issue: #344
target: 20 hosts × 50 = 1,000 real processes
result: FAIL
campaign_rc: 1
evaluator_rc: 99
terminal_rc: 99
recorded cleanup_confirmed: false
recorded remainingResources: -1
artifact ID: 9580018311
artifact digest: sha256:daf0a43ca254629a49250c00a7dc22eed7835157e11b7cfb875083a1a7966166
```

Later main contains substantial D-200 diagnostic/remediation work around bootstrap/refresh/readiness/convergence/baseline/safety/restart and packet-partition diagnostics. PR `#417` adds a bounded diagnostic patcher that stops and starts the same five nodes per host in parallel, preserves the `<=120 s` recovery gate and 100-node restart cardinality, and emits `STOP_MS`, `START_MS`, `READY_MS` and `RESTART_MS` diagnostics. PR `#418` hardens the collector to parse those timing markers by exact line prefix so `START_MS` cannot collide with `RESTART_MS`. PR `#419` adds a bounded packet-partition diagnostic patcher. Later one-shot launcher cleanup leaves those diagnostic sources intact. This remains intentionally **not strict D-1000 acceptance** and does not supersede issue `#344` until a later full 20×50 campaign satisfies the canonical gate.

D-1000 promotion still requires one new pinned run proving all of:

- 20 hosts × 50 = 1,000 real processes/identities/QUIC endpoints;
- baseline and healed routing `>=99%`;
- recovery/convergence p95 `<=120 s`;
- all required adversarial predicates;
- zero safety violations;
- canonical evaluator `PASS`;
- strict terminal `PASS`;
- canonical `cleanup=true` and `remainingResources=0`;
- immutable accepted artifact and digest;
- durable sanitized accepted benchmark evidence.

No preflight, diagnostic or cleanup success substitutes for those predicates.

## Production SLI / SLO boundary

The numerical service-level target contract is now defined in `docs/operations/PRODUCTION_SLO.md`. It distinguishes rolling production SLIs from bounded benchmark gates and defines targets for relay HTTP/WebSocket availability, authenticated request success, NEED dispatch, RESULT delivery, first-party provider-runtime availability, DHT/routing health, stale-selection rate, synchronous end-to-end latency, connection latency and instance/routing recovery.

The canonical compliance window is 28 days with explicit machine-attributable exclusions, independent error budgets and multi-window burn-rate actions. Security/correctness invariants such as unauthorized owner-funded execution or cross-request RESULT injection have zero spendable error budget.

This is currently **Defined**, not Productionized. The next gate is real serving-path telemetry plus external probes, dashboards/reporting, burn-rate alerts, on-call ownership, controlled recovery measurement and durable sanitized compliance evidence. D-1000 remains independent: neither accepted D-1000 nor an SLO dashboard substitutes for the other.

## A2A / MCP interoperability boundary

Current accepted interoperability state is:

```text
C1 MCP current contract                ACCEPTED
C2 MCP discovery/import               ACCEPTED
C3 A2A server facade                  ACCEPTED
C4 A2A client/provider adapter        ACCEPTED
C5 bounded async polling              ACCEPTED
C6 artifact integrity                 ACCEPTED
C7 both bidirectional bridge paths    ACCEPTED / bounded CI-proven
Sprint C independent remote A2A       ACCEPTED / official SDK black-box CI-proven
Sprint D independent remote MCP       ACCEPTED / official SDK black-box CI-proven
Sprint E referenced artifacts         ACCEPTED / bidirectional official SDK black-box CI-proven
C8 complete adversarial matrix        OPEN (#369)
stable compatibility declaration      OPEN
```

C7 proves in-repository composition in both directions and exactly-once remote execution assertions.

Sprint C adds independent ecosystem-side proof for `MCP→TRUYN→A2A`: the remote server is a separate process using official A2A Project `@a2a-js/sdk@1.0.1`, not TRUYN's own A2A server helper. External instrumentation confirms the independent execution path.

Sprint D adds the symmetric proof for `A2A→TRUYN→MCP`: the remote server is a separate process using official `@modelcontextprotocol/server@2.0.0` and its public handler lifecycle. Targeted owner/requester/billing spoof negatives fail before unauthorized external execution.

Sprint E carries the same deterministic referenced binary through both independent protocol boundaries. The A2A direction uses a real URL part and an explicit resolver; the MCP direction uses standard `resource_link` plus `resources/read`. Both preserve filename, MIME type, exact byte size, SHA-256 integrity and authoritative TRUYN provenance. Valid execution is exactly once; missing resolvers and corrupt digest/size fail closed. No implicit arbitrary URL fetch is allowed. This bounded MCP resolver profile does not promote arbitrary optional MCP resources into general TRUYN OBJECT/STATE support.

These independent proofs are bounded adoption evidence, not ecosystem-wide certification. C8 remains independently open, and stable A2A/MCP compatibility remains undeclared while `TRUYN/1` is draft.

Remote A2A/MCP metadata and transport authentication remain non-authoritative for TRUYN requester identity, provider ownership or billing responsibility.

## SDK / developer experience boundary

The old descriptions “SDK scaffolding only”, “Go/Java/.NET skeleton parity”, “direct NEED cancellation not implemented” and “PARTIAL streaming not implemented” are obsolete for current main. The stronger claim that the Agent Descriptor lifecycle is complete is also inaccurate.

The merged Developer Release Layer provides common bounded relay-client semantics across TypeScript/JavaScript, Python, Go, Java and C#/.NET:

- local Ed25519 identities;
- signed TRUYN envelopes and received-event verification;
- authenticated relay registration/session use;
- authorization-aware capability discovery;
- OFFER publication;
- NEED submission and provider-side verified NEED consumption;
- correlated signed RESULT return/requester verification;
- direct requester cancellation calls through signed REVOKE;
- stable API-v1 object/artifact reference shapes;
- normalized fail-closed errors;
- Agent Descriptor HTTP retrieval and valid-fixture schema/version/expiry/identity-signature happy-path verification.

The executable gate `sdk/conformance/run-five-language-e2e.mjs` starts one real local relay and one valid signed Descriptor fixture, then independently runs provider/requester flows in all five required languages, including a cancellation call from the owning requester. It does not attempt non-owner cancellation and does not cover every malformed Descriptor/interface case.

For direct cancellation, the compact lifecycle has the strongest proven waiter semantics: an open compact `waitMs > 0` waiter resolves `request_cancelled`, while an async compact `waitMs=0` owner can inspect `compactRequestStatus`. The legacy/general `waitForResult` path is not guaranteed to terminate on revoke and may remain waiting until a result or timeout.

Two streaming concepts are implemented:

1. authenticated relay/event streaming for SDK consumers;
2. signed compact `PARTIAL` delivery for provider partial results.

`PARTIAL` is a generic ordered delta/chunk contract. TRUYN does not define a universal tokenizer, provider token-ID format or token-delta vocabulary.

Agent Descriptor status is bounded, not complete. Serving is disabled by default, requires explicit public opt-in/capability allowlisting, and the startup-generated Descriptor is signed by the current TRUYN identity key. However, `runtime/service.js` creates that Descriptor once at provider startup and does not automatically refresh/re-sign it before expiry. In addition, Go/Java/.NET do not yet all reject a supported interface type without a usable non-empty endpoint, and Go/.NET typed endpoint mapping is not fully aligned with the schema. Complete lifecycle/usable-interface parity therefore remains open. A Descriptor never grants provider authorization; delegated Descriptor-signing keys remain outside the alpha contract.

Ordinary CI builds npm, Python, Go, Maven and NuGet verification artifacts and records exact source SHA, package coordinate/version, byte size and SHA-256 digest in the manifest. The nominal alpha version is rebuilt on different CI source SHAs, so per-build provenance is proven but immutable version-to-source release binding is not yet enforced. Archive verification checks expected files, licensing and forbidden entry names; it does not perform a complete byte-content secret/topology scan of generated packages.

The remaining SDK/DX gates include:

- automatic Agent Descriptor refresh/re-signing and complete usable-interface validation/mapping parity;
- immutable native public registry publication after namespace ownership/trusted-publishing bootstrap and accepted release infrastructure;
- generated-package content security review appropriate for publication;
- live public developer-site activation/liveness proof.

Stable SDK API contract v1 remains separate from `TRUYN/1` protocol stability and does not imply publicly stable packages.

## Governance boundary

TRUYN has public governance architecture/process (G1) but remains operationally under bootstrap Founding Stewardship. External maintainers, a multi-organization TSC, neutral legal stewardship and demonstrated succession must not be claimed before they exist.

## Documentation hygiene rule

Historical benchmark reports, changelog entries, old PR descriptions and closed operational issues are retained as audit history. Current-status documents must describe the **latest accepted/failed state**. When accepted code/evidence and current-status prose disagree, update the prose; do not downgrade implemented code to match stale documentation.