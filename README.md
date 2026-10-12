# H

個人使用的多網站編號轉換與本機工具網站。專案目前處於規劃階段，尚未開始功能實作。

## 規劃功能

- 多來源編號／網址轉換
- 歷史紀錄與收藏
- 純碼錶、紀錄詳情及時間統計
- 淺色、深色與系統主題
- IndexedDB 本機資料保存
- 使用者主動觸發的 GitHub 手動雙向同步
- 手機、平板與桌面響應式介面

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

目前建議採用 Astro、Svelte、TypeScript、Tailwind CSS 與 IndexedDB。前端部署平台、本機資料存取封裝、來源清單及同步細節仍待確認，請以技術決策紀錄為準。

GitHub 同步規劃使用 Cloudflare Worker 作為安全邊界，Token 不得進入前端。同步只在使用者手動操作時發起；同步失敗不得影響本機資料。

## 開發狀態

- [x] 初步需求與規格文件
- [x] 資料模型與同步合併規劃
- [x] Worker 安全與部署規格草案
- [x] 實作路線圖與技術決策紀錄
- [ ] 技術決策確認
- [ ] 專案骨架
- [ ] 功能實作
- [ ] 測試與部署

以上勾選只表示規劃文件已建立，不代表功能已實作或已通過執行測試。

## 原則

- 先確認需求與風險，再實作。
- 參考專案只作功能流程參考，不直接複製未確認授權的程式碼或資產。
- 來源逐項確認後才支援，遵守適用的服務條款與內容限制。
- 不把密碼、GitHub Token 或其他長期秘密提交到儲存庫或前端。
