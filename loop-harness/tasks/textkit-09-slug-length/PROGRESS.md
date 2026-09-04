# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

やったこと:
- `src/contract.mjs` に `/** スラッグの最大文字数 */ export const MAX_SLUG_LENGTH = 50;` を既存定数と同じ書き方で追加。
- `src/slugify.mjs` で `./contract.mjs` から `MAX_SLUG_LENGTH` を import し、既存のメソッドチェーンの末尾に `.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')` を追加。JSDoc に切り詰めの 1 行を追記。

分かったこと:
- 失敗の原因は切り詰めが未実装だったこと（60 文字がそのまま返っていた）。
- `.replace(/-+$/, '')` は貪欲マッチなので末尾のハイフンが連続していても 1 回で全部落ちる。既存の `^-+|-+$` 除去のあとに切るので、50 文字以内の入力は `slice` も `replace` も無変化＝従来と完全に同じ。
- `node --test test/slug-length.test.mjs` は 3 件 PASS。`node --test "test/*.test.mjs"` で既存分も含め 20 件すべて PASS（回帰なし）。
- Windows の PowerShell では `node --test test/` はディレクトリを解決できずエラーになる。glob を明示する必要がある。

次にやるべきこと:
- ランナーの検証結果を待つ。PASS ならこのタスクは完了。


- [ランナー] 反復 1: 検証 FAIL → エージェント 12 ターン / $0.5032

### 反復 2

やったこと:
- コード変更はなし。反復 1 の実装がそのまま残っていることを確認し、完了条件を 1 つずつ検証した。
  1. `node --test test/slug-length.test.mjs` → ランナー検証 PASS（3 件）。手元でも `node --test "test/*.test.mjs"` で 20 件すべて PASS。
  2. 依存パッケージ追加なし（`examples/textkit` に package.json 自体が存在せず、`git status` もクリーン）。
  3. `test/` は未変更（直前コミットの差分は `src/contract.mjs` / `src/slugify.mjs` / PROGRESS.md の 3 ファイルのみ）。
  4. 追加・変更した export に JSDoc あり（`MAX_SLUG_LENGTH` に 1 行、`slugify` に切り詰めの説明を含む 5 行）。

分かったこと:
- 反復 1 の変更はコミット 0261f45 に含まれており、作業ツリーはクリーン。追加作業は不要だった。
- `test-experiments/` には別タスク（06-ellipsis / truncate-words）向けの未実装機能テストがあり FAIL するが、このタスクの検証コマンド（`test/slug-length.test.mjs`）にも完了条件にも含まれないため対象外。仕様の「変更するファイル」外なので手を入れない。

次にやるべきこと:
- なし。完了条件 4 つをすべて満たしているため COMPLETE とした。

- [ランナー] 反復 2: 検証 PASS → エージェント 9 ターン / $0.4753 / 完了宣言あり
