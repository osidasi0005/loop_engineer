# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

やったこと:
- `src/contract.mjs` を新規作成。`TRUNCATE_DEFAULT_MAX = 20` / `ELLIPSIS = '…'` / `WORD_SEPARATOR = /\s+/` の 3 つを export し、各 export に 1 行の JSDoc を付けた。
- `node --test test/contract.test.mjs` をローカル実行 → 3 pass / 0 fail。

分かったこと:
- 直前の FAIL は `src/contract.mjs` が存在しないことによる `ERR_MODULE_NOT_FOUND` のみだった（`src/` は空ディレクトリだった）。
- テストは `WORD_SEPARATOR` が `RegExp` インスタンスであることと、`'a  b\tc\nd'.split(WORD_SEPARATOR)` が `['a','b','c','d']` になることを検証する。`/\s+/` で満たせる（グローバルフラグは不要）。
- 依存追加・`test/` の変更はなし。作成したファイルは仕様どおり 1 つだけ。

次にやるべきこと:
- ランナーの検証結果を待つ。PASS ならこのタスクは完了。
- 後続タスクは `./contract.mjs` からこの 3 つを import するため、名前・値は変更しないこと。


- [ランナー] 反復 1: 検証 FAIL → エージェント 7 ターン / $0.3333

### 反復 2

やったこと:
- 完了条件の確認のみ（コード変更なし）。
  1. `node --test test/contract.test.mjs` を再実行 → 3 pass / 0 fail（ランナー検証も PASS）。
  2. 依存追加なし（`package.json` も `node_modules` も存在しない）。
  3. `test/` 未変更（反復 1 のコミット 06dc2d7 の変更は `src/contract.mjs` と `PROGRESS.md` の 2 ファイルのみ）。
  4. 3 つの export すべてに 1 行 JSDoc あり。
- 作成ファイルは `src/contract.mjs` のみで、仕様どおり。

分かったこと:
- 反復 1 の成果物はそのまま完了条件をすべて満たしており、追加作業は不要だった。
- 反復 1 の「検証 FAIL」表示はエージェント実行前の検証結果を指しており、実装後の検証は PASS。

次にやるべきこと:
- このタスクは完了。以後 `TRUNCATE_DEFAULT_MAX` / `ELLIPSIS` / `WORD_SEPARATOR` の名前・値は変更しない（後続タスクが `./contract.mjs` から import する）。

- [ランナー] 反復 2: 検証 PASS → エージェント 7 ターン / $0.3545 / 完了宣言あり
