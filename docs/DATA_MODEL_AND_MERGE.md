# 同步資料模型與合併規則

實際實作以 `src/lib/sync.ts` 與 `worker/src/index.js` 為準。

## 文件結構

```ts
type SyncDocument = {
  schemaVersion: 1;
  updatedAt: string;
  settings: { theme?: 'system' | 'light' | 'dark' };
  stopwatchRecords: StopwatchRecord[];
  resultHistory: ResultHistoryItem[];
  favorites: FavoriteItem[];
  tombstones: SyncTombstone[];
};
```

- `stopwatchRecords`：已保存的碼表紀錄，時間欄位使用毫秒時間戳。
- `resultHistory`：轉換結果的開啟、複製或分享紀錄。
- `favorites`：收藏網址、標題、備註與建立／更新時間。
- `tombstones`：刪除標記，包含實體類型、ID、鍵值與刪除時間。
- `settings.theme`：主題偏好。

## 合併行為

Worker 先讀取雲端文件，再將雲端與本機資料合併。

- 一般資料以 `id` 去重。
- 碼表紀錄以 `createdAt` 比較。
- 歷史紀錄以 `lastActionAt` 比較。
- 收藏以 `updatedAt` 比較。
- 歷史紀錄與收藏會額外依 URL 合併，避免相同網址重複存在。
- 刪除標記以相同鍵值去重，保留較新的刪除時間；只要存在同 ID 的刪除標記，該項目就不會被合併回來，不以資料更新時間覆蓋刪除標記。
- 同 ID 資料的時間戳相同時，雲端版本優先，讓結果保持可預期；本機主題設定則優先於雲端值。
- GitHub 更新使用讀取時取得的 SHA；衝突時重新讀取並合併，最多嘗試三次。

## 限制

- 這不是完整的逐欄位衝突解決器。相同 ID 的資料衝突會依上述時間欄位選取一份；時間戳相同時採雲端版本。若項目已有刪除標記，則刪除優先於資料版本。
- 同一 URL 的歷史／收藏合併會保留既有 ID，並合併建立時間。
- Worker 與前端均會嚴格檢查 schema、允許欄位及欄位型別；文件或紀錄出現未知欄位、重複 ID／URL、無效刪除標記，或有效資料與同 ID 刪除標記衝突時，會拒絕同步。
- 每類資料最多 10,000 筆，刪除標記最多 30,000 筆；HTTP 請求上限為 800 KiB。

## 實作檔案

- 前端文件建立、驗證及套用：`src/lib/sync.ts`
- 雲端驗證、合併與 GitHub API：`worker/src/index.js`
- 本機資料庫：`src/lib/storage.ts`
