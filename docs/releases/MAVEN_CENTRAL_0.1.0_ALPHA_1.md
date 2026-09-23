# Maven Central `0.1.0-alpha.1` accepted release

**Registry:** Maven Central  
**Coordinate:** `org.truyn:truyn-sdk:0.1.0-alpha.1`  
**Release tag:** `sdk/maven/v0.1.0-alpha.1`  
**Source SHA:** `6739b81bb8b2c9f4d8c07efb4298f12c9b85fa53`  
**CI run:** `35899556881`  
**CodeQL run:** `35899557154`  
**Publication run:** `35902114613`  
**Central deployment:** `ab9b0af8-37db-4ebe-8c0d-2f06f839765c`  
**Accepted:** 2026-09-23

## Acceptance result

`org.truyn:truyn-sdk:0.1.0-alpha.1` is an **accepted immutable public release**.

The publication run completed successfully and the Central Portal deployment reached `PUBLISHED`. The release was built from the exact Java bytes produced by the qualified CI run; the publication path did not rebuild the SDK artifact.

The following post-publication checks passed:

- exact public JAR byte identity against the CI artifact;
- published checksum verification;
- detached OpenPGP signature verification;
- public availability of the main JAR, sources JAR, javadoc JAR and POM;
- clean-room Maven resolution of `org.truyn:truyn-sdk:0.1.0-alpha.1`;
- clean-room class loading for `org.truyn.sdk.TruynClient` and `org.truyn.sdk.AgentDescriptors`.

The immutable Maven release tag resolves to the accepted source SHA above. This release must never be overwritten or repointed.

## Evidence boundary

The canonical GitHub Actions publication evidence artifact is attached to workflow run `35902114613` as `truyn-sdk-maven-central-35902114613`.

This document records Maven Central only. NuGet publication status is reconciled independently and must not be inferred from this Maven evidence.
