# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

**やったこと**
- `src/ghost.mjs` を新規作成（前回の FAIL 原因は ERR_MODULE_NOT_FOUND、つまりファイル未作成）。
- `targetFor` / `chooseDirection` / `moveGhost` / `setMode` を純関数で実装。JSDoc も各関数に付与。
- ローカルで `node --test test/maze.test.mjs test/ghost.test.mjs` を実行し 35/35 PASS を確認。

**分かったこと**
- `src/maze.mjs` の `openDirections` が `up, left, down, right` の順を保証するので、距離が同点なら「先に見つかった候補を勝ちのままにする」（`<` 比較で更新）だけで優先順の仕様を満たせる。
- 逆走除外後に候補が空になるのは行き止まりのみ。そのとき返すのは `OPPOSITE[ghost.dir]`（`back` 変数）。
- `dir` が null のとき `OPPOSITE[null]` は undefined になるので、null 判定を先に入れる必要がある。`setMode` でも同様。
- 敵の追加プロパティ（`start`, `corner` など）保持のため、`moveGhost` / `setMode` はスプレッドで返している。同一モードの `setMode` もコピーを返す（入力非破壊）。
- テストは `chooseDirection` を rng 無しでも呼ぶ（chase/scatter）。frightened 以外で rng に触れない実装にしてある。

**次にやるべきこと**
- ランナーの検証結果を確認する。PASS なら本タスクは完了、追加変更は不要。
- 万一 FAIL なら、失敗テスト名から該当関数を特定して修正する（`test/`・`src/maze.mjs`・`src/rng.mjs` は変更禁止）。


- [ランナー] 反復 1: 検証 FAIL → エージェント 8 ターン / $0.4745

### 反復 2

**やったこと**
- 実装は追加変更なし。完了条件 5 項目を 1 つずつ検証しただけ。
- 1) `node --test test/maze.test.mjs test/ghost.test.mjs` を再実行 → 35/35 PASS（fail 0）。
- 2) 依存追加なし: プロジェクト直下は `src/` と `test/` のみで `package.json` も `node_modules` も存在しない。`src/ghost.mjs` の import は `./maze.mjs` だけ。
- 3) 変更禁止ファイル: 反復 1 で新規作成したのは `src/ghost.mjs` のみ。`src/maze.mjs` / `src/rng.mjs` / `test/*` は未編集（mtime も生成時のまま）。
- 4) 純関数性: 4 つの export すべてが引数を破壊せず、`moveGhost` / `setMode` はスプレッドで新オブジェクトを返す。`targetFor` は参照を返すだけで書き換えない。
- 5) JSDoc: 4 関数すべてに説明 1〜2 行 + `@param` / `@returns` を付与済み。

**分かったこと**
- JSDoc の書式は `src/maze.mjs`（変更禁止の参照実装）と読み比べて確認した。あちらも「説明 1〜2 行 + タグ」なので、`src/ghost.mjs` の書き方は同じ流儀に揃っている。
- このリポジトリでは `examples/mazechase/` 一式が git 未追跡（`??`）なので、`git diff` で「変更禁止ファイルを触っていないか」を確認できない。代わりにファイル一覧と mtime、および import 関係で確認するのが確実。
- 作業ディレクトリ外（`tasks/` 配下）は `ls` などのシェル操作がブロックされる。PROGRESS.md は Read / Edit ツールなら読み書きできる。

**次にやるべきこと**
- 本タスク（02 敵の移動）は完了。次は `tasks/mazechase-03-game`（ゲーム進行）へ進む。
- 03 では `src/ghost.mjs` の `moveGhost` / `setMode` / `targetFor` をそのまま呼ぶ想定なので、シグネチャは変えないこと。

- [ランナー] 反復 2: 検証 PASS → エージェント 11 ターン / $0.4919 / 完了宣言あり
