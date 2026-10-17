# TRUYN/1 Class C source-semantic review and release boundary

**Review state:** COMPLETE SOURCE-TO-ENGLISH COVERAGE AUDIT WITH DOCUMENTED NORMATIVE CONFLICTS. **RFC state:** READY FOR CLASS C DISCUSSION, not ACCEPTED and not Stable TRUYN/1.

## Verified immutable source identity

| Approved original | SHA-256 |
|---|---|
| CORE final | `591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121` |
| Non-CORE final | `c345631992e3e96f84e67dcf48a85c15281f5912ae1bfd131c5f904b9da46e72` |

The English documents and parity catalogues are derivative technical editions. They must carry independent digests, not the source hashes above. The original-language content is preserved outside the current English documentation tree and in immutable Git historical provenance only.

## Section-by-section semantic source coverage

| Source | Original section | English coverage | Semantic verification |
|---|---|---|---|
| CORE | §1 Frozen model, eight invariants | CORE final English, taxonomy and security sections | Eight design obligations retained, no hidden new core type |
| CORE | §2 Eleven physical form distinctions | CORE English plus CORE 80-row fidelity and this review | Existing session ACCEPT, QUIC, compact, error and object distinctions retained |
| CORE | §3.1 Ten Envelope field contracts | CORE English and existing normative envelope.md | Frozen eight required fields, optional to/ext and unknown-field signing preserved |
| CORE | §3.2 TCJ1, ECMAScript numbers and known SDK gaps | CORE English and G4 workstream | Explicitly retain known historical SDK defects as proposed repairs, not proven PASS |
| CORE | §3.3 ext/1 security and staged negotiation | CORE English, ENVELOPE_EXT companion/source | Negotiated-only strictness, default off, no authority or silent downgrade |
| CORE | §3.4 Twenty TCJ1 and E1–E3 signed vector requirements | CORE English, G4 conformance scope | Preserve 20+3 and negatives, .NET native verification and signed raw bytes |
| CORE | §4 Error, lifecycle, authority and trust | CORE English, 80-row fidelity and current errors/lifecycle | No alias rewrite, no duplicate charged effect, fail closed |
| CORE | §5 Full 80 entry registry | CORE_SOURCE_PARITY_EN.md | All 80 CODE/name matches; 41 Short alias mismatches disclosed |
| CORE | §6 Twelve explicit architectural resolutions | CORE final English and current review | WELCOME/ACCEPT, STATUS/STATE, EVENT/BID and TTL distinctions retained |
| CORE | §7 Public/private repo ownership | CORE English and language policy | No private source import, immutable release consumption |
| CORE | §8 Nine implementation/admission steps | CORE English release sequence | Separate RFC and exact-SHA gates; no prematurely stable protocol |
| Non-CORE | §1 Classification and admission rationale | EXTENSIONS English and current review | Complete taxonomy; proposals are not network support |
| Non-CORE | §2 Fifteen conflict resolutions | Conflict matrix below | No dilution of safety, lifecycle or payment boundaries |
| Non-CORE | §3 Per-extension admission template | EXTENSIONS English | All listed schema, conformance, feature flag and digest requirements |
| Non-CORE | §4 Fourteen candidates and open issues | EXTENSIONS English and candidate review below | Ten EXTENSION plus four PROFILE; open issues retained |
| Non-CORE | §5 111 COMPOSED rows A–K | COMPOSED_SOURCE_PARITY_EN.md | Exact 111 names and forms; descriptions/methods translated individually |
| Non-CORE | §6 COMPOSED vs underlying CORE support | COMPOSED_SOURCE_PARITY_EN.md | No fictional implementation of draft CORE features |
| Non-CORE | §7 Both repos / evidence sanitation | EXTENSIONS English and language policy | Protected immutable evidence and private authority |
| Non-CORE | §8 Admission and acceptance | EXTENSIONS English and review below | Old/new pairs, five SDKs, canary and separate Stable/Mainnet |

## All fifteen source conflict resolutions

| Conflict | Binding original decision rendered in English |
|---|---|
| Full CORE obligation vs legacy clients | Keep all CORE registry semantics as target conformance; old binaries only owe their frozen supported profiles, not new handlers |
| EVENT extension vs SUBSCRIBE core | SUBSCRIBE stays CORE; EVENT is experimental opt-in delivery. No at-least-once claim before durable offset, acknowledgement and replay conformance |
| RETRIEVE vs existing GET/context | Existing verified HTTP/context CID read remains. Optional RETRIEVE requires independent holder/requester access enforcement and digest checks |
| DISCONNECT vs QUIC retire | Preserve existing retire and draining semantics and in-flight timeout behavior; new soft drain only advisory |
| PAUSE/RESUME vs NEED deadline | Requester-owned coordination; accepted deadline continues unless separately signed and authorized amendment; no implicit additional budget |
| DELEGATE/HANDOFF vs exactly-once | Least-privilege scoped grants and consent as appropriate; original executor remains owner before atomic accept/fencing; no double execution |
| Application LEASE vs DHT/cloud lease | Application resource ownership is distinct from signed DHT TTL, Azure lease and private entitlement; fencing and expiry domain scoped |
| DELETE vs immutable evidence | Only authorized erasable data at holder may be deleted; preserve receipts, audits and benchmarks; redact protected data and preserve tombstones where allowed |
| BID vs CONTRACT/ORDER | BID is optional quoted commercial price, not proof of payment/rights; CONTRACT/ORDER remain CORE semantic registry and separately gated |
| TIME_SYNC vs signature freshness | Clock offset estimates are advisory; local secure signing freshness and acceptance-window checks remain mandatory |
| SENSOR_DATA vs signed envelope | Optional high-rate signed batching needs independent profile; cannot steal reserved compact identifiers or bypass identity/integrity/billing |
| SAFE_STOP vs physical safety | Never promise guaranteed delivery, hard real time or trusted stop over WAN; enforce authorization at receive and independent hardware interlocks |
| ALARM independent lifecycle | Alarm state is versioned, idempotent, acknowledgement requires policy; EVENT/STATE carriage is only as supported |
| ext crit vs required support | Strict crit checking only after negotiated truyn.envelope.ext/1; never assume legacy peer enforces critical semantics |
| Error/priority normalization | Preserve existing wire error tokens, queue behavior and compact forms; critical may still be shed by accepted fail-closed capacity rules |

## Fourteen candidates: source-specific unresolved questions preserved

| Candidate | Independent unresolved design questions / required limitations |
|---|---|
| DISCONNECT | Handling in-flight work beyond drainMs; existing retire semantics take precedence |
| PAUSE | Whether original deadline continues during pause and maximum duration; default contract says it does, absent separately authorized amendment |
| RESUME | Must not implicitly alter deadline/budget and must validate same requester and prior pause state |
| DELEGATE | Maximum delegation depth; requester visibility of subcontractor; grant chain provenance |
| HANDOFF | What requester is shown; atomic transfer acceptance, fencing and responsibility |
| RETRIEVE | Range/chunk resume and identity/tenant access to private objects |
| DELETE | Conflict with redact-not-delete evidence; single-holder limits and retention policy |
| EVENT | Delivery at-least-once and possible future CORE consideration, not admitted now |
| LEASE | Clock uncertainty, forced revocation and domain-scoped fencing |
| BID | Whether offer is binding until validUntil and how the quote is withdrawn |
| TIME_SYNC | Hardware timestamps and whether robotics profiles require support |
| SENSOR_DATA | Dedicated new compact symbol (not existing t values); sampling loss under load |
| SAFE_STOP | Which principal may request, how execution is independently acknowledged, and local non-network safety |
| ALARM | OPC UA Alarms & Conditions alignment and authorized alarm acknowledgement |

## Non-negotiable implementation and security acceptance

- No automatic new Envelope types, existing code renumbering, session wire rename, new compact t aliases, TCJ1 fallback signer, unsigned ext enforcement or provider entitlement through metadata.
- Conformance: 20 TCJ1 byte fixtures plus three signed E1/E2/E3 envelopes and negative ext tampering/crit/expiry/profile cases in actual Node, Python, Go, Java and .NET, with TypeScript accurately described as a Node-delegating client.
- Before wire changes: exact source SHA, CodeQL, DCO, security, complete CI, five published alpha SDK interop, legacy wire cases, QUIC/HTTP/fast/socket and private owned-provider authorization; no test thresholds weakened.
- Preserve all D/S/T/E/N/H/A benchmark evidence, rollback/readiness controls, and private/public isolation; opt-in canary can stop sending ext without weakening signatures.
- Cross-repo private consumption only after immutable public release identity/digest and independent private admission.
- No false production/Mainnet claims. Stable TRUYN/1 protocol needs independently admitted P1–P14 conformance and five immutable 1.0.0 SDK releases, not this documentation PR. Operational service and mainnet remain separate.
- No paid provider calls or production deployment to perform an editorial translation review.

## Open normative conflicts, not silent translation corrections

**C-ALIAS-01:** The approved original CORE table's documentary Short labels differ from the already frozen `spec/registry/truyn-core-v1.json` in **41/80** entries. Example: source A10/A20/B10/C10/D10 vs executable registry A1/A2/B1/C1/D1. Both identities must be preserved; deciding whether to introduce a documented translation/alias map is a separate normative decision, not an implicit modification to the 80 registry triples.

**C-ERROR-02:** Approved design-language OUTCOME classification includes `already_exists` and `internal`, whereas existing P10 stable 13 normalized identifiers include `conflict` and `internal_error`. `unavailable` is a reserved design semantic with no automatic addition to the existing P10 wire list. No bulk error rename is authorized. A future mapping must preserve existing codes and exact public responses.

**C-PROTO-03:** Draft/protobuf projection and conceptual ATTEST verdict labels must not replace implemented signed `support`, `contradict`, `uncertain`; preserve the old signing domain and use explicit versioned mapping only.

These are **design-source and deployed-contract reconciliation questions**; they do not by themselves disprove faithful English semantic coverage, but they DO prevent declaring wire freeze fully adopted or Stable v1 from this source translation.

## Class C status

The documentation is eligible for **Ready for Review** after exact-head CI and DCO, with these open questions in the public RFC discussion. A ready PR is NOT an accepted Class C proposal. Honor the full minimum **14 calendar days** of review and the applicable governance decision. Do not remove draft labels from TRUYN/1 Protocol/SDK, grant deployment approval or certify P1–P14 on this basis.
