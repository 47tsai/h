# 同步設計

## 目前流程

1. 使用者在設定頁手動按下同步，不會背景自動同步。
2. 前端從 IndexedDB 讀取碼表紀錄、歷史紀錄、收藏、刪除標記與主題設定。
3. 前端將資料送至設定好的 Cloudflare Worker `/api/sync`。
4. Worker 檢查 Origin、請求方法、JSON 格式、大小、允許欄位、資料結構與請求頻率；遇到未知欄位、重複 ID／URL 或資料與同 ID 刪除標記衝突時會拒絕同步。
5. Worker 從固定設定的 GitHub 儲存庫讀取 `data/sync.json`，合併資料後使用檔案 SHA 寫回。
6. 遇到 GitHub 版本衝突時，最多重試三次。
7. Worker 回傳合併結果，前端套用到 IndexedDB 並顯示結果。

## 同步資料

文件格式為 `schemaVersion: 1`，包含：

- `stopwatchRecords`
- `resultHistory`
- `favorites`
- `tombstones`
- `settings.theme`
- `updatedAt`

每種資料以 ID 合併。碼表紀錄以建立時間比較，歷史紀錄以最後操作時間比較，收藏以更新時間比較。歷史與收藏會再按 URL 去重。刪除標記會保留，並優先排除相同項目。

## 設定位置

- 前端 Worker 網址：建置環境變數 `PUBLIC_SYNC_WORKER_URL`。
- Worker 設定：`worker/wrangler.toml`。
- GitHub Token：Worker Secret `GITHUB_TOKEN`，由 `.github/workflows/deploy-worker.yml` 透過 GitHub Actions Secret `SYNC_GITHUB_TOKEN` 設定。
- Worker 部署所需 GitHub Actions Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SYNC_GITHUB_TOKEN`。

目前不需要同步密碼，設定頁按鈕會直接發起同步。

## 重要限制

- Origin 檢查和限流不是身分驗證。非瀏覽器客戶端可以自行偽造 Origin，因此知道 Worker 網址的人仍可能直接呼叫同步 API。
- 目前同步目標是公開儲存庫 `47tsai/h`，`data/sync.json` 內容可被任何人讀取。不要同步機密或敏感個人資料。
- 同步功能僅適合目前的個人使用情境；若要保護資料，應改用私人儲存庫並增加真正的存取驗證。
- Worker 或 GitHub 發生錯誤時，應保留本機資料，不要把失敗顯示為成功。
