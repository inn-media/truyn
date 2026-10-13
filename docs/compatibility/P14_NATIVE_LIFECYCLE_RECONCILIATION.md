# P14: native five-SDK lifecycle and successor reconciliation

**Status: source qualification in progress; Stable TRUYN/1 NOT declared.** P13-OPS, Stable Service and Mainnet are independently gated.

The native peer matrix invokes the actual TypeScript, Python, Go, Java and .NET SDK identity/signing/verification code against a real loopback relay. Terminal replay, requester cancellation, owner OFFER withdrawal and PARTIAL ordering/backpressure run in all four published/source provider/requester combinations: 80 explicit cells plus ten unsupported-generation registration probes. Replay resends the original SDK-signed body, never a replacement JavaScript signature for another language.

## Implementation repair and immutable predecessor boundary

The old Wire Freeze set remains npm `0.1.0-alpha.5`, Python `0.1.0a2`, Go `v0.1.0-alpha.2`, Maven/NuGet `0.1.0-alpha.2`, frozen at source `57971b134a41c3e3ea4b42f68e86a7d117036006`. Python's published local client has no network cancellation/withdrawal API. Python/Go/Java/.NET lack the published compact lifecycle API. The baseline run `38233419678` therefore honestly produced 56 PASS / 24 BLOCKED.

The successor adds native compact NEED, PARTIAL, RESULT and locally verified compact polling to Python, Go, Java and .NET, and signed requester cancellation/OFFER withdrawal to Python. Each client uses its own existing Ed25519 identity and TCJ1 `[code,id,payload]` signature domain. Public optional APIs in the drivers allow old packages to remain intact; no private-key reflection or cross-language signing substitution is used.

At source `5fde89fd7c15b2841af22fe64994d7107587caba`, run `38239307404` passed all twenty candidate/candidate lifecycle cells and thirty native hostile-response/security cases. The overall old/new matrix recorded 64 PASS / 16 BLOCKED. Artifact `11741798878`, ZIP SHA-256 `e662dad5889d2be167c7b6a78006de2efb728c2d49bcc08c3d1254f7ac6033af`, was independently downloaded and reconciled. This is a source-only checkpoint, not final CI/release admission; prior CI failure remains historical and must be repaired/requalified on the successor exact SHA.

## Mandatory native security and exact-source evidence

Six cases per language cover foreign PARTIAL refusal, late PARTIAL/RESULT after cancellation, signed-payload tampering, signature corruption, outer event-kind substitution and signer substitution. Valid signed positive controls follow hostile events. The strict report rejects missing/duplicate cells, false PASS, cross-SHA data and absent native methods.

`sdk/conformance/lifecycle-peer/qualify-successor.mjs` requires twenty source lifecycle cells and thirty native security cases, records actual source SHA/tree/run/attempt/event and hashes the raw report. Existing frozen-package byte checks and twenty published/source NEED/RESULT exchanges remain independently required. A historical unsupported API can remain BLOCKED, but a missing successor implementation cannot.

## Publication and final admission

`sdk/release/native-successor-candidate.json` identifies an unpublished new-version build, not a publication authority. `sdk/release/public-coordinates.json` continues to identify the independently accepted public predecessor release. Distinct successor bytes may never overwrite an existing version. The documentation guard checks both inventories independently.

Final P14 requires actual versioned successor package publication/provenance/digests and native lifecycle proofs at one accepted release SHA, remaining durable P6-P9 provider-effect/restart/replica requirements in issue #990, P11 required-semantic checks, P13-FORMAT and all other applicable P1-P13 gates. Loopback/mocked tests do not prove real cloud failover or arbitrary provider-side exactly-once. No stable flag, deprecation window, wire kind, production resource or historical evidence is weakened by this change.
