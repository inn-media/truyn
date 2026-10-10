# H/CHAOS-FUZZ — Final benchmark result

Status: **PASS / CLOSED**  
Closed: **2026-10-10**  
Series: **H**  
Benchmark: **H-CHAOS-FUZZ**

This is the sanitized public result for the frozen H/CHAOS-FUZZ campaign.

## Accepted bounded claim

Across the frozen **140-case isolated product-facing** H/CHAOS-FUZZ Attempt 1 campaign, TRUYN completed all planned cases with:

- **0 critical safety-invariant violations**;
- **0 open HIGH/CRITICAL failure modes**;
- **0 invariant failures**;
- **0 safety violations**;
- **100% recovery rate**;
- **0 paid-provider calls**;
- **$0 measured provider spend**;
- **0 shared mutable fault targets**.

This result is bounded to isolated product-facing core robustness. It does **not** claim physical WAN fault coverage, physical shared-storage fault coverage, paid-provider fault execution or destructive shared-infrastructure chaos.

## Immutable execution identity

- workflow run: `38036951794`
- launch SHA: `b49634b98f2627c1e8f5c8bbdff8776658af1f47`
- frozen candidate SHA: `9d363977e0e7842302e16150a43558b845d5e3b0`
- measured artifact ID: `11664587004`
- measured artifact digest: `sha256:3b9a605f70d174f7996f164f11a0c16caf239fb9351ce4447e20f81b2b561fab`
- reconciled artifact ID: `11664253633`
- reconciled artifact digest: `sha256:3a099b59221f2041a3e21cbc7f558d1b8f7da989ad579952c931b5dac76a472f`
- final reconciliation: **PASS_RECONCILED**

## Frozen public runtime

The private runner consumed an approved immutable released runtime rather than mutable public source:

- source SHA: `5e0a0cc5615d9a50ba43ed95c7990a32135ed8cc`
- methodology blob SHA: `91612a6fe639da472686d93f3dd396f0da7716cc`
- release tag: `a-soak-wan-runtime-5e0a0cc5615d9a50ba43ed95c7990a32135ed8cc`
- asset: `truyn-a-soak-wan-runtime.tgz`
- asset SHA-256: `0baaeb0c384f6fdb2e69a47b737ed27b20c06708ed568d5e8c2f338615380525`

## Campaign coverage

Attempt 1 executed **140 / 140 cases** with exactly **28 cases per declared fault class**:

| Fault class | Completed |
| --- | ---: |
| protocol | 28 |
| provider | 28 |
| identity_auth | 28 |
| timing_network_storage | 28 |
| trust_provenance | 28 |

The campaign was deterministic and seed-committed before measured execution. The hidden seed itself remains private.

## Reconciliation

Independent reconciliation recomputed the final result from immutable case-result evidence and verified every required gate:

- exact public SHA: PASS
- acceptance digest: PASS
- profile digest: PASS
- seed commitment: PASS
- complete cases: PASS
- class coverage: PASS
- critical safety: PASS
- open HIGH/CRITICAL: PASS
- zero-paid: PASS
- zero shared mutation: PASS
- safety counters: PASS
- product-facing execution: PASS
- claim boundary: PASS

Final status: **PASS_RECONCILED**  
Claim eligible: **true**

## Artifact integrity

Artifact-internal checksums:

- `telemetry.jsonl`: `sha256:c1f58457180542836538ee1bb1d2e4a476ba22947150e58e0f9559fed371e52c`
- `case-results.jsonl`: `sha256:04f5632b33ab3d71b8811466c46135f2c4d9d3d30ef263d1256a1e0bbae77b43`
- `summary.json`: `sha256:6bfad2c5997a2e493a2e0040acfffaf3b3004965e2beacb97eb4fe5b301180c6`

Raw security-sensitive fuzz inputs, hidden seed material and private operational traces are intentionally not published.

## Interpretation

The accepted result supports a narrow robustness statement:

> Under the frozen isolated product-facing H/CHAOS-FUZZ profile, TRUYN preserved its declared safety invariants across all 140 deterministic adversarial/fault cases spanning protocol, provider, identity/auth, timing/network/storage simulation, and trust/provenance classes, with no open HIGH/CRITICAL failure mode after independent reconciliation.

It does not establish physical WAN/storage chaos resilience. Such a claim requires a separately frozen shared-infrastructure campaign with the appropriate exclusive R2 lease and physical fault targets.

## H-Series terminal state

With CHAOS-FUZZ accepted, all four H final lanes are now closed:

- H/CACHE-COMPOUND — PASS / CLOSED
- H/SECOND-OPINION — PASS / CLOSED
- H/ARBITRAGE — PASS / CLOSED
- H/CHAOS-FUZZ — PASS / CLOSED

**H-Series = 4/4 PASS / CLOSED.**

Ordinary rerun is not required. Any future CHAOS campaign must use a new versioned methodology/claim scope and immutable successor identity.
