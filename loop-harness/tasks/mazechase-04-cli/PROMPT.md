# タスク仕様: 迷路追いかけゲーム 04 — ターミナル UI

`src/game.mjs` ほか（実装済み。変更しない）を使い、ターミナルで遊べる UI を `src/cli.mjs` に実装する。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する
2. 依存パッケージを追加しない（Node 標準機能のみ）
3. `test/` と既存の `src/*.mjs` を変更しない
4. `render` が純関数で、引数を破壊的に変更しない
5. 引数なしで `node src/cli.mjs` を起動すると矢印キーで操作でき、敵は入力が無くても動き、`q` で終了する
   （自動検証できないため、実装後にコードを読み返して手順どおり動くことを確認し、進捗メモに確認内容を書く）

## 仕様の詳細

### `DEFAULT_MAZE`（named export）

文字列の配列。`parseMaze` できること。幅 15 以上、高さ 9 以上、敵 2 体以上、餌 50 個以上。
自機の開始位置の近くに敵を置かない。左右対称で、行き止まりが少ない環状の通路にする。
パワー餌 `o` を四隅付近に 4 つ置く。

### `render(state)`（named export）

文字列を返す純関数。改行は `\n`、末尾に改行を付けない。

- 1 行目: `Score: <score>  Lives: <lives>`（空白 2 つ区切り）
- 続く `height` 行: 盤面。壁 `#`、餌 `.`、パワー餌 `o`、床 ` `、敵 `G`（逃走中は小文字 `g`）、自機 `@`。
  自機と敵が同じマスなら `@` を描く
- `status` が `'won'` なら最後に `You Win!` の行、`'lost'` なら `Game Over` の行を足す

### 非対話モード: `node src/cli.mjs --seed <整数> --inputs <文字列>`

自動検証の入口。対話せずに実行し、最後に `render(state)` と改行 1 つを stdout に出力して exit 0 で終了する。

1. `rng = createRng(seed)`、`state = createGame(DEFAULT_MAZE)`
2. `--inputs` の各文字を 1 ティックの入力として順に `step(state, input, rng)`。`U`=up, `D`=down, `L`=left, `R`=right, `.`=null（入力なし）
3. 全文字を処理したら出力（途中で `won` / `lost` になっても `step` は同じ状態を返すので、そのまま最後まで処理してよい）

エラー処理:

- `--inputs` に `U D L R .` 以外の文字が含まれる場合、stderr にメッセージを出し exit 1。stdout には何も出さない
- `--seed` が整数に変換できない場合も exit 1

### 対話モード: `node src/cli.mjs`（引数なし、または `--seed` のみ）

- `--seed` が無ければ `Date.now()` を種にする
- `setInterval` で 125 ミリ秒ごとに `step(state, input, rng)` を呼び、画面を描き直す。`input` はその間に押された最後の矢印キー（無ければ null）。使ったら null に戻す
- 描画は ANSI エスケープ（`\x1b[2J\x1b[H`）で画面を消してから `render(state)` を書く。最後に `矢印キーで移動 / q で終了` の案内行を足す
- `q` または Ctrl+C で `setInterval` を止め、raw mode を戻して終了する
- `won` / `lost` になったら描画を止め、案内行に `Enter で終了` を出し、Enter か `q` で終了する
- 入力は `node:readline` の `emitKeypressEvents` と `process.stdin.setRawMode(true)` を使う。stdin が TTY でない場合は raw mode を使わず、その旨を表示して exit 0 で終了する

### ファイル構成

- `src/cli.mjs` の 1 ファイルのみ。`import.meta.url` と `process.argv[1]` を比較して直接実行されたときだけ main を動かし、テストから `render` や `DEFAULT_MAZE` を import しても副作用が起きないようにする

## やってはいけないこと

- `test/` と既存の `src/*.mjs` の変更、削除
- ネットワークアクセス
- `src/cli.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
