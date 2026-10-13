# P11 / P12 / P13-FORMAT exact release qualification

This procedure qualifies one exact source revision and its actual SDK archives. It does not declare Stable TRUYN/1, publish a package or authorize P13-OPS. Every mutation invalidates the prior candidate acceptance; pre-merge and merged-main executions remain separate evidence.

## Confirmed starting point

Source `2a2d47af6d37a4c25cf3049f7bbf020e77d91eab` passed full [CI 38418301639](https://github.com/inn-media/truyn/actions/runs/38418301639), seven-configuration [CodeQL 38418302364](https://github.com/inn-media/truyn/actions/runs/38418302364) and [published SDK interop 38418301549](https://github.com/inn-media/truyn/actions/runs/38418301549).

Both downloaded archives were independently SHA-256 checked: interop artifact `11824839637` = `99414bf9bff41ae209ed2e7c8772330dcda3216137614717fc843bb239166340`; SDK bundle `11825496332` = `7e3ae4d78431af3154359a4bc3117a29ab27ca5ec409f47fc361a05b0283379b`. Its native package proof passed 80 lifecycle, 30 hostile-response and 10 generation cases against the exact unpublished successor archives. Those packages have **not** been accepted as public registry releases.

The old-package 540-row diagnostic reported 348 PASS and 192 UNSUPPORTED; the separate native lifecycle report reported 64 PASS and 16 BLOCKED. These are different matrices. Neither is a full compatibility PASS and neither is reduced to the older 20 NEED/RESULT exchanges.

## P11 correction and native evidence

The four non-TypeScript clients previously accepted a registration token without checking an explicit negotiated version or semantics. TypeScript also needed complete-selection, unadvertised-semantics and token validation, plus preservation of normalized local negotiation errors.

The shared `sdk/conformance/v1/p11-registration-confirmation-fixtures.json` has 28 cases. Each of the five actual SDK clients sends a signed IDENTITY request to a controlled loopback response fixture. The fixture verifies the native signature and advertised protocols. The test checks actual acceptance and normalized refusal, with exactly one registration request per case. It covers the baseline, lower common baseline, fully legacy response, partial/malformed/null selection, unsafe and unsupported generations, unadvertised/duplicate semantics, and malformed tokens.

A fully absent legacy confirmation retains the TRUYN/1 baseline only. Once either selection field is supplied, both are mandatory; no unadvertised semantics may be granted. These clients implement TRUYN/1, so a synthetic advertised future generation is not an implemented transport. The frozen RC1 algorithm matrix remains unchanged.

`registration.json` contains 280 observations: 28 × five languages × old/new modes. All 140 source outcomes must pass. Historical package failures remain recorded as failures; published bytes are never patched. The packaged-successor gate requires **all 280** observations to pass against the new archives and source.

## P12 correction to acceptance evidence

The original bounded reference profile already has accepted merged-main evidence; see [P12 certification](TRUYN1_P12_OBJECT_ARTIFACT_CERTIFICATION.md). The new native matrix adds 20 signed artifact-reference roundtrips: five languages × old/old, old/new, new/old, new/new. It tests opaque reference preservation and zero automatic fetches; explicit byte verification and corrupt digest/size rejection use the reference runtime. Existing reference size, bounds, chunk, resolver, signed RESULT and adapter regressions remain mandatory.

## Exact source and package binding

`sdk/conformance/registration-peer/qualify.mjs` runs native registration, artifact exchanges and the named P11, P12 and P13 local-format/policy suites. The report binds SHA, tree, Actions run/attempt, original package proof, fixture, native reports and raw test-log digests. Missing/duplicated cases, no real request, wrong signatures, cross-SHA evidence and false PASS fail closed.

The frozen-published workflow runs this after independent installation and byte verification of the five accepted old packages. Full SDK CI also runs it in isolated installations of the **actual newly built archives**. These second reports are retained in the SDK release bundle as `native-package-registration.json`, `native-package-artifacts.json`, `native-package-format-qualification.json` and three raw TAP logs. The protected publication verifier checks them before any tag creation.

Head and post-merge acceptance requires complete CI/security/SDK/full-qualification, affirmative hosted CodeQL, actual report/ZIP digest verification, and a fresh main reread. A green collection workflow with historical failures is not a released-SDK compatibility certificate.

## P13-FORMAT remains release-admission pending

P11 and P12 source/package qualification cannot fill missing normative wire freeze or durable lifecycle evidence. The final stable protocol revision must first incorporate all applicable G4/G5 and P1–P14 changes, then receive exact-version publication provenance and a new old/new five-SDK matrix on that **same release SHA**. Existing public alpha packages and unpublished successor archives must not be relabeled as stable SDKs.

The 180-calendar-day stable deprecation policy and local identity/format rollback tests remain mandatory. P13-OPS is independent: no production migration, paid inference or cloud cutover is needed for this format qualification.
