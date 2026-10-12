# P13-FORMAT exact five-SDK prerelease qualification

This is a **bounded signed NEED/RESULT compatibility subgate**, not overall Stable TRUYN/1 admission. It is not a production migration or cloud deployment.

## Immutable inputs

The original accepted source is `57971b134a41c3e3ea4b42f68e86a7d117036006`. The original release run is [38154701595](https://github.com/inn-media/truyn/actions/runs/38154701595), SDK bundle artifact ID `11707393965`. Its downloaded ZIP SHA-256 is `38d7afe7ad6611fc0635cc17cfa68ee2a23a62a0b75c70d3059483a143cda72e`; its manifest SHA-256 is `8435a542084d1ea008ac703b6db7d781baca568f361da231b1b078884d0e8ce9`. Every packaged byte count and SHA-256 in that manifest was checked against the archive before deriving `spec/compatibility/truyn1-five-sdk-digests.json`.

The existing five-coordinate manifest remains `spec/compatibility/truyn1-five-sdk-freeze.json`: npm alpha.5, PyPI a2, Go/Maven/NuGet alpha.2. Historical Developer Release packages remain independently tested by the legacy workflow.

## Binding rules

The workflow checks out `${{ github.event.pull_request.head.sha || github.sha }}` explicitly and verifies `git rev-parse HEAD` against that expected SHA. Each receipt binds actual source SHA/tree, run ID/attempt, pin-manifest digest, package coordinate and observed archive SHA-256. The final report requires exactly all 20 unique language/provider-version/requester-version cases and five matching receipts from the same execution. Stale, cross-SHA, missing, duplicate or failed evidence is rejected.

The PR and selective main-push runs are separate qualifications. Neither the old default PR merge checkout nor a previous green main supplies exact-head evidence for another revision.

## Package verification

- npm tarball, PyPI wheel and Maven JAR must match the frozen package archive byte count and SHA-256 before installation/compilation.
- Go proxy ZIP payload must contain exactly the ten frozen module files with unchanged file digests and the correct versioned module prefix. A Go ZIP is not incorrectly equated with the original release tar.gz.
- NuGet signing changes the ZIP envelope. `dotnet nuget verify --all` validates its signature; the verifier separately binds every frozen DLL, XML, nuspec, license, notice and README. Only the enumerated signing/package-envelope members may differ, and unexpected payload files fail closed. The report labels this as payload identity, never as equality of the signed and unsigned ZIP archives.

The Python verifier has eight executable positive/negative tests, also invoked by ordinary Node CI. It rejects wrong package bytes, altered or added Go source, changed or injected NuGet DLLs, traversal/symlink entries, incomplete or duplicated matrices, cross-source receipts and duplicate JSON keys. The artifact includes all five receipts, raw matrix output and the resulting source-bound report.

## Acceptance and limits

A green result closes only this exact-revision prerelease 20-case NEED/RESULT subgate after independent post-merge evidence verification. Full cross-version cancellation/streaming/replay semantics, remaining P6-P9 requirements, P13-FORMAT stable release admission and P14 still require their own evidence. Nothing here publishes new packages, changes a production provider, or declares Stable TRUYN/1. A green workflow is not a release-admission credential.
