# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

やったこと:
- `src/wordcount.mjs` を新規作成。`./contract.mjs` から `WORD_SEPARATOR` を import し、`text.trim()` が空なら 0、そうでなければ `trimmed.split(WORD_SEPARATOR).length` を返す実装。JSDoc（3 行）付き。
- `node --test test/contract.test.mjs test/wordcount.test.mjs` をローカル実行 → 7 pass / 0 fail。

分かったこと:
- 直前の FAIL の原因は `src/wordcount.mjs` が存在しないこと（ERR_MODULE_NOT_FOUND）だけだった。
- `WORD_SEPARATOR` は `/\s+/`。trim してから split すれば先頭末尾の空白・連続空白・改行/タブがすべて仕様どおりに扱える。空文字は split すると `['']` で length 1 になるため、trim 後の空判定が必須。
- 依存追加・`test/`・`src/contract.mjs` の変更はなし。

次にやるべきこと:
- ランナーの検証結果を待つ。PASS なら作業完了。FAIL なら出力を見て再調査。


- [ランナー] 反復 1: 検証 FAIL → エージェント 7 ターン / $0.3426
