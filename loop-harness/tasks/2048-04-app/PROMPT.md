# タスク仕様: 2048 デスクトップ版 04 — Electron アプリ本体

`src/view.mjs`（実装済み。変更しない）を使って、Windows で動く Electron アプリを `app/` に実装する。
見た目は「ペーパー」案: 生成りの紙にモノスペース数字、色ではなく罫線と塗りの 3 段階で数字の大きさを表す。

`node_modules/` に `electron`（devDependency）が導入済み。`npx electron . --smoke --user-data <dir>` で起動できる。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する（`test/app.test.mjs` は実際に Electron を起動する）
2. 依存パッケージを追加しない（`package.json` の `devDependencies` を変えない。`scripts` や `build` の追記は不要）
3. `test/` 配下と `src/*.mjs` を変更しない
4. `app/` のファイルは外部 URL（http/https）を参照しない。フォントは Windows 標準のもの（`"Cascadia Mono", Consolas, monospace`）を使う
5. 引数なしで `npx electron .` を起動すると、矢印キー / WASD でタイルが動き、N で新規、Q または Esc で終了できる
   （自動検証できないため、実装後にコードを読み返して手順どおり動くことを確認し、進捗メモに確認内容を書く）

## ファイル構成（すべて新規作成、`app/` 直下）

| ファイル | 役割 |
|---|---|
| `main.cjs` | メインプロセス。設定とベストスコアの読み書き、固定サイズのウィンドウ、`--smoke` |
| `preload.cjs` | `contextBridge.exposeInMainWorld('desktop', …)` で IPC をレンダラーへ公開 |
| `index.html` | `<div id="app"></div>`、`<link rel="stylesheet" href="./style.css">`、`<script type="module" src="./renderer.js"></script>` |
| `renderer.js` | ES モジュール。`../src/view.mjs` と `../src/game.mjs` を import し、キー入力 → `reduce` → `render` を `#app` の innerHTML に流し込む |
| `style.css` | ペーパー案のスタイル。すべての寸法を `var(--size)` の比率で書く |

`package.json` の `main` は `app/main.cjs` に設定済み。

## main.cjs

### 引数

`process.argv.slice(app.isPackaged ? 1 : 2)` を解釈する。

- `--user-data <dir>`: `app.setPath('userData', dir)` を **`app.whenReady()` より前**に呼ぶ。指定がなければ既定の userData（`%APPDATA%\2048`。`app.setName('2048')` を先に呼ぶ）
- `--smoke`: 後述のスモークモード

### 設定ファイル `settings.json`（userData 直下）

- 形式: `{ "size": 600 }`。`size` は盤面（＝ウィンドウ）の幅 px
- 起動時に読む。ファイルが無ければ `{ "size": 600 }` を書き出してから使う
- `size` が整数でない、または 300 未満・1200 超のときは 600 として扱う。**このときファイルは書き換えない**
- 読み書きは `fs` の同期 API でよい

### ベストスコア `best.json`（userData 直下）

- 形式: `{ "best": 0 }`。無ければ 0 として扱う（この時点ではファイルを作らなくてよい）
- IPC `best:set` で受け取った整数を書き込む

### ウィンドウ

```js
new BrowserWindow({
  width: size,
  height: Math.round(size * 1.16),
  useContentSize: true,        // 上の幅・高さはクライアント領域
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  autoHideMenuBar: true,
  title: '2048',
  backgroundColor: '#fbfaf5',
  webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
})
```

- `Menu.setApplicationMenu(null)` を呼び、メニューバーを消す
- `win.loadFile(path.join(__dirname, 'index.html'))`
- すべてのウィンドウが閉じたら `app.quit()`

### IPC（`ipcMain.handle`）

| チャンネル | 引数 | 戻り値 |
|---|---|---|
| `settings:get` | なし | `{ size }`（検証済みの値） |
| `best:get` | なし | 数値 |
| `best:set` | 数値 | なし。`best.json` に書く |
| `app:quit` | なし | なし。`app.quit()` |

### `--smoke` モード

自動検証の入口。ウィンドウを通常どおり作って `index.html` を読み込み、`did-finish-load` の 300ms 後に次を行い、終了する。

1. `const tiles = await win.webContents.executeJavaScript('document.querySelectorAll(".tile").length')`
2. `const hud = await win.webContents.executeJavaScript('document.querySelector(".best").textContent')`
3. `const [w, h] = win.getContentSize()`
4. stdout に次の 5 行を **この順で、1 行ずつ** 書く（`process.stdout.write` に `\n` を付けて）:
   ```
   SMOKE size=600
   SMOKE window=600x696
   SMOKE tiles=16
   SMOKE best=0
   SMOKE hud=BEST 0
   ```
   `size` は検証済みの設定値、`window` は `getContentSize()`、`best` は `best.json` から読んだ値、`hud` は手順 2 の文字列
5. `tiles === 16` なら `app.exit(0)`、そうでなければ `app.exit(1)`

例外や読み込み失敗で止まらないよう、`did-fail-load` や `unhandledRejection` では `SMOKE error=<内容>` を出して `app.exit(1)` する。

## preload.cjs

```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getBest: () => ipcRenderer.invoke('best:get'),
  setBest: (n) => ipcRenderer.invoke('best:set', n),
  quit: () => ipcRenderer.invoke('app:quit'),
});
```

## renderer.js

1. `const { size } = await window.desktop.getSettings()` → `document.documentElement.style.setProperty('--size', size + 'px')`
2. `const best = await window.desktop.getBest()`、`const rng = createRng(Date.now())`、`let state = createGame(rng, best)`
3. `draw()`: `document.getElementById('app').innerHTML = render(state)`
4. `keydown`: `keyToAction(e.key)` が `null` なら何もしない。`'quit'` なら `window.desktop.quit()`。
   それ以外は `const next = reduce(state, action, rng)`。`next !== state` のときだけ `state = next; draw()`。
   矢印キーは `e.preventDefault()` する（スクロール防止）
5. `state.best` が前回保存した値より大きくなったら `window.desktop.setBest(state.best)`（移動のたびに毎回書かなくてよいが、増えたときは必ず書く）
6. `#app` の `click` を委譲で受け、`event.target.closest('[data-action]')` があれば、その `data-action` を手順 4 と同じ経路で処理する（幕のボタン用）
7. 出現アニメーションは CSS の `.tile.new` に任せる。`render` の出力をそのまま innerHTML に入れれば動く

## style.css（ペーパー案）

すべて `var(--size)` の比率で書く。`--size` はレンダラーが `:root` に設定する（未設定時の既定として `:root { --size: 600px; }` を書いておく）。

- `html, body`: margin 0、`overflow: hidden`、`user-select: none`、背景 `#fbfaf5`、文字色 `#2a2a2a`、`font-family: "Cascadia Mono", Consolas, monospace`
- `#app`: 幅 `var(--size)`、縦に 3 段（hud / boardwrap / foot）を flex column で並べる
- `.hud`: 高さ `calc(var(--size) * 0.11)`、左右 padding `calc(var(--size) * 0.0367)`、flex で `baseline` 揃え。
  `.label` は `calc(var(--size) * 0.02)` の大きさ・`letter-spacing: 0.22em`・色 `#7a766c`。`.label .star` は文字色 `#2a2a2a`。
  `.score` は `flex: 1`、右寄せ、`calc(var(--size) * 0.063)`、`font-weight: 600`、下線 `border-bottom: 2px solid #2a2a2a`。
  `.best` は `calc(var(--size) * 0.025)`、色 `#7a766c`。数字は `font-variant-numeric: tabular-nums`
- `.boardwrap`: `position: relative`、幅・高さ `var(--size)`
- `.board`: `display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(4, 1fr)`、`gap: calc(var(--size) * 0.02)`、`padding: calc(var(--size) * 0.0367)`、`box-sizing: border-box`、幅・高さ `var(--size)`
- `.tile`: 中央揃え（grid + place-items）、`font-weight: 600`、`border-radius: calc(var(--size) * 0.012)`、`line-height: 1`
  - `.tile.empty`: `border: 2px dashed #cfcabd`、背景なし
  - `.tile:not(.empty)`: 既定は `border: 2px solid #2a2a2a; background: #2a2a2a; color: #fbfaf5`（256 以上の「墨」）
  - `.v2, .v4, .v8, .v16`: 背景 `#ffffff`、文字色 `#2a2a2a`
  - `.v32, .v64, .v128`: 背景 `#e9e4d6`、文字色 `#2a2a2a`
  - `.v2048`: 二重枠 `box-shadow: 0 0 0 calc(var(--size) * 0.008) #fbfaf5, 0 0 0 calc(var(--size) * 0.012) #2a2a2a`
  - 文字の大きさ: `.d1, .d2` は `calc(var(--size) * 0.075)`、`.d3` は `0.065`、`.d4` は `0.055`、`.d5` 以上は `0.045`
  - `.tile.new`: `animation: pop 120ms ease-out`（`@keyframes pop { from { transform: scale(0.6); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }`）
- `.veil`: `position: absolute; inset: calc(var(--size) * 0.0367)`（盤面の余白の内側に重ねる）、flex column 中央揃え、`gap: calc(var(--size) * 0.02)`、背景 `rgba(251,250,245,.86)`。`.veil.over` は `rgba(233,228,214,.9)`
  - `.title`: `calc(var(--size) * 0.10)`、`font-weight: 600`
  - `.sub`: `calc(var(--size) * 0.025)`、色 `#5d5a53`
  - `.btn`: `calc(var(--size) * 0.028)`、`font-weight: 600`、`border: 2px solid #2a2a2a`、背景 `#ffffff`、`padding: 0.5em 1.4em`、`cursor: pointer`、フォントは body と同じ。`.btn.primary` は背景 `#2a2a2a`・文字 `#fbfaf5`。`:focus-visible` に見える枠を付ける
- `.foot`: 高さ `calc(var(--size) * 0.05)`、左右 padding `calc(var(--size) * 0.0367)`、`display: flex; justify-content: space-between; align-items: center`、`calc(var(--size) * 0.02)`、色 `#7a766c`、`letter-spacing: 0.08em`
- `@media (prefers-reduced-motion: reduce) { .tile.new { animation: none; } }`

## やってはいけないこと

- `test/`、`src/*.mjs`、`package.json` の `devDependencies` の変更、削除
- `node_modules/` の中を変更する
- ネットワークアクセス（外部 URL の参照を含む）
- `app/` 以外への新規ファイル作成（進捗メモへの追記は除く）
- スモークで実行時に `%APPDATA%` の実ファイルへ書く（テストは必ず `--user-data` を渡す。自分で試すときも一時ディレクトリを渡すこと）
