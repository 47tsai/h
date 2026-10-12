# 規格一致性盤點

盤點日期：2026-10-12

本文件以目前程式碼與部署設定為準，記錄容易混淆的實際行為。

## 已確認

- 網站使用 Astro、Svelte 5、TypeScript 與 Tailwind CSS 4。
- 網站部署目標為 GitHub Pages。
- 本機資料由 IndexedDB 保存。
- 同步只能由使用者在設定頁主動觸發。
- 前端將同步文件傳給 Cloudflare Worker；Worker 代為存取 GitHub API。
- 同步文件使用 schema version 1，欄位與合併規則見 `DATA_MODEL_AND_MERGE.md`。
- Worker 使用 GitHub 檔案 SHA 處理寫入衝突，最多重試三次。

## 重要差異與限制

- 同步密碼欄位、密碼驗證端點與密碼雜湊部署已移除。
- Worker 目前只檢查 Origin、請求格式及頻率，不具備真正的使用者身分驗證。
- CORS 與 Origin 檢查無法阻止自行發送 HTTP 請求的客戶端偽造 Origin。
- 同步檔案目前位於公開儲存庫 `tsai97216/h`，其內容可被任何人讀取。
- `docs/PROJECT_PLAN.md`、`docs/IMPLEMENTATION_ROADMAP.md`、`docs/INTERFACE_AND_SOURCE_PLAN.md`、`docs/LOW_FIDELITY_WIREFRAMES.md` 與 `docs/PHASE_0_DECISION_MATRIX.md` 是規劃材料，不應當作目前實作狀態的證明。

## 參考位置

- 同步前端：`src/lib/sync.ts`
- 同步 UI：`src/components/AppShell.svelte`
- Worker：`worker/src/index.js`
- Worker 設定：`worker/wrangler.toml`
- Worker 部署：`.github/workflows/deploy-worker.yml`
