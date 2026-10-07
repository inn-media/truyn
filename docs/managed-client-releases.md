# Managed client release artifacts

TRUYN publishes the public managed-client SDK surface as four platform-labelled, exact-source artifacts for Windows, macOS, Linux and Android. These bundles contain only the public SDK and public contract metadata; private managed-service business logic remains outside this repository.

Each release contains `manifest.json`, one `.tgz` per supported platform and a matching `.tgz.sha256` file. The manifest records the exact source commit, SDK version, `truyn.managed-auth-device/v1` contract and every artifact digest.

The canonical allowlisted `.github/workflows/ci.yml` builds the platform artifacts, rebuilds them to prove reproducibility, verifies the four-platform set and SHA-256 sidecars, and uploads the qualified candidate. The default branch deliberately remains free of publication triggers and extra privileged workflows.

Publication uses a task-scoped release branch containing a temporary, explicit `workflow_dispatch` publisher. That publisher checks out the qualified exact `main` SHA, rebuilds and verifies the same assets, refuses duplicate tags, and publishes a GitHub Release whose tag and manifest bind all artifacts to that exact source SHA. The publication workflow is never merged to the public default branch.
