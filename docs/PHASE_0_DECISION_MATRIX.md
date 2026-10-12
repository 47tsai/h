# 技術選擇紀錄

本文件已由實際採用的方案取代。詳細現況見 [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md)。

- 前端：Astro、Svelte 5、TypeScript、Tailwind CSS 4。
- 網站部署：GitHub Pages。
- 本機資料：IndexedDB。
- 雲端同步：Cloudflare Worker 代理 GitHub API，手動觸發。
- 同步檔案：`data/sync.json`，目前位於公開儲存庫。
- 同步授權：目前沒有真正的使用者身分驗證；Origin 檢查與限流不等於授權。

本文件原先用於開發初期比較候選方案，舊的比較與建議不再作為目前實作依據。
