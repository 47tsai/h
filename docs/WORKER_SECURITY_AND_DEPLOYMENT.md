# Worker 安全與部署規格

> 狀態：Worker 程式與密碼驗證已建立。注意：目前部署文件指出同步資料檔位於公開儲存庫，與本文的私人資料目標不一致；遷移至私人儲存庫並驗證設定前，不可同步敏感資料。本文定義預期的安全邊界與部署要求。

## 1. 設計目標

- 本機功能不依賴 Worker；離線時仍可使用轉換器、歷史紀錄、收藏與碼錶。
- 只有使用者主動觸發同步時才發送同步請求。
- GitHub Token 只存在 Cloudflare Worker Secrets，不得出現在前端程式、建置產物、瀏覽器儲存空間或回應內容。
- Worker 只允許操作預先設定的單一私人儲存庫與固定資料檔，不提供任意 GitHub API 代理。
- 驗證失敗、限流、GitHub 故障或資料衝突時，保留本機資料並顯示可理解的錯誤。
- 同步成功必須以 GitHub 寫入確認為準，不得只因請求已送出就顯示成功。

## 2. 元件與信任邊界

1. 前端：讀寫 IndexedDB，整理待同步文件，讓使用者主動輸入同步密碼並確認同步。
2. Cloudflare Worker：驗證同步密碼、套用限流、讀取 Secrets、向固定 GitHub API 路徑讀寫資料。
3. 私人 GitHub 儲存庫：保存同步文件及 GitHub 版本資訊。

前端輸入的密碼與同步資料都應視為不可信輸入。CORS 不是身分驗證機制，也不能單獨阻止非瀏覽器客戶端呼叫 Worker。

## 3. 設定與 Secrets

### Worker Secrets

- GITHUB_TOKEN：具備指定私人儲存庫必要 Contents 權限的細範圍 Token，優先使用 fine-grained token。
- SYNC_PASSWORD_HASH 或等效的伺服器端驗證設定：不得把明文密碼寫入程式碼或一般設定檔。
- 如部署環境採用短效工作階段，另外設定簽署工作階段 Token 的秘密金鑰。

Token 僅應授權指定儲存庫及必要的讀寫權限。若平台無法將 Token 限定到單一檔案，Worker 仍必須在程式中固定允許的儲存庫、分支與路徑。

### 一般 Worker 設定

以下值可作為非秘密設定：

- GITHUB_OWNER：儲存庫擁有者。
- GITHUB_REPO：儲存庫名稱。
- GITHUB_BRANCH：同步分支，初期固定為 main。
- GITHUB_FILE_PATH：同步文件路徑，例如 data/sync.json。
- ALLOWED_ORIGIN：正式前端的精確 Origin。
- RATE_LIMIT 設定：每個識別維度可接受的請求頻率與視窗。

實際名稱可依部署設定調整，但不可讓用戶端透過請求參數覆寫儲存庫、分支、路徑或 GitHub API URL。

## 4. 密碼驗證策略

### 第一版要求

- 使用者在設定頁手動輸入專用同步密碼。
- 不可使用 GitHub 登入密碼，也不可要求使用者把 GitHub PAT 貼到前端。
- 密碼只隨 HTTPS POST 請求傳送，不得放進 URL、查詢參數、頁面網址或分析事件。
- 前端不將密碼寫入 localStorage、IndexedDB、Cookie 或同步文件；請求完成後清空輸入欄位與可清除的記憶體狀態。
- Worker 不得把密碼、授權標頭或 Token 寫入日誌。
- 驗證失敗回覆應保持簡短，不洩露密碼雜湊、比較細節或 Secrets 設定。

如果以雜湊形式保存密碼驗證資料，應使用適合密碼的慢速雜湊及唯一 salt，並在 Worker 端完成比對。不可使用單純 SHA-256 當作密碼儲存方案。若選擇短效工作階段，工作階段 Token 應有到期時間、用途限制，且不可長期保存。

### 暴力嘗試防護

- 對失敗驗證與同步請求實施限流。
- 可依來源 IP、時間視窗及其他非敏感訊號組合限流；不要把單一 IP 當成可靠身分。
- 超限回覆 HTTP 429，並可提供 Retry-After。
- 不可假設 Cloudflare Cache、CORS 或前端按鈕停用就能防止暴力嘗試。
- 若需要更強保護，考慮 Cloudflare Turnstile、Access 或其他獨立的存取控制機制。

## 5. API 合約

第一版只需要一個固定端點：

- 方法：POST
- 路徑：/api/sync
- Content-Type：application/json
- 只接受正式前端允許的 Origin；另須保留非瀏覽器請求的驗證與限流防護。

### 請求概念

~~~json
{
  "password": "使用者輸入的專用同步密碼",
  "action": "sync",
  "document": {
    "schemaVersion": 1,
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "history": [],
    "favorites": [],
    "stopwatchRecords": [],
    "settings": {}
  },
  "baseSha": "前次讀取的 GitHub 檔案 SHA，首次同步時可為 null"
}
~~~

以上只描述欄位意義，不代表可直接使用的密碼或正式資料。正式實作應限制請求大小、驗證 JSON 結構與 schemaVersion，並拒絕未知或不合法的欄位。

### 回應概念

成功時回傳：

~~~json
{
  "ok": true,
  "document": {},
  "sha": "更新後的 GitHub blob SHA",
  "syncedAt": "伺服器確認成功的時間"
}
~~~

錯誤回應只提供必要資訊，例如：

~~~json
{
  "ok": false,
  "error": "AUTH_FAILED"
}
~~~

建議錯誤代碼：BAD_REQUEST、AUTH_FAILED、RATE_LIMITED、PAYLOAD_TOO_LARGE、GITHUB_UNAVAILABLE、SYNC_CONFLICT、INTERNAL_ERROR。回應不得包含 GitHub Token、原始 GitHub 錯誤中的敏感標頭、密碼或完整內部堆疊。

## 6. 同步處理順序

1. 檢查 HTTP 方法、Origin、Content-Type 與請求大小。
2. 解析並驗證 JSON 結構，拒絕不支援的 schemaVersion。
3. 執行限流，再驗證同步密碼或短效工作階段。
4. 將文件欄位與每筆資料的型別、長度及數量限制逐項驗證。
5. 只向固定的 GitHub API 位置讀取目標文件。
6. 取得目前文件與 SHA，依資料合併規格合併本機和雲端內容。
7. 使用目前 SHA 寫回目標文件；若版本已改變，重新讀取並有限次重試合併。
8. 只有 GitHub 明確確認寫入成功後，才回傳成功與新 SHA。
9. 前端收到成功回應後才更新本機同步基準與最後同步時間。

不得無限制重試。若發生版本衝突且有限次重試後仍無法解決，回傳 SYNC_CONFLICT，保留本機資料，提示使用者稍後再試。

## 7. 輸入驗證與資源限制

正式實作至少應限制：

- 單次請求的最大位元組數。
- 歷史紀錄、收藏、碼錶紀錄的最大筆數。
- 每個字串欄位的最大長度。
- 陣列與物件的允許欄位。
- 日期時間格式與數值範圍。
- schemaVersion 及同步文件總大小。

不得直接將用戶端提供的 URL、儲存庫名稱、路徑或 API 端點交給 fetch。這可避免 Worker 變成任意代理或引入 SSRF 風險。若收藏允許保存網址，應將其視為使用者資料，不得由 Worker 自動訪問該網址。

## 8. CORS 與 HTTP 行為

- 僅允許正式網站的精確 Origin，不使用任意反射 Origin 的設定。
- 正確處理 OPTIONS 預檢請求。
- 僅允許必要的方法與標頭。
- 回應設定適當的 Content-Type，並避免不必要的快取。
- 不把 CORS 當作驗證或授權的替代品。
- 對 GET、PUT、DELETE 等未支援方法回覆 405。

開發環境若需要不同 Origin，應透過明確的開發設定允許，不應把萬用 Origin 留在正式環境。

## 9. 日誌與隱私

可記錄：時間、請求結果、耗時、錯誤代碼、限流是否觸發，以及必要的追蹤識別碼。

不可記錄：同步密碼、GitHub Token、完整 Authorization 標頭、完整同步文件、收藏內容或不必要的個人資料。錯誤回應亦不得回傳完整敏感上游回應。

## 10. 部署流程

1. 建立專用私人 GitHub 儲存庫或確認既有私人儲存庫的存取範圍。
2. 建立僅有必要儲存庫 Contents 權限的 GitHub Token。
3. 建立 Cloudflare Worker，設定固定的儲存庫、分支與資料路徑。
4. 使用 Cloudflare Secrets 設定 Token 及密碼驗證所需的秘密。
5. 設定正式前端 Origin、限流策略、請求大小上限與必要的安全設定。
6. 先在測試儲存庫驗證成功同步、錯誤密碼、限流、GitHub API 失敗與版本衝突。
7. 部署正式 Worker，從正式網站進行端到端測試。
8. 確認瀏覽器建置產物與網路回應不含 GitHub Token 或其他伺服器秘密。
9. 記錄 Token 的建立日期與輪替方式；若懷疑洩漏，立即撤銷並重新建立。

## 11. 最低測試清單

- 正確密碼與有效文件可成功同步。
- 錯誤密碼不會呼叫 GitHub 寫入 API。
- 缺少欄位、錯誤型別、未知版本與過大請求被拒絕。
- 非允許 Origin 無法取得可用的跨來源回應。
- 超出限流時回覆 429。
- GitHub 401、403、404、409、422、429 與 5xx 均被安全處理。
- 兩個裝置同時同步時不會靜默覆蓋較新的資料。
- Worker 或網路中斷時，本機資料仍完整可用。
- 密碼與 Token 不出現在日誌、前端建置檔、網址或一般錯誤訊息。
- 只有 GitHub 確認寫入後，前端才顯示同步成功。

## 12. 尚待實作時決定

- 密碼驗證採用固定同步密碼雜湊，還是驗證後換發短效工作階段 Token。
- 限流採用 Cloudflare 內建能力、Durable Objects 或其他持久化計數方案。
- 同步文件採單一 JSON 檔，還是依資料類型拆分多個檔案。
- 正式前端與 Worker 的部署網域及 Origin。
- GitHub Token 的最小可用權限與輪替流程。

在這些選項完成評估前，不應把本文視為已部署的安全實作。