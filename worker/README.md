# H Tools Sync Worker

## 1. Create a private data repository

Create a dedicated **private** GitHub repository for sync data. Do not use the public application repository. A fine-grained GitHub token should have access only to that private repository and **Contents: Read and write** permission.

## 2. Configure the Worker

From this directory, replace `GITHUB_REPO` in `wrangler.toml` with the private repository name. Keep `ALLOWED_ORIGIN` set to the exact deployed site origin.

Install Wrangler if needed, then log in:

```sh
npm install --global wrangler
wrangler login
```

Set secrets interactively. The token is never committed to the repository:

```sh
wrangler secret put GITHUB_TOKEN
node scripts/hash-sync-password.mjs
wrangler secret put SYNC_PASSWORD_HASH
```

Paste the hash output from the helper into the second command's prompt. The sync password must be at least 16 characters and unique to this app. It is not your GitHub password or token.

Deploy from this directory:

```sh
wrangler deploy
```

The deployed URL should look like `https://h-tools-sync.<your-account>.workers.dev`. The frontend uses the `/api/sync` path.

## 3. Connect the site

In GitHub, open the `tsai97216/h` repository settings, then **Secrets and variables → Actions → Variables**. Add a repository variable:

- Name: `PUBLIC_SYNC_WORKER_URL`
- Value: the deployed Worker origin, for example `https://h-tools-sync.<your-account>.workers.dev` (no trailing slash and no `/api/sync` suffix).

Run the Pages deployment workflow again. The public URL is not a secret; do not add the GitHub token or sync password as a Pages variable.

## 4. Verify

- Open the site and use Settings → Cloud Sync.
- Enter the dedicated sync password and run a manual sync.
- A wrong password should return an authentication error without changing the private repository.
- The Worker accepts only `https://h.chi.qzz.io` as browser origin by default.
- Only confirmed GitHub writes are reported as successful. Failed syncs do not clear local data.

## Data and security

The Worker stores a single versioned JSON document at `data/sync.json` in the private repository. The password is sent only in a POST body over HTTPS and is never saved by the frontend. GitHub credentials exist only as Worker secrets. The Worker restricts its repository, branch, path, request size, schema, origin, and request rate.

The first sync merges by stable ID and timestamp. Deletion tombstones are synchronized so deleted records do not silently reappear. Tombstones are retained to prevent older devices from restoring deleted items.
