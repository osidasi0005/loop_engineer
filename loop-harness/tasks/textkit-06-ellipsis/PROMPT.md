# タスク仕様: textkit — 06 省略記号を ASCII の ... に変更

省略記号を 3 点リーダー 1 文字 `…` から ASCII の 3 文字 `...` に変更する。既存の textkit の上に載せる変更タスク。

## 完了条件（すべて満たすこと）

1. `node --test test-experiments/ellipsis.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` を変更しない
4. 各 export の JSDoc を保つ

## 変更するファイル

- `src/contract.mjs`（既存。`ELLIPSIS` の値だけを変える）

## 型定義・シグネチャ

```js
export const ELLIPSIS = '...';   // 変更前は '…'。名前は変えない
```

## 仕様

- `truncate` は `ELLIPSIS` を import して「省略記号込みで最大長に収める」実装になっているので、契約の値を変えるだけで
  `truncate('abcdefghij', 6)` → `'abc...'` になる。`src/truncate.mjs` は変更しない

## import 先（既存コード）

なし（契約そのものを変える）

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「変更するファイル」以外のファイルの作成・変更（進捗メモへの追記は除く）
