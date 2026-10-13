# TRUYN/1 CORE: exact 11-surface functional qualification

**Task:** [#1094](https://github.com/inn-media/truyn/issues/1094). **Result scope: bounded source certification; full five-SDK physical parity remains BLOCKED.** This document does not authorize Stable TRUYN/1, five stable SDK releases, private consumers, paid inference or production cutover.

## Executed native and network evidence

The existing exact frozen-package workflow downloads and verifies **five immutable published SDK releases** independently. It then builds the new five source SDKs, executes all 20 published/source NEED→RESULT combinations, four version-pair lifecycle scenarios per language, five source-native direct compact PARTIAL/NEED/RESULT lifecycles and **six native negative security cases per language**. Actual signers/verifiers and native SDK public client paths are used; TypeScript's own public bundled runtime is its signing path, not a replacement signer for Go/Java/.NET.

After these checks, `sdk/conformance/core-registry/qualify-physical-surfaces.mjs` runs a separate **real Node QUIC/UDP 5-method control test**, then verifies frozen package digest, native lifecycle raw evidence digest, exact source SHA, source tree, Actions run ID/attempt/event, five candidate native capabilities, P11-style unsupported-generation refusal, bounded source lifecycle and all 30 native negative cases. Missing, duplicate, failed, cross-run and forged PASS evidence fails the qualification.

The immutable uploaded artifact contains `core-11-physical-five-sdk-qualification.json` with **55 cells = 11 CORE operations × 5 languages**, plus four published/source combinations where native compact events were actually observed. Its output is **`INVENTORY_COMPLETE_STABLE_BLOCKED`**, not release admission.

## Actual per-operation acceptance

| Registry CODE | Wire surface | JavaScript network/runtime | Five SDK source-native evidence | Stable SDK |
| --- | --- | --- | --- | --- |
| `21000000` PING | QUIC `dht.ping` | Local authenticated control test | no native five-SDK QUIC API | BLOCKED |
| `22000000` FIND_NODE | QUIC `dht.find-node` | Local verified discovery | no native five-SDK QUIC API | BLOCKED |
| `23000000` ANNOUNCE | QUIC `peer.announce` | Local signed peer advertisement | no native five-SDK QUIC API | BLOCKED |
| `24000000` STORE | QUIC `dht.store` | Local signed record store | no native five-SDK QUIC API | BLOCKED |
| `25000000` FIND_VALUE | QUIC `dht.find-value` | Local verified value read | no native five-SDK QUIC API | BLOCKED |
| `41000000` C_NEED | signed compact N | Genuine local relay/SDK NEED, signature, identity and owner checks | **bounded source native PASS ×5** | Pending P13/other gates |
| `42000000` C_RESULT | signed compact R | Actual terminal RESULT and duplicate/cancel negatives | **bounded source native PASS ×5** | Pending P13/other gates |
| `43000000` PARTIAL | signed compact T | Native sequence/backpressure/foreign/tampered/cancelled output negatives | **bounded source native PASS ×5** | Pending P13/other gates |
| `44000000` CHAIN | signed compact C | Existing network composition, no matching five-language native client coverage | Unsupported five-SDK native path | BLOCKED |
| `45000000` CONTEXT_PUT | signed compact P | Existing context network path, no matching five-language native client coverage | Unsupported five-SDK native path | BLOCKED |
| `46000000` CONTEXT_DELTA | signed compact D | Existing context network path, no matching five-language native client coverage | Unsupported five-SDK native path | BLOCKED |

**Per-language matrix:** 15/55 bounded native compact PASS (N/R/T × five SDKs), 40/55 **BLOCKED** (five QUIC controls + C/P/D compact × five SDKs). This does not downgrade the already accepted older/partial lifecycle evidence; it separates actual native test scope from missing APIs. A clean-room built source version is not automatically a published stable package.

## Missing work for honest full release admission

1. Provide versioned, authenticated, portable QUIC/DHT transport and client operations for TypeScript, Python, Go, Java and .NET; prove positive/negative signed peer and record traffic end-to-end, not only via Node's network runtime.
2. Add safely negotiated native compact CHAIN/CONTEXT_PUT/CONTEXT_DELTA operations with real signed wire exchange and failure/replay/authority negatives in all five languages. Preserve six existing compact codes; do not invent additional top-level Envelope kinds.
3. Verify per-code required/optional semantic negotiation and fail-closed refusal before side effects, old↔new five-SDK *released* binaries, stable package digest/provenance and exact release SHA.
4. Reconcile P11/P12/P13-FORMAT, distributed P6–P9/G5, G4 Wire freeze and P14 independently on the final committed release. Independently re-run on merged main and retain non-success artifacts.

The native/Node runtime test asserts only what it executes. It cannot be called QUIC five-language conformance until all five SDKs expose and execute the actual transport; `core-registry/run.mjs --stable` remains fail closed.
