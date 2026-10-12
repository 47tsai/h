# 資料模型與雙向合併規則

> 狀態：規劃中，尚未實作。本文定義第一版本機資料與 GitHub 雙向同步的資料結構方向及合併規則。

## 1. 設計原則

- IndexedDB 是目前裝置的日常資料庫；GitHub 保存可跨裝置同步的副本。
- 每筆資料都有穩定 ID，不使用陣列位置識別項目。
- 同步必須能重複執行；相同資料重複送出不應產生副本。
- 刪除也需要同步，不能只從本機陣列移除。
- 先保護使用者資料，再追求自動化；無法安全判斷的衝突不可靜默丟棄資料。
- 所有時間統一使用 ISO 8601 UTC 字串保存；介面顯示時再轉成使用者當地時間。

## 2. 第一版資料型別

以下是概念性 TypeScript 形狀，實作前可依測試再調整。

~~~ts
type HistoryItem = {
  id: string;
  sourceId: string;
  input: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type FavoriteItem = {
  id: string;
  sourceId: string;
  input: string;
  url: string;
  title?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type StopwatchRecord = {
  id: string;
  startedAt: string;
  endedAt?: string;
  elapsedMs: number;
  status: "running" | "paused" | "completed";
  pauseIntervals: Array<{
    startedAt: string;
    endedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type UserSettings = {
  theme: "light" | "dark" | "system";
  schemaVersion: number;
  updatedAt: string;
};

type SyncDocument = {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  history: HistoryItem[];
  favorites: FavoriteItem[];
  stopwatchRecords: StopwatchRecord[];
  settings?: UserSettings;
};
~~~

### 欄位注意事項

- 歷史記錄以新增為主；刪除時保留刪除標記供同步使用。
- 收藏是獨立資料，不依賴歷史記錄是否仍存在。
- 碼表名稱可由開始時間顯示產生，避免另存一個容易不一致的名稱欄位。
- 實際實作時應將「目前未完成的碼表狀態」與「已完成紀錄」分開處理，或明確定義狀態轉換。
- elapsedMs 應以時間戳與暫停區段推算及校驗，不可只靠每秒累加。
- schemaVersion 用於資料格式升級；revision 是雲端版本提示。防止覆寫仍需搭配 GitHub 檔案 SHA 或條件更新。
- 同步密碼、GitHub Token、工作階段憑證不得進入同步資料文件。

## 3. 合併規則

對每種資料集合，依 ID 建立本機與雲端索引，再合併：

1. 只有本機存在：加入合併結果。
2. 只有雲端存在：加入合併結果。
3. 兩邊都有且內容相同：保留一份。
4. 兩邊都有且只有一邊較新：依 updatedAt 選取較新版本，但要保留刪除標記的優先規則。
5. 兩邊都有且時間相同但內容不同：標記為衝突，不可隨機選擇。
6. 合併結果經過 schema 驗證後，才可寫回雲端與本機。

### 刪除優先規則

- 刪除使用 deletedAt 軟刪除標記。
- 若一端有刪除標記，另一端是較舊的未刪除版本，刪除標記勝出。
- 若一端刪除、另一端在刪除後又有明確更新，不能只憑時間猜測使用者意圖；第一版可將它列為衝突，提供保留或刪除選擇。
- 在所有裝置同步完成前，不永久清除刪除標記。

### 衝突處理

第一版優先自動合併不同 ID 的新增資料。相同 ID 的內容衝突則：
- 不丟棄任一版本；
- 顯示資料類型、更新時間與可辨識的差異；
- 讓使用者選擇保留本機、保留雲端，或保留為兩筆（若資料類型允許）；
- 在使用者選擇前，不把衝突狀態標記為同步完成。

## 4. 防止同步覆寫與重複

GitHub Contents API 更新檔案時會涉及目前檔案 SHA。建議採取以下循環：

1. 從 GitHub 讀取目前文件與 SHA。
2. 依目前本機資料與雲端文件產生合併結果。
3. 使用讀取到的 SHA 嘗試更新。
4. 若因雲端版本已變更而失敗，重新讀取最新文件並重新合併。
5. 設定有限重試次數；仍失敗時保留本機變更並顯示「雲端已變更，請稍後重試」。

不能以最後寫入者無條件覆蓋整份文件作為正常流程。多個裝置同時寫入時，SHA 檢查是必要的競爭條件保護。

## 5. 本機變更佇列與同步狀態

本機應追蹤每筆資料的變更狀態，或以本機版本與最後同步版本比較推導待同步項目。狀態至少需區分：

- 本機有新變更，尚未同步。
- 同步進行中。
- 已同步。
- 同步失敗，保留待重試。
- 有衝突，需要處理。

不要只用一個全域布林值代表所有資料的同步狀態。同步中途失敗時，已成功保存於本機的資料不能回滾。

## 6. 碼表的特別規則

- 正在進行的碼表狀態也可能需要同步，否則裝置 A 正在計時時，裝置 B 不會看到最新狀態。
- 同一筆進行中的碼表若在兩台裝置同時被操作，可能產生衝突。第一版建議只允許一個裝置修改同一筆未完成碼表；另一裝置可提示「此碼表可能已在其他裝置更新」。
- 計時有效時間以開始時間、暫停區段與結束時間計算，顯示更新不應改變已保存的真實時間。
- 時鐘校正可能影響不同裝置的時間戳比較，因此 updatedAt 只用於版本判斷的輔助資訊，不應作為唯一的資料正確性依據。

## 7. 同步 API 草案

前端只呼叫固定的 Worker 路徑，例如概念上的 POST /sync。請求包含操作類型、資料格式版本及必要的本機資料。Worker 內部負責讀取固定 GitHub 檔案、合併或協調版本，再回傳必要結果。

實際 endpoint、HTTP 方法、請求格式、大小上限與錯誤碼要在實作前確定。不要提供可由客戶端指定任意 GitHub repository、路徑或 URL 的通用代理端點。

建議錯誤分類至少包括：
- UNAUTHORIZED：密碼驗證失敗。
- RATE_LIMITED：請求過於頻繁。
- INVALID_PAYLOAD：資料格式錯誤。
- REMOTE_CONFLICT：雲端版本在更新前已變更。
- REMOTE_UNAVAILABLE：GitHub 或 Worker 暫時不可用。
- SYNC_FAILED：其他同步失敗。

對使用者顯示易懂訊息；詳細診斷只記錄不含秘密的代碼與請求識別碼。

## 8. 實作前測試案例

- [ ] 兩台裝置各新增不同收藏，雙向同步後兩筆都存在。
- [ ] 同一項目重複同步不會產生重複資料。
- [ ] 本機刪除後同步，雲端不會讓該項目復活。
- [ ] 雲端刪除後同步，本機不會讓該項目復活。
- [ ] 同一 ID 在兩邊被修改時，依規則合併或顯示衝突。
- [ ] 同步中斷時，本機資料仍完整，且可再次同步。
- [ ] 兩個裝置幾乎同時寫入時，不會靜默覆蓋。
- [ ] 不支援的 schema version 不會被當成空資料覆蓋。
- [ ] 雲端 JSON 損壞或不符合 schema 時，停止寫入並保留本機資料。
- [ ] 未授權、限流與 GitHub API 錯誤都有正確的 UI 狀態。
