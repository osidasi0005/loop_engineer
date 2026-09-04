# 進捗メモ

このファイルは反復をまたぐ唯一の「記憶」です。
エージェントは毎回ここを読み、作業の最後に追記します。ランナーも検証結果を 1 行ずつ追記します。

### 反復 1

やったこと:
- `src/view.mjs` を新規作成し、仕様どおりに `formatScore` / `createGame` / `reduce` / `keyToAction` / `render` を実装した。
- `game.mjs` の `slide` / `spawn` / `canMove` / `hasWon` のみを import し、DOM/window/process/require には触れていない。
- `node --test "test/**/*.test.mjs"` をローカルで実行し、55 件すべて PASS を確認した（既存 30 件 + view.test.mjs 25 件）。

分かったこと:
- `render` の「新しく置かれたタイル」の `new` クラスは、`spawned` が一致していても **phase が `playing` のときだけ** 付与する。won/over のテスト（`render(won)` `render(over)`）はどちらも `spawned` を渡しつつ期待値では `new` クラスなしの `tileLines(board, null)` を使っている。最初これを見落として1件だけ失敗した（`renderTiles` 内で `state.phase === 'playing' ? state.spawned : null` として解決）。
- `reduce` の「同じオブジェクトを返す」（quit / playing中のcontinue / phase!==playing中の移動 / moved=false の移動）は必ず `state` をそのまま返す（スプレッドコピーを作らない）こと。テストは `===` で比較している。
- `formatScore` は `n.toLocaleString('en-US')` で仕様どおりの桁区切りが得られた（依存追加なし、Node組み込み）。

次にやるべきこと:
- 特になし。次の検証（ランナー側）で PASS が確認できれば本タスクは完了。もし CI 環境で `toLocaleString` の挙動が異なる場合は自前のカンマ区切り実装に置き換える。

- [ランナー] 反復 1: 検証 FAIL → エージェント 11 ターン / $0.4442
