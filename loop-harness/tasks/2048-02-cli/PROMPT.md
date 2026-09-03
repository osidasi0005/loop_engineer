# タスク仕様: 2048 ターミナル UI

`src/cli.mjs` に、`src/game.mjs`（実装済み。変更しない）を使ったターミナル版 2048 を実装する。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する（`test/game.test.mjs` と `test/cli.test.mjs` の両方）
2. 依存パッケージを追加しない（Node 標準機能のみ）
3. `test/` 配下と `src/game.mjs` を変更しない
4. `render` が純関数で、引数を破壊的に変更しない
5. 引数なしで `node src/cli.mjs` を起動すると矢印キーで操作でき、`q` で終了する（自動検証できないため、実装後にコードを読み返して手順どおり動くことを確認し、進捗メモに確認内容を書く）

## 仕様の詳細

### `render(board, score)` （named export）

文字列を返す純関数。改行は `\n`、末尾に改行を付けない。

- 1 行目: `Score: <score>`
- 2〜5 行目: 盤面の各行。各セルは幅 5 の右寄せ（`String(v).padStart(5)`）、空きマス（0）は `.`。セル間に区切り文字は入れない

例:

```
Score: 12
    2    .    4    .
    .    .    .    .
   16  128    . 2048
    .    .    .    .
```

### 非対話モード: `node src/cli.mjs --seed <整数> --moves <文字列>`

自動検証の入口。対話せずに次の手順を実行し、最後に `render(board, score)` と改行 1 つを stdout に出力して exit 0 で終了する。

1. `rng = createRng(seed)` を作る
2. 空盤面に `spawn` を 2 回適用して初期盤面にする
3. `--moves` の各文字を順に処理する。`L`=left, `R`=right, `U`=up, `D`=down
   - 処理前に `canMove(board)` が `false` なら、残りの手を無視して終了する
   - `slide` の結果 `moved` が `false` なら、その手は何もしない（spawn もしない、rng も消費しない）
   - `moved` が `true` なら、`board` を更新し、`spawn(board, rng)` を 1 回適用し、`score += gained`
4. render 結果を出力

エラー処理:

- `--moves` に `L R U D` 以外の文字が含まれる場合、stderr にメッセージを出し exit 1。stdout には何も出さない
- `--seed` が整数に変換できない場合も exit 1

### 対話モード: `node src/cli.mjs`（引数なし）

- `--seed` が無ければ `Date.now()` を種にする
- 起動時に盤面を描画し、矢印キー（↑↓←→）で `slide` + `spawn`、描画を更新する
- `q` または Ctrl+C で終了する
- 動けなくなったら `Game Over` を、2048 を作ったら `You Win!` を盤面の下に表示する（ゲームは続行してよい）
- 入力は `node:readline` の `emitKeypressEvents` と `process.stdin.setRawMode(true)` を使う。stdin が TTY でない場合は raw mode を使わず、その旨を表示して終了する

### ファイル構成

- `src/cli.mjs` の 1 ファイルのみ。`import.meta.url` と `process.argv[1]` を比較して直接実行されたときだけ main を動かし、テストから `render` を import しても副作用が起きないようにする

## やってはいけないこと

- `test/` と `src/game.mjs` の変更、削除
- ネットワークアクセス
- `src/cli.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
