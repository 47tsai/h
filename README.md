# H Tools

個人使用的多網站編號轉換與本機工具網站。

網站：https://h.chi.qzz.io/

## 功能

- 多來源編號與網址轉換
- 轉換結果的複製、開啟與分享
- 歷史紀錄與收藏管理
- 碼錶、計時紀錄與時間統計
- 淺色、深色與系統主題
- IndexedDB 本機資料保存
- JSON 備份匯出與匯入
- 手動雲端同步
- 支援手機、平板與桌面版

## 技術

Astro、Svelte 5、TypeScript、Tailwind CSS 4、IndexedDB。

## 本機開發

需求：Node.js 22 或相容版本。

```sh
npm install
npm run dev
```

其他指令：

- `npm run build`：建立正式版網站
- `npm run preview`：預覽正式版建置結果

## 部署

網站使用 GitHub Pages 部署；同步服務使用 Cloudflare Workers。

## 專案文件

架構、資料模型、同步設計及其他技術文件集中放在 [docs](docs/)。
