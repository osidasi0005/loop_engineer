# タスク仕様: textkit — 03 wordCount

単語数を数える純関数を実装する。Wave 2（他モジュールと並列）。

## 完了条件（すべて満たすこと）

1. `node --test test/contract.test.mjs test/wordcount.test.mjs` が PASS する
2. 依存パッケージを追加しない
3. `test/` と `src/contract.mjs` を変更しない
4. export 関数に 1〜3 行の JSDoc がある

## 作成するファイル

- `src/wordcount.mjs`

## 型定義・シグネチャ

```js
export function wordCount(text: string): number
```

## 仕様

- 区切りは契約の `WORD_SEPARATOR`。先頭末尾の空白は数えない。空文字と空白だけの文字列は 0

## import 先

- `./contract.mjs` → `WORD_SEPARATOR`

## やってはいけないこと

- `test/` の変更・削除、依存パッケージの追加、ネットワークアクセス
- 「作成するファイル」以外への新規ファイル作成（進捗メモへの追記は除く）
- 他のタスクが担当するファイルの作成・変更
