# 文件索引

本目錄分成「現況與操作」、「計畫與驗收」及「歷史參考」三類。程式碼與 CI 結果是實作現況的依據；規劃文件不代表功能已完成。

## 現況與操作

- [規格一致性盤點](SPEC_CONSISTENCY_AUDIT.md)：已核對的現況、限制與尚未驗收項目。
- [同步設計](SYNC_DESIGN.md)：手動同步流程及目前限制。
- [同步資料模型](DATA_MODEL_AND_MERGE.md)：資料欄位、合併規則與衝突處理。
- [Worker 設定與部署](WORKER_SECURITY_AND_DEPLOYMENT.md)：Worker 設定、部署方式與安全限制。
- [技術決策](TECHNICAL_DECISIONS.md)：目前採用的技術與已知限制。

## 計畫與驗收

- [實作路線圖](IMPLEMENTATION_ROADMAP.md)：優先順序、完成狀態與同步驗收清單。
- [專案規劃](PROJECT_PLAN.md)：功能範圍、維護原則與計畫更新規則。
- [介面與來源規劃](INTERFACE_AND_SOURCE_PLAN.md)：介面互動及來源規則的規劃參考。

## 歷史參考

- [低擬真介面備忘](LOW_FIDELITY_WIREFRAMES.md)：早期頁面區塊與互動構想。
- [技術選擇紀錄](PHASE_0_DECISION_MATRIX.md)：早期技術選擇備忘。

## 維護規則

- 先確認實際程式行為，再更新文件。
- 只有遇到可重現的錯誤、驗收失敗或明確的安全風險才新增修正工作。
- 不為假設性的邊界情況無限擴張工作範圍；每項工作都要有完成條件。
- 根目錄 README 與 `data/sync.json` 不屬於本次文件整理範圍。
