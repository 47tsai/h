# H Tools Sync Worker

Cloudflare Worker for manual, one-click synchronization between H Tools and the repository's sync document.

## Deployment

GitHub Actions deploys the Worker when files under `worker/` or its deployment workflow change. The workflow requires these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SYNC_GITHUB_TOKEN`

The GitHub token should have only the repository Contents permissions needed to read and update `data/sync.json`. The deployment workflow stores it in Cloudflare Worker Secrets as `GITHUB_TOKEN`.

## Configuration

The Worker configuration is in `wrangler.toml`. It currently targets:

- Repository: `47tsai/h`
- Branch: `main`
- File: `data/sync.json`
- Allowed browser origin: `https://h.chi.qzz.io`

Set the GitHub repository variable `PUBLIC_SYNC_WORKER_URL` to the deployed Worker origin, without a trailing slash or `/api/sync`. The Pages workflow uses it when building the site.

## Data and access

The sync document is stored in this repository. This repository is public, so the contents of `data/sync.json` can be read by anyone. Do not sync sensitive or private information.

The current one-click sync endpoint does not require a sync password. The Worker still restricts the target repository and file and applies request and data handling limits, but these are not user authentication. Anyone able to call the endpoint may be able to interfere with shared sync data.

## Local development

From the repository root:

```sh
npm install
npm run dev
```

The Worker can be deployed manually with Wrangler from the `worker/` directory if Wrangler is configured for the target Cloudflare account.
