# H

個人使用的多網站編號轉換與本機工具網站。

## 功能規劃

- 多來源編號／網址轉換
- 歷史紀錄與收藏
- 純碼錶、紀錄詳情及時間統計
- 淺色、深色與系統主題
- IndexedDB 本機資料保存
- 使用者主動觸發的 GitHub 手動雙向同步
- 手機、平板與桌面響應式介面

## 目前實作

- [x] Astro + Svelte + TypeScript 專案骨架
- [x] Tailwind CSS 4 基礎整合
- [x] 響應式工作區導覽與深／淺色／系統主題
- [x] 碼錶開始、暫停、繼續、停止與本機儲存
- [x] IndexedDB 碼錶紀錄讀取、刪除及歷史搜尋
- [x] 歷史紀錄四種排序、開始／結束時間與今日／累計統計
- [x] 收藏新增、搜尋、開啟、編輯、排序與取消收藏，編輯時防止與其他收藏網址重複
- [x] IndexedDB schema 從 v1 升級至 v2，新增收藏資料表
- [x] 收藏與碼錶資料層的行為測試（fake-indexeddb）
- [x] 進行中的碼錶狀態可在重新開啟頁面後恢復
- [x] 獨立碼錶時間工具與異常狀態驗證測試
- [x] GitHub Actions 型別檢查、測試與建置流程
- [x] GitHub Pages 自動部署流程與 `h.chi.qzz.io` 自訂網域 CNAME
- [x] 編號轉換器的來源選擇、結果生成、複製、開啟與分享操作
- [ ] 將所有來源規則統一收斂至 adapter 註冊表
- [ ] 收藏進階 UX 測試
- [x] IndexedDB schema 從 v1 升級至 v2 的資料保留與索引測試
- [x] 設定頁提供手動同步入口、同步結果與上次同步時間
- [x] JSON 備份匯出與合併匯入，限制檔案大小並驗證資料欄位
- [x] 備份匯入使用 IndexedDB 單一交易，失敗時避免留下部分寫入；恢復項目時清除對應刪除標記
- [x] 雲端同步文件欄位、網址、時間戳記、刪除標記與資料量驗證測試
- [ ] 同步 Worker 權限與雙向合併行為的完整驗證
- [ ] 端到端測試、外部網域／HTTPS 驗證與跨裝置驗證

編號轉換、收藏、歷史紀錄、碼錶、資料備份與手動同步介面已具備實作。來源轉換規則目前仍有部分直接定義於介面元件中，後續應統一至 adapter 註冊表。雲端同步的安全設定與跨裝置合併行為仍需另外驗證；每次變更的型別檢查、測試與建置狀態，請以 GitHub Actions 執行結果為準。

## 文件

- [專案規劃](docs/PROJECT_PLAN.md)
- [頁面配置與來源規劃](docs/INTERFACE_AND_SOURCE_PLAN.md)
- [低保真介面草圖](docs/LOW_FIDELITY_WIREFRAMES.md)
- [同步設計](docs/SYNC_DESIGN.md)
- [資料模型與合併規則](docs/DATA_MODEL_AND_MERGE.md)
- [Worker 安全與部署規格](docs/WORKER_SECURITY_AND_DEPLOYMENT.md)
- [實作路線圖](docs/IMPLEMENTATION_ROADMAP.md)
- [技術決策紀錄](docs/TECHNICAL_DECISIONS.md)
- [Phase 0 技術決策比較表](docs/PHASE_0_DECISION_MATRIX.md)
- [規格一致性盤點](docs/SPEC_CONSISTENCY_AUDIT.md)

## 技術方向

Astro、Svelte 5、TypeScript、Tailwind CSS 4 與 IndexedDB。前端部署及同步服務仍依技術決策紀錄逐步驗證。

GitHub 同步預計使用 Cloudflare Worker 作為安全邊界，Token 不得進入前端。同步只在使用者手動操作時發起；同步失敗不得影響本機資料。

## 原則

- 先確認需求與風險，再實作。
- 參考專案只作功能流程參考，不直接複製未確認授權的程式碼或資產。
- 來源逐項確認後才支援，遵守適用的服務條款與內容限制。
- 不把密碼、GitHub Token 或其他長期秘密提交到儲存庫或前端。
