# タスク仕様: textkit — 04 truncate

長い文字列を最大長に収める純関数を実装する。Wave 2（他モジュールと並列）。

## 完了条件（すべて満たすこと）

1. `node --test test/contract.test.mjs test/truncate.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` と `src/contract.mjs` を変更しない
4. export 関数に 1〜3 行の JSDoc がある

## 作成するファイル

- `src/truncate.mjs`

## 型定義・シグネチャ

```js
export function truncate(text: string, max?: number): string   // max の既定は TRUNCATE_DEFAULT_MAX
```

## 仕様

- `text.length <= max` ならそのまま。超えるなら省略記号込みで長さが max になるよう切り詰め、末尾に `ELLIPSIS`

## import 先

- `./contract.mjs` → `TRUNCATE_DEFAULT_MAX`, `ELLIPSIS`

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
