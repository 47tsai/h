# Worker 設定與部署

## 檔案

- Worker 入口：`worker/src/index.js`
- Wrangler 設定：`worker/wrangler.toml`
- 自動部署：`.github/workflows/deploy-worker.yml`
- 前端同步程式：`src/lib/sync.ts`

## 部署設定

`worker/wrangler.toml` 目前設定：

- `GITHUB_OWNER`：`tsai97216`
- `GITHUB_REPO`：`h`
- `GITHUB_BRANCH`：`main`
- `GITHUB_FILE_PATH`：`data/sync.json`
- `ALLOWED_ORIGIN`：`https://h.chi.qzz.io`
- 每個限流識別值每 60 秒最多 10 次請求。

Worker Secret：

- `GITHUB_TOKEN`：可讀寫同步檔案的 GitHub Token。

GitHub Actions 部署 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SYNC_GITHUB_TOKEN`

前端建置時需設定 `PUBLIC_SYNC_WORKER_URL`，值為 Worker 的 HTTPS 基底網址，不含 `/api/sync`。

## API 行為

- 只接受 `POST /api/sync` 與 CORS 預檢 `OPTIONS`。
- 要求 `application/json`。
- 請求本體上限為 800 KiB。
- 驗證同步文件 schema、資料型別及項目數量。
- 透過 Cloudflare Rate Limiting binding 限制請求頻率。
- 對固定 GitHub 檔案執行讀取、合併與寫入。
- 使用 GitHub 檔案 SHA 處理並行更新，最多重試三次。

## 目前安全限制

目前已移除同步密碼。Worker 以 Origin 比對及限流作為基本限制，但 Origin 不是身分驗證，因為直接呼叫 API 的客戶端可以自行設定該標頭。

同步資料目前存放於公開儲存庫 `tsai97216/h`，所以 `data/sync.json` 是公開內容。請勿將密碼、Token 或其他敏感資料放進同步文件。GitHub Token 只應存在 Worker Secret，不可放進前端。

如果需要真正的私密同步，必須先將同步資料移至私人儲存庫，再加入可實際驗證使用者的授權機制。單靠 CORS、Origin 檢查或限流無法達成私密存取。

## 部署方式

將 `worker/**` 或本部署工作流程的變更推送至 `main`，GitHub Actions 會使用 Wrangler 部署 Worker 並設定 `GITHUB_TOKEN`。也可以在 Actions 手動執行部署工作流程。
