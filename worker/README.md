# H Tools Sync Worker

The Worker is deployed automatically by GitHub Actions when files under `worker/` change, or when the workflow is run manually.

## 1. GitHub Actions secrets

In `tsai97216/h`, open **Settings → Secrets and variables → Actions → New repository secret** and add:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with **Workers Scripts: Edit** and **Account Settings: Read** permissions for the target account.
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
- `SYNC_GITHUB_TOKEN`: a fine-grained GitHub token limited to `tsai97216/h`, with **Contents: Read and write** permission.
- `SYNC_PASSWORD`: a unique sync password of at least 16 characters. Do not reuse your GitHub or Cloudflare password.

The workflow derives a salted PBKDF2-SHA256 hash from `SYNC_PASSWORD` during deployment and uploads only the hash as the Worker secret `SYNC_PASSWORD_HASH`. It uploads `SYNC_GITHUB_TOKEN` to the Worker as `GITHUB_TOKEN`. Do not put any of these values in source files or paste them into chat.

## 2. Worker configuration and public sync data

The Worker is configured to store the document in this repository at `data/sync.json`. The file is public by design, so anyone can read its contents. Do not sync sensitive or private information.

The Worker accepts browser requests only from `https://h.chi.qzz.io`. The GitHub token is scoped to this repository and kept in Worker Secrets at runtime.

## 3. Connect the site

In GitHub, open **Settings → Secrets and variables → Actions → Variables**. Add a repository variable:

- Name: `PUBLIC_SYNC_WORKER_URL`
- Value: the deployed Worker origin, such as `https://h-tools-sync.<your-account>.workers.dev`, with no trailing slash and no `/api/sync` suffix.

The Pages workflow uses this variable to configure the frontend. Re-run the Pages workflow after setting it.

## 4. Deploy and verify

1. Add all four repository secrets above.
2. Add `PUBLIC_SYNC_WORKER_URL` after the Worker has deployed successfully for the first time.
3. Run **Actions → Deploy Cloudflare Worker → Run workflow**.
4. Open the site and use **Settings → Cloud Sync** to test a manual sync.

A successful sync writes `data/sync.json` to the public repository. The Pages and CI workflows ignore commits that only change this data file, so syncing will not trigger unnecessary website builds.

## Security notes

- Never commit GitHub or Cloudflare tokens.
- The sync password is sent over HTTPS and is never stored by the frontend.
- The Worker validates payload size and schema, restricts the repository, branch, file path, browser origin, and request rate.
- Deletion tombstones are retained so old devices do not silently restore deleted items.
