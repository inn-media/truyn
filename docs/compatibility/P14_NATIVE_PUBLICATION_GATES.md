# Native lifecycle successor: explicit publication gates

Status: prepared, not activated. This document is not registry publication evidence or Stable TRUYN/1 admission.

The five new native-lifecycle versions are npm `0.1.0-alpha.6`, Python `0.1.0a3`, Go `v0.1.0-alpha.3`, Maven `0.1.0-alpha.3`, NuGet `0.1.0-alpha.3`. Earlier public versions remain immutable and accepted in their original bounded scope.

The existing `wire-freeze-release-request.yml` controller supports an explicit single-file request at `.github/wire-freeze/native-lifecycle-release-request.json`. The request must name its exact parent SHA, match the fixed target versions, forbid production/cloud/Mainnet authority and require independent complete CI, hosted CodeQL, immutable new tags and native package evidence. It is accepted only as a first-attempt main push. No activation request is supplied by this implementation change.

Before any tag mutation, the controller downloads the exact successful main-push SDK bundle. `sdk/release/native-publication.mjs` recomputes the actual five archive hashes, source/run/tree binding, build and raw lifecycle hashes, and exact report contents. All 80 native lifecycle cells, 30 security cases and 10 generation-mismatch probes must pass. A PR proof, missing scenario, modified bytes, stale source or synthetic aggregate PASS cannot substitute for this evidence. The validator never publishes anything itself.

Only after these checks are new immutable tags created and the existing protected npm/PyPI/Maven/NuGet publishers explicitly dispatched. The Go version is a separately pinned immutable module tag. Publisher jobs retain their exact-main and public registry byte/provenance/signature/clean-room checks. `publish-npm.yml` permits tag dispatch without incorrectly attempting its main-only bootstrap job.

A partial or ambiguous publication is reconciled against the original tag/source before any retry. Tags and existing registry versions are never overwritten. Main movement before a required exact-main operation aborts it rather than silently selecting new bytes. Dispatch success is not registry acceptance.

The full published-successor lifecycle matrix must then be rerun using independently fetched successor packages. P14 remains NOT_ADMITTED until registry proofs, native lifecycle results and all remaining P1-P13 requirements, including applicable durable provider-effect/restart/replica checks, are independently reconciled. P13-OPS remains separate; this controller performs no Azure deployment, inference or traffic cutover.
