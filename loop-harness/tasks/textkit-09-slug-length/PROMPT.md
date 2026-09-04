# タスク仕様: textkit — 09 スラッグの最大長

`slugify` の結果を最大 50 文字に制限する。既存の textkit の上に載せる拡張タスク。

## 完了条件（すべて満たすこと）

1. `node --test test/slug-length.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` を変更しない
4. 追加・変更した export に 1〜3 行の JSDoc がある

## 変更するファイル

- `src/contract.mjs`（既存。定数 `MAX_SLUG_LENGTH` を追加する）
- `src/slugify.mjs`（既存。切り詰めを追加する）

## 型定義・シグネチャ

```js
// contract.mjs に追加
export const MAX_SLUG_LENGTH = 50;   // スラッグの最大文字数

// slugify.mjs（シグネチャは変えない）
export function slugify(text: string): string
```

## 仕様

- 従来の変換（小文字化・結合文字除去・非英数字をハイフンに・先頭末尾のハイフン除去）を行った後、
  結果が `MAX_SLUG_LENGTH` を超えていれば先頭 `MAX_SLUG_LENGTH` 文字に切り詰める
- 切り詰めた結果の末尾がハイフンなら、それを除く（末尾のハイフンが無くなるまで）
- 50 文字以内の結果は従来と完全に同じ

## import 先（既存コード）

- `src/slugify.mjs` から `./contract.mjs` → `MAX_SLUG_LENGTH`

## 実装パターン

- 既存の `src/contract.mjs` の定数と同じ書き方（1 行 JSDoc + `export const`）
- 既存の `src/slugify.mjs` のメソッドチェーンの後ろに切り詰めを足す

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「変更するファイル」以外のファイルの作成・変更（進捗メモへの追記は除く）
