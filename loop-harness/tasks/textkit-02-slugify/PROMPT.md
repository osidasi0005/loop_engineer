# タスク仕様: textkit — 02 slugify

文字列を URL スラッグに変換する純関数を実装する。Wave 2（他モジュールと並列）。

## 完了条件（すべて満たすこと）

1. `node --test test/slugify.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` と `src/contract.mjs` を変更しない
4. export 関数に 1〜3 行の JSDoc がある

## 作成するファイル

- `src/slugify.mjs`

## 型定義・シグネチャ

```js
export function slugify(text: string): string
```

## 仕様

- 小文字化、NFD 正規化で結合文字（U+0300〜U+036F）を除去、英数字以外の連続をハイフン 1 つに、先頭末尾のハイフン除去
- 空文字は空文字

## import 先

なし

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
