# Phase 0 技術決策比較表

> 盤點日期：2026-10-12
>
> 狀態：建議方案，尚待專案擁有者確認。本文依官方文件與專案需求提出建議，不代表已經部署或完成建置驗證。

## 1. 前端部署與同步 API

### 候選方案

| 評估項目 | GitHub Pages + 獨立 Worker | Cloudflare Workers 統一部署 |
|---|---|---|
| 靜態 Astro 網站 | 支援，透過 GitHub Actions 建置與部署 | 支援，可由 Worker 提供靜態資產 |
| 同步 API | 需要獨立 Worker 與跨來源設定 | 可將網站與 API 放在同一個部署專案或同一網域架構 |
| 自訂網域與 DNS | 可用自訂網域，但要分別規劃 API 網域 | 與現有 Cloudflare 網域和 Worker 管理流程整合較直接 |
| 設定複雜度 | 前端與 API 分開，邊界清楚，但需要維護兩份部署設定 | 初期需要確認 Astro 與 Worker 的設定方式，但可減少跨來源設定 |
| 適合情境 | 想讓前端完全獨立於 Cloudflare，或已經有穩定 GitHub Pages 流程 | 已使用 Cloudflare，並希望網站與同步 API 由同一平台管理 |

### 建議

**優先驗證 Cloudflare Workers 提供 Astro 靜態資產與同步 API 的方案。**

理由：

- 本專案本來就需要 Cloudflare Worker 代理 GitHub API。
- 若網站與 API 使用同一個正式 Origin，可降低跨來源設定的複雜度。
- Astro 官方目前的 Cloudflare 部署指南指出，Cloudflare 對新專案建議使用 Workers；Pages 仍是可選方案。
- GitHub 仍作為原始碼與版本控制平台，不代表網站一定要由 GitHub Pages 託管。

但這仍需先做最小建置驗證：確認 Astro、Svelte、TypeScript、Tailwind CSS 的組合可以成功建置，並確認 Worker 的靜態資產路由不會與 /api/sync 衝突。若驗證不順利，再比較 Cloudflare Pages + 獨立 Worker。

參考：
- [Astro 官方 Cloudflare 部署指南](https://docs.astro.build/zh-cn/guides/deploy/cloudflare/)
- [Cloudflare 官方 Astro Pages 指南](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
- [Astro 官方 GitHub Pages 部署指南](https://docs.astro.build/zh-cn/guides/deploy/github/)

## 2. IndexedDB 存取方案

### 候選方案

| 方案 | 優點 | 代價 |
|---|---|---|
| 原生 IndexedDB | 沒有額外依賴，直接使用瀏覽器 API | 事件式 API 較繁瑣，錯誤處理與型別封裝需自行維護 |
| idb | 輕量 Promise 包裝、支援 TypeScript、保留原生 IndexedDB 的結構與能力 | 多一個依賴，仍須理解 IndexedDB 交易生命週期 |
| Dexie | 提供更高階的查詢、索引與資料庫操作 API | 封裝層更完整，第一版可能不需要全部功能 |

### 建議

**第一版優先採用 idb。**

理由：

- 本專案需要多個 object store、索引與 schema migration，但不需要立即引入大型資料存取抽象層。
- Promise API 與 TypeScript 型別可減少樣板程式碼。
- 資料存取層仍自行定義本專案的 CRUD、交易與 migration 規則，避免 UI 直接依賴函式庫 API。

注意：idb 不會消除 IndexedDB 的交易限制。不得在開啟 readwrite transaction 後執行不相關的長時間非資料庫 await；需要網路請求時，應先完成請求，再開啟資料庫交易。

參考：
- [idb 官方儲存庫與 API 說明](https://github.com/jakearchibald/idb)

## 3. 前端狀態管理

**建議：先使用 Svelte 原生狀態與獨立資料服務，不加入大型全域狀態管理套件。**

原因：主要持久化資料由 IndexedDB 管理，元件狀態只處理表單、載入中、錯誤提示、目前選取項目等短期 UI 狀態。若後續確實出現跨頁共享狀態的複雜需求，再以實際問題為依據評估。

## 4. 測試與品質工具

建議方向：

- TypeScript 型別檢查：每次整合時執行。
- Lint 與格式化：統一設定並在 CI 執行。
- 單元測試：驗證來源解析、URL 產生、碼錶時間計算、資料合併等純邏輯。
- Playwright：驗證轉換、歷史、收藏、碼錶與設定等關鍵端到端流程。

實際套件與版本應在專案初始化時確認相容性，並提交 lockfile。不要只依賴瀏覽器手動點測。

## 5. 第一版範圍建議

建議先納入：

- 轉換器核心與第一批經確認的來源。
- 歷史紀錄與收藏。
- 純碼錶、紀錄詳情與統計。
- 主題與響應式介面。
- IndexedDB 本機保存。
- 本機資料 JSON 匯出；匯入可在 schema 驗證與衝突策略確認後決定。
- GitHub 手動同步在本機核心穩定後再加入。

建議延後：

- PWA 安裝與複雜快取。
- 複雜來源預覽。
- 收藏標籤與進階分類。
- 需要大量外部 API 請求的功能。

## 6. 待確認清單

- [ ] 是否同意優先驗證 Cloudflare Workers 統一部署。
- [ ] 是否同意本機資料層採用 idb。
- [ ] 第一版是否提供 JSON 匯出。
- [ ] 第一批來源候選清單與合法性檢查結果。
- [ ] 測試工具、Lint、格式化與 CI 的具體套件。
- [ ] 正式網域與 API 路徑。

## 7. 最小技術驗證步驟

在寫入主要功能前，先用最小切片驗證：

1. 建立 Astro + Svelte + TypeScript + Tailwind CSS 專案骨架。
2. 加入 idb，建立一個測試 object store，完成寫入、讀取與版本升級測試。
3. 建立最簡單的 Worker API 路由，確認靜態頁面與 API 路徑可共存。
4. 以 CI 執行建置、型別檢查與測試。
5. 驗證通過後，才將此組合標記為已決定並開始完整功能開發。

若驗證失敗，應先記錄錯誤與調整方案，不可在文件中宣稱技術組合已經驗證成功。
