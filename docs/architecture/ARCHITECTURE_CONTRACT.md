# TRUYN Architecture Contract

This document prevents architecture, implementation status, public documentation, governance and benchmark evidence from silently diverging.

**Snapshot:** 2026-08-27  
**Synchronized source:** `main@63e54cbe30d363ef4609732b512fe64ab860cf9d`

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
- both in-repository A2A↔TRUYN↔MCP round trips (C7).

C8 complete adversarial acceptance remains open in PR `#369`. Independent external A2A/MCP reference-SDK interoperability and stable compatibility remain later adoption/stability gates.

### Artifact integrity

Content/reference translation cannot silently weaken integrity. C6 requires bounded sizes, digest/byte-size/canonical encoding checks, no implicit URL resolution/SSRF and authoritative TRUYN provenance before successful cross-protocol projection.

### Exactly-once side effects

Polling, fallback, retries and protocol translation must not duplicate provider-side execution where an accepted profile claims exactly-once behavior. C5/C7 provide bounded positive proof; C8 owns the complete negative matrix.

### Network scale

Class C and Class D-100 are accepted bounded network gates. D-1000 is not accepted until one exact pinned 20×50 campaign satisfies all evaluator/terminal/safety/routing/recovery/cleanup predicates. A preflight PASS or successful cleanup cannot substitute for campaign acceptance.

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
sdk/                   first-party developer clients
trust/                 Trustability runtime components
storage/               persistent state/objects/index/cache
spec/ + proto/         normative semantics + machine wire schema
```

A2A directories are implemented owners now; they are not future placeholders.

## SDK / DX ownership

First-party SDKs consume TRUYN contracts; they do not bypass provider security or redefine the protocol. Current main includes TypeScript/JavaScript and Python reference clients and the merged DX-3 bounded runtime developer surface. Remote provider-side NEED cancellation, token-delta streaming, Go/Java/.NET parity and stable package/release compatibility remain incomplete.

## Public/private operations boundary

Public documentation/code/evidence may describe generic architecture and sanitized accepted results. Never commit private keys, provider secrets, secret-bearing URLs, private privileged topology/origins, customer data or sensitive live account/quota information.

## Status update discipline

A change that materially advances an accepted subsystem should update the relevant current-status documents in the same release window. At minimum:

1. `IMPLEMENTATION_STATUS.md` must reflect the new factual state;
2. `ROADMAP.md` must close/open the corresponding gate;
3. compatibility documents must stop calling merged behavior “planned”;
4. public README/index wording must not contradict canonical status;
5. historical benchmark/changelog records remain immutable unless correcting factual errors in those records.

This synchronization rule is specifically intended to prevent the C3→C7 and D-1000 documentation drift that existed before the 2026-08-27 sanitation pass.
