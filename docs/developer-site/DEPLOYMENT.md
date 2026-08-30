# Developer site deployment

The checked-in developer portal is a static GitHub Pages-compatible site.

## Source

- repository: `inn-media/truyn`
- branch: `main`
- Pages source directory: `/docs`
- root entrypoint: `docs/index.html`
- portal: `docs/developer-site/index.html`
- static processing: `docs/.nojekyll`

No separate deployment workflow is required. This deliberately preserves the repository's single permanent CI workflow and avoids granting Pages write/OIDC permissions to ordinary test jobs.

## One-time GitHub Pages enablement

Repository administration must select:

```text
Settings → Pages
Build and deployment → Source: Deploy from a branch
Branch: main
Folder: /docs
Save
```

After GitHub reports the deployment complete, the default public origin is expected at the repository's GitHub Pages URL and `/` redirects to the developer portal.

Do not claim the site is live until an external GET of the Pages URL returns the checked-in TRUYN Developers page.

## Optional TRUYN custom domain

A custom developer hostname such as `developers.truyn.org` can be added only after the default Pages deployment is healthy. The DNS change is an external Cloudflare account boundary and must not replace or alter TRUYN runtime/relay DNS unintentionally.

If a custom domain is adopted:

1. Add the custom domain in GitHub Pages settings.
2. Add the corresponding Cloudflare DNS record following GitHub Pages custom-domain guidance.
3. Verify DNS ownership/HTTPS issuance.
4. Re-check both the custom URL and the default Pages deployment.
5. Only then add/retain a `CNAME` file in `/docs` if required by the selected Pages configuration.

The first Developer Release Layer acceptance does not require moving the existing `truyn.org` production origin; a dedicated developer hostname or the default GitHub Pages origin is safer.
