# TRUYN Implementation Status

**Status:** canonical factual status index.  
**Snapshot date:** 2026-08-27  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`  
**Protocol generation:** `TRUYN/1` draft

This document answers one question: **what is actually implemented and proven now, versus only defined, attempted, or still open?** Architecture documents define contracts; tests and durable evidence prove bounded claims. Old operational issues remain historical records and are not current status merely because they once existed.

## Status vocabulary

- **Defined** — architecture/specification exists.
- **Implemented** — executable reference code exists.
- **CI-proven** — bounded automated tests prove the stated contract.
- **Bounded real-testnet proven** — exercised across real processes/hosts/network paths in a bounded topology.
- **Productionized** — lifecycle/recovery/durability/security/observability gates are satisfied for the intended deployment class.
- **Internet-scale proven** — large real-node/WAN/adversarial evidence exists.
- **Stable** — a compatibility guarantee is declared.

An admission/preflight PASS authorizes a campaign; it does not convert a failed campaign into PASS.

## Canonical system matrix

| Subsystem | Current factual state | Evidence / next gate |
|---|---|---|
| Cryptographic node identity / signed envelopes | **Implemented / CI-proven** | protocol remains draft |
| QUIC underlay / authenticated peer sessions | **Implemented / CI-proven** | broader Internet lifecycle/SLO closure open |
| Kademlia discovery/state RPC | **Implemented / CI-proven** | larger operational repair/durability scale open |
| Direct-first P2P + relay fallback | **Implemented / CI-proven + bounded WAN proof** | broader production SLO closure open |
| STUN / same-port hole punching | **Implemented bounded reference path** | universal NAT traversal not claimed |
| Class C heterogeneous WAN | **ACCEPTED / PASS** | durable Azure/GCP WAN, partition/heal, NAT/CGNAT-like and relay failure/recovery evidence |
| Class D-100 | **ACCEPTED / PASS** | 100 real processes/identities/QUIC endpoints; durable report remains canonical |
| Class D-1000 | **OPEN — latest full pinned campaign FAIL** | exact details below; no 1,000-node acceptance yet |
| Semantic index/retrieval | **Implemented / CI+benchmark proven** | larger open-network operating scale remains separate |
| Distributed semantic retrieval | **Implemented / CI+benchmark proven** | broader decentralized holder/adversarial scale open |
| Byzantine read-quorum placement | **Implemented reference slice / CI+benchmark proven** | open-network adversarial scale open |
| Claim-centric + active Trustability | **Implemented / CI+benchmark proven** | production authority/revocation operations continue |
| Provider ownership / visibility | **Implemented fail-closed reference boundary** | richer account/org tenant control plane open |
| Provider discovery authorization | **Implemented / negative-test proven** | richer grants/account binding open |
| Provider-host access control | **Implemented / negative-test proven** | production tenant binding remains broader work |
| BYOK | **Implemented reference CLI/runtime flow** | OS-native secure-store integrations incomplete |
| Billing safety | **BYOK/owner-funded implemented; sponsored guarded; prepaid/subscription fail closed** | production entitlement/accounting control plane open |
| DCO 1.1 | **Implemented for PR contribution range** | repository workflow checks exact PR base→head; post-merge main does not rerun DCO |
| MCP server/configured provider | **Implemented / bounded CI-proven** | broader optional MCP surfaces and ecosystem certification open |
| General MCP discovery/import | **Implemented / bounded CI-proven — C2** | PR `#332` |
| A2A server facade | **Implemented / bounded CI-proven — C3** | Agent Card, SendMessage/GetTask, RESULT→Artifact |
| A2A client/provider adapter | **Implemented / bounded CI-proven — C4** | PR `#340`, merge `1735528461a04de60f9f8572b466a732a6f03c62` |
| A2A polling async lifecycle | **Implemented / bounded CI-proven — C5** | PR `#352`, merge `591d30d8f57fb7c661c847bb059cd437f437dd08` |
| A2A artifact integrity | **Implemented / bounded CI-proven — C6** | PR `#368`, merge `0e6e4119450e9de55fb9be32b993a28f98dda148` |
| A2A→TRUYN→MCP | **Implemented / bounded CI-proven — C7** | `tests/interoperability-bidirectional.test.js`, PR `#357` |
| MCP→TRUYN→A2A | **Implemented / bounded CI-proven — C7** | same C7 suite; exactly-once remote A2A execution |
| Complete A2A/MCP adversarial matrix | **OPEN — C8** | PR `#369`; acceptance not yet earned |
| Independent external A2A/MCP ecosystem proof | **Not yet proven** | next adoption-level gate after bounded C7/C8 |
| First-party TypeScript/JavaScript SDK | **Implemented / CI-proven reference client** | DX-1 onward; current API below |
| First-party Python SDK | **Implemented / CI-proven reference client** | DX-1 onward; current API below |
| Go / Java / .NET SDK parity | **Defined / incomplete** | required parity/publication work remains |
| DX-3 runtime developer surface | **Merged / bounded implemented on current main** | PR `#373`, merge source `63e54cbe...`; stable API-v1 primitives for TS/Python, authenticated relay event streaming with abortable waits, reference-only object/artifact payloads, conformance markers and developer-site source |
| Remote provider-side NEED cancellation | **Not implemented** | explicit DX-3 follow-up; do not infer from local abortable waits |
| Token-delta streaming | **Not implemented** | explicit DX-3 follow-up |
| TRUYN Agent Descriptor | **Draft + parser/verifier conformance implemented; full serving/discovery contract incomplete** | well-known/native runtime discovery remains open |
| Settlement adapters x402/AP2 | **Defined, not implemented** | settlement-neutral core; deferred extension work |
| Governance | **G1 / bootstrap Founding Stewardship** | public governance/RFC/extension process exists; external maintainers/TSC/neutral foundation are not facts |
| Production relay origin perimeter | **Deployment-proven current reference perimeter** | Cloudflare → Azure Front Door → Container Apps direct-bypass denial evidence |
| Mainnet | **Not productionized** | requires D-1000 acceptance and later stabilization/operations gates |

## Network productionization

### Class C — accepted

The accepted Class C evidence proves a heterogeneous Azure/GCP bounded WAN topology with direct cross-cloud QUIC, packet-path partition/heal, NAT cases, authenticated relay fallback/outage behavior, recovery and cleanup. It is not a universal carrier-network claim.

### Class D-100 — accepted

The accepted D-100 evidence proves 100 real processes, 100 identities and 100 QUIC endpoints on four hosts with the required routing/recovery/adversarial/cleanup acceptance predicates. Old V16 observer/probe/status issues are historical diagnostics, not current blockers.

### Class D-1000 — OPEN

The earlier `ee0732b57a602bea8df9f964bf5fe27d19ee77f8` campaign is no longer the latest campaign and must not be described as the active blocker.

The latest admitted/pinned candidate before the current remediation sequence is:

```text
tested source: 0e7f16c1ff74d85e9d4dbbc0fec9a35a0840f094
pinned ref: d1000/pinned-0e7f16c1
exact CI: 32867819485
exact CodeQL: 32867819162
immutable preflight: 32868395311 = PASS
preflight issue: #342 (historical completed record)
artifact ID: 9571195219
artifact digest: sha256:0beb64fd39ed59242113f66a1998a94ba406b5c055bbe6318a86e6bf61273795
runtime bundle sha256: 6bbb128ba568f6a7dca033dd3e0b3373809577249c28dd4c6c2a6d180ae67ee4
VM smoke: PASS
VM smoke cleanup: true
VM smoke remaining resources: 0
```

The corresponding full pinned campaign is:

```text
run: 32869078719
start record: #343 (historical completed record)
terminal negative record: #344 (kept OPEN until a later accepted D-1000 supersedes it)
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

This campaign is **not accepted**. Issue `#344` remains the current negative acceptance record until a newer full campaign proves all canonical PASS conditions.

Current main already contains later D-1000 remediation work, including the bootstrap/readiness checkpoint repair and PR `#367` fail-evidence finalization before cleanup. PR `#372` is active diagnostic sizing work and explicitly does not change accepted D-1000 topology, thresholds, evaluator, terminal verifier, safety predicates or the strict `50` nodes/host acceptance boundary.

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

No preflight or cleanup success substitutes for those predicates.

## A2A / MCP interoperability boundary

The repository has progressed past the old C3-only snapshot.

```text
C1 MCP current contract                ACCEPTED
C2 MCP discovery/import               ACCEPTED
C3 A2A server facade                  ACCEPTED
C4 A2A client/provider adapter        ACCEPTED
C5 bounded async polling              ACCEPTED
C6 artifact integrity                 ACCEPTED
C7 both bidirectional bridge paths    ACCEPTED / bounded CI-proven
C8 complete adversarial matrix        OPEN (#369)
```

C7 proves in-repository composition in both directions and exactly-once remote execution assertions. It does not constitute independent external A2A/MCP ecosystem certification. The adoption follow-up is independent reference/SDK interoperability plus the accepted C8 negative matrix, not reimplementation of the bridge.

Remote A2A/MCP metadata and transport authentication remain non-authoritative for TRUYN requester identity, provider ownership or billing responsibility.

## SDK / developer experience boundary

The old “SDK scaffolding only” description is obsolete.

Current main includes first-party TypeScript/JavaScript and Python client implementations and the merged DX-3 runtime developer surface. DX-3 adds stable API-v1 primitives for those two clients, authenticated relay event streaming with abortable waits, reference-only object/artifact payloads, conformance markers and developer-site source.

This is still a bounded developer surface, not a universal stable-v1 ecosystem promise. In particular:

- Go/Java/.NET parity/publication remains open;
- remote provider-side NEED cancellation is not implemented;
- token-delta streaming is not implemented;
- Agent Descriptor full runtime serving/discovery remains incomplete;
- package/release provenance and long-term compatibility policy remain later gates.

## Governance boundary

TRUYN has public governance architecture and process (G1) but remains operationally under bootstrap Founding Stewardship. External maintainers, a multi-organization TSC, neutral legal stewardship and demonstrated succession must not be claimed before they exist.

## Documentation hygiene rule

Historical benchmark reports, changelog entries and closed operational issues are retained as audit history. Current status documents must always describe the **latest accepted/failed state**, not whichever historical issue is easiest to find. When code and current-status prose disagree, update the prose; do not downgrade implemented code to match stale documentation.
