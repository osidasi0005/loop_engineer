# タスク仕様: 2048 デスクトップ版 03 — ゲーム状態と HTML 描画（純関数）

`src/view.mjs` に、`src/game.mjs`（実装済み。変更しない）を使って、
デスクトップ版 2048 の「ゲーム状態の更新」と「状態 → HTML 文字列」を純関数として実装する。
このモジュールは後のタスクで Electron のレンダラーから import される。DOM や `window` には触れない。

## 完了条件（すべて満たすこと）

1. `node --test "test/**/*.test.mjs"` がすべて PASS する（`test/view.test.mjs` を含む既存テストすべて）
2. 依存パッケージを追加しない（`package.json` を変更しない）
3. `test/` 配下、`src/game.mjs`、`src/cli.mjs` を変更しない
4. すべての export が純関数で、引数を破壊的に変更しない
5. `src/view.mjs` の中で `document` / `window` / `process` / `require` を参照しない

## 状態オブジェクト

```js
{
  board: number[][],   // 4x4、空きは 0（game.mjs と同じ）
  score: number,
  best: number,        // 過去最高。score が超えたら同時に更新する
  phase: 'playing' | 'won' | 'over',
  achieved: boolean,   // このゲームで 2048 を一度でも作ったか（won → continue の後も true のまま）
  spawned: [row, col] | null,  // 直前の移動で新しく置かれたタイルの位置（出現アニメーション用）
}
```

## named export（すべて必須）

### `formatScore(n)`

整数を 3 桁ごとにカンマ区切りの文字列にする。`9856` → `'9,856'`、`0` → `'0'`。

### `createGame(rng, best = 0)`

空盤面に `spawn(board, rng)` を 2 回適用した盤面で、`{ board, score: 0, best, phase: 'playing', achieved: false, spawned: null }` を返す。

### `reduce(state, action, rng)`

新しい状態を返す。`action` は `'left' | 'right' | 'up' | 'down' | 'continue' | 'new' | 'quit'`。それ以外は `Error` を投げる。

- `'new'`: どの phase でも `createGame(rng, state.best)` を返す
- `'quit'`: 何もしない。**同じオブジェクト**（`state` そのもの）を返す（終了処理はレンダラー側の仕事）
- `'continue'`:
  - `phase === 'won'` のとき: `phase` を `'playing'` にした新しい状態を返す。ただし `canMove(board)` が `false` なら `'over'` にする。他のフィールドは変えない（`achieved` は `true` のまま）
  - それ以外の phase: 同じオブジェクトを返す
- 移動（`'left' | 'right' | 'up' | 'down'`）:
  - `phase !== 'playing'` なら同じオブジェクトを返す（rng を呼ばない）
  - `slide(board, action)` の `moved` が `false` なら同じオブジェクトを返す（rng を呼ばない）
  - `moved` が `true` なら:
    1. `next = spawn(slid.board, rng)`（rng はこの 1 回の spawn でだけ消費する）
    2. `spawned` = `slid.board` では 0 で `next` では 0 でないマスの `[row, col]`
    3. `score = state.score + slid.gained`、`best = Math.max(state.best, score)`
    4. `phase`: `!state.achieved && hasWon(next)` なら `'won'`（同時に `achieved = true`）。
       そうでなく `!canMove(next)` なら `'over'`。それ以外は `'playing'`
    5. `achieved` は上記で `true` になった場合を除き `state.achieved` を引き継ぐ

「同じオブジェクトを返す」場合はコピーを作らず `state` をそのまま返すこと（テストは `===` で比較する）。

### `keyToAction(key)`

`KeyboardEvent.key` の値を操作に変換する。該当なしは `null`。

| key | 操作 |
|---|---|
| `ArrowLeft`, `a`, `A` | `'left'` |
| `ArrowRight`, `d`, `D` | `'right'` |
| `ArrowUp`, `w`, `W` | `'up'` |
| `ArrowDown`, `s`, `S` | `'down'` |
| `n`, `N` | `'new'` |
| `Enter` | `'continue'` |
| `q`, `Q`, `Escape` | `'quit'` |

### `render(state)`

HTML 文字列を返す。**1 要素 1 行**で `\n` 結合し、末尾に改行を付けない。行の並びは次のとおり。

```
<div class="hud"><span class="label">SCORE</span><span class="score">9,856</span><span class="best">BEST 14,320</span></div>
<div class="boardwrap">
<div class="board">
<div class="tile v2 d1">2</div>            ← 16 行。row-major（board[0][0], board[0][1], …, board[3][3]）
<div class="tile empty"></div>
…
</div>
[veil 行: phase が won / over のときだけ 1 行]
</div>
<div class="foot"><span>ARROWS / WASD: MOVE</span><span>N: NEW · Q: QUIT</span></div>
```

- hud: `score` と `best` は `formatScore` で整形。`achieved` が `true` なら label を `<span class="label">SCORE<span class="star">★</span></span>` にする
- タイル: 値 `v` のクラスは `tile v<v> d<桁数>`（例: `tile v128 d3`）。`phase` が `playing` で、そのマスが `spawned` と一致するときは末尾に ` new` を足す（例: `tile v4 d1 new`）。`won` / `over` では `spawned` があっても ` new` を付けない（幕の下で出現アニメーションを動かさない）。空きは `<div class="tile empty"></div>`
- veil（`</div>`（board の閉じ）の直後、boardwrap の閉じの前）:
  - `won`: `<div class="veil won"><div class="title">2048!</div><button class="btn primary" data-action="continue">続ける　Enter</button><button class="btn" data-action="new">新しいゲーム　N</button></div>`
  - `over`: `<div class="veil over"><div class="title">Game Over</div><div class="sub">41,220 点</div><button class="btn primary" data-action="new">もう一度　N</button></div>`。
    `score > 0` かつ `score === best` のときは sub を `41,220 点・最高記録` のように `・最高記録` を付ける
  - ボタンのラベル内の空白は全角スペース（U+3000）1 つ
- foot は phase ごとに固定:
  - `playing`: `<div class="foot"><span>ARROWS / WASD: MOVE</span><span>N: NEW · Q: QUIT</span></div>`（`·` は U+00B7、前後に半角スペース 1 つ）
  - `won`: `<div class="foot"><span>ENTER: CONTINUE</span><span>N: NEW</span></div>`
  - `over`: `<div class="foot"><span>N: NEW</span><span>Q: QUIT</span></div>`

正確な期待文字列は `test/view.test.mjs` に書いてある。迷ったらテストを読むこと。

## ファイル構成

- `src/view.mjs` の 1 ファイルのみ新規作成。`import { slide, spawn, canMove, hasWon } from './game.mjs'` を使う

## やってはいけないこと

- `test/`、`src/game.mjs`、`src/cli.mjs`、`package.json` の変更、削除
- `node_modules/` の中を読む・変更する
- ネットワークアクセス
- `src/view.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
