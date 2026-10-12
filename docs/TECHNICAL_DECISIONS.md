# 技術決策紀錄

只記錄目前實際採用的方案；尚未實作或未確認的內容不列為既定決策。

## 前端

- Astro、Svelte 5、TypeScript、Tailwind CSS 4。
- 以 GitHub Pages 部署網站。
- 本機結構化資料使用 IndexedDB。
- 使用者可選擇淺色、深色或跟隨系統主題。
- 核心功能不依賴雲端同步才能使用。

## 資料與同步

- 同步由使用者在設定頁手動觸發，不執行背景自動同步。
- 前端透過 Cloudflare Worker 呼叫 GitHub API，GitHub Token 不放進前端。
- Worker 固定操作設定中的 GitHub 儲存庫、分支與檔案路徑。
- 同步資料格式為 schema version 1，定義於 `src/lib/sync.ts` 與 `worker/src/index.js`。
- 合併使用資料 ID、時間欄位及刪除標記；GitHub 檔案 SHA 用於處理寫入衝突。
- 設定頁不要求輸入同步密碼，按下同步即發起請求。

## 已知限制

- 目前同步檔案位於公開儲存庫，因此資料內容可被公開讀取。
- Worker 的 Origin 檢查與限流不等於身分驗證。任何知道端點的人都可能偽造 Origin 發出請求。
- 不應將敏感資料放入同步內容。若要私密同步，需另行遷移資料儲存位置並實作真正的存取驗證。

## 參考實作

- 前端設定與操作：`src/components/AppShell.svelte`
- 前端同步流程：`src/lib/sync.ts`
- Worker：`worker/src/index.js`
- Worker 部署設定：`worker/wrangler.toml`
- Worker 部署流程：`.github/workflows/deploy-worker.yml`
