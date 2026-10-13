# 規格一致性盤點

盤點日期：2026-10-13

本文件以目前程式碼、工作流程與已知 CI 結果為準，區分自動化驗證和實際使用驗收。

## 已確認的實作現況

- 網站使用 Astro、Svelte 5、TypeScript 與 Tailwind CSS 4。
- 網站部署目標為 GitHub Pages；本機資料由 IndexedDB 保存。
- 同步由使用者在設定頁主動觸發，不會背景自動同步。
- 前端將同步文件傳給 Cloudflare Worker；Worker 代為存取 GitHub API。
- 同步文件使用 schema version 1；欄位與合併規則見 `DATA_MODEL_AND_MERGE.md`。
- Worker 使用 GitHub 檔案 SHA 處理寫入衝突，最多重試三次。
- 最新提交 `9bb75c4` 的 CI 與 GitHub Pages 部署均成功：
  - [CI](https://github.com/tsai97216/h/actions/runs/38344017659)
  - [GitHub Pages 部署](https://github.com/tsai97216/h/actions/runs/38344017638)

## 同步測試覆蓋與未驗證項目

- 自動化測試涵蓋資料驗證、重複 ID／URL、刪除標記、同網址 canonical ID、同步期間本機資料變更及有限次重試等情境。
- 最新同步修正保留本機較新的刪除標記，並阻止與該標記衝突的舊資料被套用。
- **尚未完成真實雙裝置端到端驗收。** 不應把單元測試或 CI 通過描述成已實測所有裝置流程。

## 重要安全限制

- 同步密碼欄位、密碼驗證端點與密碼雜湊部署已移除。
- Worker 目前檢查 Origin、請求格式及頻率，但沒有真正的使用者身分驗證。
- CORS 與 Origin 檢查無法阻止自行發送 HTTP 請求的客戶端偽造 Origin。
- 同步檔案目前位於公開儲存庫 `tsai97216/h`，其內容可被任何人讀取。不要同步密碼或敏感個人資料。
- 若需要私密同步，必須另行完成私人儲存、授權設計、部署與遷移驗證。

## 參考位置

- 前端同步：`src/lib/sync.ts`
- 本機資料與同步套用：`src/lib/storage.ts`
- 同步 UI：`src/components/AppShell.svelte`
- Worker：`worker/src/index.js`
- Worker 設定：`worker/wrangler.toml`
- Worker 部署：`.github/workflows/deploy-worker.yml`
