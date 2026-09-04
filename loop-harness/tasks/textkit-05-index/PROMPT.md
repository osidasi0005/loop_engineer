# タスク仕様: textkit — 05 統合（index）

3 つのモジュールと契約を 1 つの入口から使えるようにし、要約関数を足す。Wave 3（統合）。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する（統合テストと回帰）
2. 依存パッケージを追加しない
3. `test/` と既存の `src/*.mjs` を変更しない
4. export 関数に 1〜3 行の JSDoc がある

## 作成するファイル

- `src/index.mjs`

## 型定義・シグネチャ

```js
export { slugify } from './slugify.mjs';
export { wordCount } from './wordcount.mjs';
export { truncate } from './truncate.mjs';
export { TRUNCATE_DEFAULT_MAX, ELLIPSIS, WORD_SEPARATOR } from './contract.mjs';
export function summarize(text: string): { slug: string; words: number; title: string }
```

## 仕様

- `summarize` は `slug = slugify(text)`、`words = wordCount(text)`、`title = truncate(text)`（既定最大長）

## import 先

- `./slugify.mjs`, `./wordcount.mjs`, `./truncate.mjs`, `./contract.mjs`（すべて前の Wave で実装済み。変更しない）

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
