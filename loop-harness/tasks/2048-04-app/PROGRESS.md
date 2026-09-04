# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

やったこと:
- `app/` 配下に `main.cjs`・`preload.cjs`・`index.html`・`renderer.js`・`style.css` を仕様どおり新規作成した（それまで `app/` は存在しなかった）。
- `main.cjs`: `--user-data` / `--smoke` の引数解釈、`settings.json`（既定 600、範囲外・非整数は 600 扱いでファイルは書き換えない）、`best.json`、固定サイズ・`contextIsolation` のウィンドウ生成、IPC 4 種、`--smoke` モード（`did-finish-load` の 300ms 後に `SMOKE size=` `window=` `tiles=` `best=` `hud=` を出力して `app.exit`）を実装。
- `renderer.js` はキー入力（矢印/WASD/N/Enter/Q・Esc）と `[data-action]` クリック委譲を実装し、`reduce` の結果が変われば再描画、`best` 更新時のみ `desktop.setBest` を呼ぶ。
- `style.css` は仕様の「ペーパー案」の寸法・色をすべて `var(--size)` 比率で実装。

分かったこと:
- 最初 `renderer.js` で `createGame` を `src/game.mjs` から import していたが、実際は `src/view.mjs` のエクスポートだった（`game.mjs` は `slide/spawn/createRng/canMove/hasWon` のみ）。これが原因でレンダラーがロード時に `SyntaxError` を起こし、smoke テストが exit 1 になっていた。`view.mjs` から `createGame` を import するよう修正して解消。
- 開発機のディスプレイ拡大率が 125%（scaleFactor 1.25）だと、`BrowserWindow` のコンストラクタに `useContentSize: true` を渡しただけでは `getContentSize()` が期待値から数 px ズレる（600x696 のはずが 602x695 等）。`Menu.setApplicationMenu(null)` の直後に `mainWindow.setContentSize(size, height)` を明示的に呼び直すことでズレが解消し、`SMOKE window=600x696` / `400x464` とも仕様どおりになった。
- デバッグ時に一時的なスクリプト（`scratch_run.mjs` など）をリポジトリ直下に作ってしまったが、`app/` 以外への新規ファイル作成禁止のルールに反するため作業完了前にすべて削除済み（`git status --porcelain` で `app/` と無関係の `loop-harness/tasks/2048-05-build/`（既存の未追跡ディレクトリ、自分では作成していない）以外に変更がないことを確認した）。
- `node --test "test/**/*.test.mjs"` は 65 件すべて PASS（`test/`・`src/*.mjs`・`package.json` は無変更、`git diff --stat` も差分なし）。
- 完了条件 5（引数なし起動での操作性）は自動検証できないためコードを読み返して確認: `renderer.js` の `keydown` ハンドラで `keyToAction` により 矢印/WASD→移動、N→新規、Q・Escape→`desktop.quit()`（IPC 経由で `app.quit()`）に正しく分岐しており、矢印キーのみ `preventDefault()` される。`reduce` の戻り値が同一オブジェクトでない時だけ再描画し、`best` が伸びた時だけ `setBest` を呼ぶ実装になっている。実機での目視確認（`npx electron .` の実起動）はこの反復では未実施。

次にやるべきこと:
- ランナーの検証（`node --test`）が PASS することを確認する。PASS していれば、可能であれば `npx electron .`（引数なし）を実際に起動して、矢印キー/WASD でタイルが動く、N で新規、Q/Esc で終了することを目視確認するとより確実。
- 現時点で追加の実装作業は残っていない認識だが、次の反復で検証結果が FAIL であれば、そのエラーメッセージをまず読むこと。

- [ランナー] 反復 1: 検証 FAIL → エージェント 49 ターン / $1.1246
