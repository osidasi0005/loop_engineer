# タスク仕様: textkit — 07 truncate を単語境界で切る

実装済みの `truncate` を拡張し、単語の途中で切らないようにする。既存の textkit の上に載せる拡張タスク。

## 完了条件（すべて満たすこと）

1. `node --test test-experiments/truncate-words.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` と `src/contract.mjs` を変更しない
4. export 関数に 1〜3 行の JSDoc がある

## 変更するファイル

- `src/truncate.mjs`（既存。この 1 ファイルだけを変更する）

## 型定義・シグネチャ

```js
export function truncate(text: string, max?: number): string   // シグネチャは変えない。max の既定は TRUNCATE_DEFAULT_MAX
```

## 仕様

- `text.length <= max` ならそのまま返す（従来どおり）
- 超える場合は、`max - ELLIPSIS.length` 文字以内に収まる **最後の単語区切り**（契約の `WORD_SEPARATOR`）の直前までを残し、末尾に `ELLIPSIS` を付ける
  - 例: `truncate('Hello Wonderful World', 12)` → `'Hello…'`（`'Hello Wonde'` の途中で切らない）
  - 例: `truncate('Hello Wonderful World', 17)` → `'Hello Wonderful…'`

## import 先（既存コード）

- `./contract.mjs` → `TRUNCATE_DEFAULT_MAX`, `ELLIPSIS`, `WORD_SEPARATOR`

## 実装パターン

- 既存の `src/truncate.mjs` を読み、その構造を保ったまま切る位置の決め方だけを変える

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「変更するファイル」以外のファイルの作成・変更（進捗メモへの追記は除く）
