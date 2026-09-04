# タスク仕様: textkit — 01 契約（共有定数）

小さなテキスト処理ライブラリ textkit の、他モジュールが参照する **共有定数** を定義する。Wave 1（契約先行）。

## 完了条件（すべて満たすこと）

1. `node --test test/contract.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` を変更しない
4. 各 export に 1 行の JSDoc がある

## 作成するファイル

- `src/contract.mjs`

## 型定義・シグネチャ

```js
export const TRUNCATE_DEFAULT_MAX = 20;   // truncate の既定最大長
export const ELLIPSIS = '…';              // 省略記号（1 文字）
export const WORD_SEPARATOR = /\s+/;      // 単語区切り（空白の連続）
```

## import 先

なし（このモジュールが他から import される側）

## 注意事項

- 後続タスクは `./contract.mjs` から上記 3 つを import する。名前を変えないこと

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
