# G5 Durable Direct Lifecycle SDK Conformance Boundary

This addition links the public TRUYN/1 SDK conformance program to issue [#990](https://github.com/inn-media/truyn/issues/990) and PR #996.

The five existing SDK languages (TypeScript/JavaScript, Python, Go, Java, C#/.NET) continue using exactly the accepted signed NEED/RESULT/REVOKE and compact PARTIAL semantics and their existing five-language executable E2E harness. The transport-neutral durability adapter is a **relay/provider local runtime**, not a new mandatory SDK wire message, field, signing domain or sixth envelope type.

The exact-SHA `sdk-release`, `full-qualification`, legacy wire freeze and `test:component` / `test:regression` suites MUST remain GREEN. The new `tests/g5-durable-lifecycle-ledger.test.js` exercises cross-process SQLite uniqueness, provider effect-fence hard-stop, late terminal rejection, offer tombstones and restart of two local relay instances. It is **not** a substitute for remote cross-host cluster fault injection.

**Unqualified, must remain G5 OPEN:** actual cross-host distributed backend, transport-independent durable event delivery, provider-side idempotency key propagation/settlement reconciliation, kill-9 and split-brain partition tests under real infrastructure, five-SDK end-to-end against that infrastructure, immutable admission evidence. Do not silently reinterpret at-most-once *attempt* as exactly-once completed *effect*.
