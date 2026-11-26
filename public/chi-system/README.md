# CHI Design System assets

- Version: **v1.2.0**（status／h／merch accent 跟主題色走）
- Source repository: https://github.com/47tsai/chi-system
- Pinned source commit: `a7f018b7836afe42103b717b5379f72a244dfded`

Vendored generated assets (copied verbatim from the CHI `dist/` directory at the
pinned commit; do not edit them in this repository):

- `tokens.css`
- `theme.js`

`components.css` / `sidebar.js` / `tabs.js` / `dialog.js` 未 vendor：h 不用任何
chi-system 元件 class（`.chi-*`），側邊欄與手機版底部導覽維持本站現有做法，
只換殼／token／主題。

Logo is referenced pinned, not vendored: the logo files are
`logo/h-b.png` / `logo/h-w.png` via
`https://raw.githubusercontent.com/47tsai/chi-system/a7f018b7836afe42103b717b5379f72a244dfded/logo/h-*.png`
(no floating `main` branch). They are not copied into this repository because
the GitHub connector cannot push binary files.

Upgrade by copying a new pinned release and reviewing the h integration
before deployment.
