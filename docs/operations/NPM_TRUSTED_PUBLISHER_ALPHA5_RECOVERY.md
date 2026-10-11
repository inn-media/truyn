# npm Trusted Publishing recovery: immutable @truyn/sdk alpha.5

## Authority and scope

This procedure repairs only the public npm coordinate `@truyn/sdk@0.1.0-alpha.5`. The package already exists at older versions. Frozen source: `57971b134a41c3e3ea4b42f68e86a7d117036006`. Accepted CI release artifact: run `38154701595`. Hosted CodeQL: `38154701311`. Failed publication attempt: `38164044619` (GitHub OIDC token issued, npm exchange returned HTTP 404; the npm publish step never ran).

Do not rebuild the package, edit any release tags, swap to a legacy npm token, or unblock private digest pin/canary or WAN admission based on CI alone.

## One account-owner action on npmjs.com

Log into the `truyn` npm account with package settings permissions; visit https://www.npmjs.com/package/@truyn/sdk, click **Settings**, locate **Trusted Publishing**, and inspect or add the GitHub Actions trusted publisher:

| Field | Required exact value |
| --- | --- |
| npm package | `@truyn/sdk` |
| Provider | GitHub Actions |
| Organization / owner | `inn-media` |
| Repository | `truyn` |
| Workflow filename | `publish-npm.yml` |
| GitHub Actions environment | `sdk-release` |
| Permission | Allow publish |

The published versions alpha.1/alpha.2 prove package ownership only, not the current Trusted Publisher binding. Do not remove a working trusted publisher configuration unless its exact fields are confirmed incorrect. If an existing connection is wrong, take its settings snapshot and replace only that connection after owner approval. Never share npm tokens, passwords or OIDC JWTs in an issue, PR or chat.

Alternatively, using the npm CLI authenticated as a package owner, verify with `npm trust list @truyn/sdk --json`; npm 11+ supports `npm trust github @truyn/sdk --repo inn-media/truyn --file publish-npm.yml --env sdk-release --allow-publish` and may require npm 2FA. The UI is preferable for a single package.

## Controlled publication after npm configuration is verified

1. Merge the exact-qualified workflow change containing `retry_existing_frozen` after CI and hosted CodeQL are GREEN. This change only adds a safe manual retry; it does not publish by merging.
2. At https://github.com/inn-media/truyn/actions/workflows/publish-npm.yml choose **Run workflow**, branch **main**.
3. Set `release_tag` to `sdk/npm/v0.1.0-alpha.5`, check `retry_existing_frozen`, then start **one** run under the existing protected `sdk-release` environment. Do not rerun a previous run; record the new run ID.
4. Workflow confirms exact current main, fixed immutable tag -> frozen source SHA, version and source provenance; consumes the already built CI tarball. OIDC exchange must return 201, then npm publishes once with provenance.
5. Require verified public registry artifact bytes, dist-tag `alpha`, public attestation, signature audit and clean-room import. If any step fails, keep `npm=RED`; preserve the run and perform exact-root-cause repair instead of dispatching again.
6. Run the independent five-registry audit in private repo `inn-media/truyn-platform` PR #462. Only after all accepted registry proof gates PASS can its digest pin/shadow staging be considered. WAN admission is a separate real-world gate.

`@truyn/sdk@0.1.0-alpha.5` is **NOT** declared published merely because this document or workflow lands on main.

## Failure codes

- `NPM_GITHUB_OIDC_ERROR_HTTP_*`: cannot fetch GitHub Actions identity token.
- `NPM_TRUSTED_PUBLISHER_EXCHANGE_REJECTED_HTTP_404`: npm rejected the scoped OIDC exchange (often an absent/mismatched trust binding, but possibly another npm-side rejection).
- `NPM_TRUSTED_PUBLISHER_GITHUB_OIDC_EXCHANGE=PASS`: npm issued the ephemeral scoped token, not proof of completed publication.
- Only final public package bytes + attestation + clean-room verification = npm registry PASS.
