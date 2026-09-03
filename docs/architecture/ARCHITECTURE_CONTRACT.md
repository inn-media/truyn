# TRUYN Architecture Contract

This document prevents architecture, implementation status, public documentation, governance and benchmark evidence from silently diverging.

**Snapshot:** 2026-09-03  
**Synchronized source:** `main@b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`  
**Developer Release source freeze:** `main@23252d01f443ec4d0145ba7fc4856d11fdcf8d73`

## Document authority

| Concern | Source of truth |
|---|---|
| TRUYN protocol semantics | `spec/protocol/<generation>/` |
| Machine-readable wire schema | `proto/<generation>/` |
| Governance / normative change process | `GOVERNANCE.md`, `docs/governance/` |
| Architecture ownership/invariants | this document + subsystem architecture files |
| Current implementation/proof status | `IMPLEMENTATION_STATUS.md` |
| Measured/accepted benchmark facts | `docs/benchmarks/` |
| Public project summary | root `README.md` |
| Sequencing / next gates | root `ROADMAP.md` |
| Historical changes | `CHANGELOG.md` |

If these disagree, the inconsistency is a documentation defect. Historical prose does not override newer accepted implementation/evidence.

## Core invariants

### Identity

TRUYN authority comes from authenticated/signed TRUYN identities and local policy. External protocol metadata is never an implicit substitute.

### Provider authorization

Provider discovery and execution are separate from capability compatibility. A provider may be technically compatible but hidden/denied to the requester. All execution-capable surfaces converge on the same provider visibility/access/billing boundary.

### Billing

Requester-controlled metadata cannot assign provider ownership or billing responsibility. Settlement mechanisms, when present, do not become authorization sources.

### Interoperability

A2A and MCP are adapters, not TRUYN/1 wire dependencies. Current accepted bounded ownership includes:

- MCP current server/client/configured provider + general discovery/import (C1/C2);
- A2A server facade (C3);
- A2A client/provider discovery/import (C4);
- bounded polling lifecycle (C5);
- A2A artifact integrity (C6);
- both in-repository A2A↔TRUYN↔MCP round trips (C7);
- independent official A2A SDK black-box proof for `MCP→TRUYN→A2A` (Sprint C);
- independent official MCP SDK black-box proof for `A2A→TRUYN→MCP` (Sprint D);
- complete bounded cross-protocol adversarial security matrix (C8), accepted in PR `#423` on exact main `b7f8c5e0ffd0fb8db30d1d6d48811db96fb17e38`.

C8 durable closure evidence is `../compatibility/A2A_MCP_C8_SECURITY_EVIDENCE.md`. The independent external SDK and C8 proofs are bounded evidence, not ecosystem-wide certification. An integrity-verified external referenced file/artifact round trip and a stable compatibility declaration remain later adoption/stability gates.

### Artifact integrity

Content/reference translation cannot silently weaken integrity. C6 requires bounded sizes, digest/byte-size/canonical encoding checks, no implicit URL resolution/SSRF and authoritative TRUYN provenance before successful cross-protocol projection.

### Exactly-once side effects

Polling, fallback, retries and protocol translation must not duplicate provider-side execution where an accepted profile claims exactly-once behavior. C5/C7 and the independent black-box proofs provide bounded positive evidence; C8 provides the accepted bounded cross-protocol negative matrix with zero unauthorized remote execution and exactly-one valid execution assertions.

### Network scale

Class C and Class D-100 are accepted bounded network gates. D-1000 is not accepted until one exact pinned 20×50 campaign satisfies all evaluator/terminal/safety/routing/recovery/cleanup predicates. Current main includes bounded D-200 diagnostic/remediation work from PRs `#417` and `#418` plus the bounded packet-partition diagnostic patcher from PR `#419`; later one-shot launcher cleanup does not change those diagnostic sources. A preflight PASS, diagnostic success or successful cleanup cannot substitute for D-1000 campaign acceptance.

### Trustability

Cryptographic identity/integrity and truth/trust are different. Trustability is claim/context/policy dependent and may use provenance, independent evidence, freshness, revocation and receipts.

### Governance

Repository permissions, infrastructure operation and commercial ownership do not define protocol governance. Current governance is G1 public-process/bootstrap Founding Stewardship; later neutral-governance stages must be demonstrated, not declared.

## Implementation ownership map

```text
core/                 identity, protocol-independent domain/security logic
network/              QUIC, sessions, Kademlia, routing, relay, NAT/testnet
node/                  TRUYN node composition
runtime/               executable provider/relay composition
adapters/mcp/          MCP server/client protocol edge
adapters/a2a/          A2A server/client/task/artifact protocol edge
adapters/providers/    concrete/imported provider adapters
sdk/                   five-language first-party developer clients
trust/                 Trustability runtime components
storage/               persistent state/objects/index/cache
spec/ + proto/         normative semantics + machine wire schema
```

A2A directories are implemented owners now; they are not future placeholders.

## SDK / DX ownership

First-party SDKs consume TRUYN contracts; they do not bypass provider security or redefine the protocol. The Developer Release Layer is source/build complete on current main across TypeScript/JavaScript, Python, Go, Java and C#/.NET.

The accepted bounded SDK/DX contract includes:

- local Ed25519 identity creation and TRUYN envelope signing/verification;
- authenticated relay registration/session use;
- authorization-aware discovery;
- `OFFER`, `NEED` and correlated `RESULT` flows;
- requester-owned **direct NEED cancellation** through signed `REVOKE`, with ownership/late-output guarantees established by dedicated runtime negatives rather than the five-language E2E alone;
- authenticated relay/event streaming;
- signed generic ordered `PARTIAL` streaming with strict correlation/order/backpressure/terminal semantics;
- portable reference-oriented object/artifact payloads;
- default-off Agent Descriptor startup serving plus five-language canonical valid-profile HTTP fetch/schema/expiry/identity-signature/protocol-interface verification;
- one executable five-language E2E conformance gate using a canonical valid signed Descriptor fixture;
- per-commit npm/PyPI/Go/Maven/NuGet package builds with exact source SHA, byte size and SHA-256 provenance;
- explicit compatibility/deprecation/migration policy.

These implementation facts do **not** imply that `TRUYN/1` is stable, that packages are publicly published, or that the public developer site is live. The current provider runtime does not yet refresh/re-sign a served Descriptor before expiry; complete malformed/missing `interfaces[].endpoint` rejection parity across all clients remains open; generated-package verification does not content-scan every archived member; and ordinary CI artifacts under fixed alpha coordinates are per-commit verification artifacts rather than immutable tagged releases. Native registry publication and live-site activation/liveness remain separate release/evidence gates. Chain-stage cancellation, a standardized universal tokenizer/token-ID convention and delegated Descriptor-signing keys remain outside the accepted alpha contract.

## Public/private operations boundary

Public documentation/code/evidence may describe generic architecture and sanitized accepted results. Never commit private keys, provider secrets, secret-bearing URLs, private privileged topology/origins, customer data or sensitive live account/quota information.

## Status update discipline

A change that materially advances an accepted subsystem should update the relevant current-status documents in the same release window. At minimum:

1. `IMPLEMENTATION_STATUS.md` must reflect the new factual state;
2. `ROADMAP.md` must close/open the corresponding gate;
3. compatibility documents must stop calling merged behavior “planned”;
4. public README/index/quickstart/security wording must not contradict canonical status;
5. historical benchmark/changelog/acceptance records remain immutable unless correcting factual errors in those records.

This synchronization rule is specifically intended to prevent the C3→C8, Developer Release and D-1000 documentation drift seen in earlier snapshots.
