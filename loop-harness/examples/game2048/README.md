# 2048 デスクトップ版（Electron）

ターミナル版（`src/cli.mjs`）と同じ盤面ロジック `src/game.mjs` を使った Windows アプリ。
ループエンジニアリングで 4 タスクに分けて作った（経緯は [loop-harness/README.md](../../README.md) の「例題 2b」）。

## 必要なもの

- Windows 10 / 11、Node.js 22 以上
- 初回の `npm install` は Electron 本体（約 120MB）をダウンロードするのでネットワークが必要

## ビルド手順

```bash
cd loop-harness/examples/game2048
npm install
npm run build
```

生成物（`dist/` は git 管理外）:

| パス | 内容 |
|---|---|
| `dist/win-unpacked/2048.exe` | 起動用の exe。同じフォルダの DLL と `resources/` が必要なので exe 単体では動かない |
| `dist/2048-win-x64.zip` | 配布用。展開したフォルダの `2048.exe` を起動する |

exe は Electron の署名済みバイナリを無改変で使っている（`disableAsarIntegrity: true`）。
Windows 11 の Smart App Control が有効な PC でも起動できる。ポータブル形式（exe 1 本）は
未署名の自己展開ラッパーになりブロックされるため使っていない。

## 開発中に起動する（ビルド不要）

```bash
npm start
```

## 操作

| キー | 動作 |
|---|---|
| 矢印 / WASD | 移動 |
| N | 新しいゲーム |
| Enter | 2048 達成の幕で「続ける」 |
| Q / Esc | 終了 |

## 設定ファイル

初回起動時に `%APPDATA%\2048\settings.json` を作る。

```json
{ "size": 600 }
```

`size` は盤面（＝ウィンドウ）の幅 px。300〜1200 の範囲で有効、範囲外は 600 として扱う。
ベストスコアは同じフォルダの `best.json` に保存される。

## テスト

```bash
npm test
```

`test/app.test.mjs` と `test/style.test.mjs` は実際に Electron を起動する（一時フォルダを userData に使うので `%APPDATA%` は汚さない）。
`test/build.test.mjs` は `npm run build` の後に `dist/` を検証する。
