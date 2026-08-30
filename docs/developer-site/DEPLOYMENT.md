# Developer site deployment

The checked-in developer portal is deployed as a static GitHub Pages site from the accepted `main` branch.

## Source and public origin

- repository: `inn-media/truyn`
- accepted branch: `main`
- site artifact source: `/docs`
- root entrypoint: `docs/index.html`
- portal: `docs/developer-site/index.html`
- static processing: `docs/.nojekyll`
- deployment workflow: `.github/workflows/deploy-developer-site.yml`
- default expected public origin: `https://inn-media.github.io/truyn/`

The workflow is intentionally separate from ordinary CI. It runs only for accepted `main` pushes that change `/docs` or the deployment workflow, requests only `contents: read`, `pages: write` and `id-token: write`, uploads only `/docs`, and deploys through the GitHub `github-pages` environment.

## GitHub Pages repository setting

GitHub Pages must use **GitHub Actions** as its publishing source. This is a one-time repository administration setting:

```text
Settings → Pages
Build and deployment → Source: GitHub Actions
```

The deployment workflow itself does not carry an administrator token and therefore cannot silently enable Pages or change repository administration settings. That boundary is deliberate.

After enablement, merging a `/docs` change to `main` causes `.github/workflows/deploy-developer-site.yml` to upload and deploy the exact accepted source. The workflow exposes the deployment URL through the `github-pages` environment.

Do not mark the live-site acceptance gate complete until an external HTTPS GET of `https://inn-media.github.io/truyn/` returns the checked-in TRUYN Developers portal and the deployment run is green.

## Optional TRUYN custom domain

A dedicated hostname such as `developers.truyn.org` may be added only after the default Pages origin is healthy. The DNS change is an external Cloudflare account boundary and must not replace or alter TRUYN runtime/relay DNS unintentionally.

If a custom domain is adopted:

1. add the custom domain in GitHub Pages settings;
2. add the corresponding Cloudflare DNS record following GitHub Pages custom-domain guidance;
3. verify DNS ownership and HTTPS issuance;
4. re-check both the custom URL and the default Pages deployment;
5. only then add/retain a `CNAME` file in `/docs` if required by the selected Pages configuration.

The Developer Release Layer does not require moving the existing `truyn.org` production origin. The default GitHub Pages origin is sufficient for the first public developer-site liveness proof.
