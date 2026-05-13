# Release Automation

This repository ships three GitHub Actions workflows:

- `ci.yml` runs the monorepo check and build on pull requests and pushes to `main`.
- `release-packages.yml` publishes the npm packages when a GitHub Release is published or when the workflow is run manually.
- `deploy-pages.yml` builds the Astro/Starlight website and deploys `packages/website/dist` to GitHub Pages.

## npm setup

The package release workflow uses npm Trusted Publishing through GitHub OIDC. Configure each npm package with this trusted publisher:

- Repository: this GitHub repository
- Workflow: `.github/workflows/release-packages.yml`
- Environment: `npm`

Packages:

- `ingraft`
- `@ingraft/skill`

The OpenTUI dashboard ships inside `ingraft`; `packages/tui` is only an internal workspace wrapper.

Do not add an `NPM_TOKEN` secret for the default path. Trusted Publishing uses short-lived OIDC credentials from GitHub Actions.

## GitHub Pages setup

In the repository settings, set Pages to deploy from GitHub Actions. The workflow uses the `github-pages` environment and publishes the Astro build output.

If the production domain is `ingraft.dev`, keep the domain configured in the Pages settings and DNS provider.
