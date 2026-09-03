# タスク仕様: 迷路追いかけゲーム 03 — ゲーム進行

`src/maze.mjs`、`src/rng.mjs`、`src/ghost.mjs`（実装済み。変更しない）を使い、
ゲーム全体の状態と 1 ティック進める関数を `src/game.mjs` に純関数で実装する。I/O は行わない。

## 完了条件（すべて満たすこと）

1. `node --test test/maze.test.mjs test/ghost.test.mjs test/game.test.mjs` がすべて PASS する
2. 依存パッケージを追加しない（Node 標準機能のみ）
3. `test/` と既存の `src/*.mjs` を変更しない
4. `createGame` と `step` が純関数で、引数を破壊的に変更しない
5. 各 export 関数に 1〜3 行の JSDoc コメントがある

## 仕様の詳細

### 定数（export する）

```
PELLET_SCORE = 10    通常の餌
POWER_SCORE  = 50    パワー餌
GHOST_SCORE  = 200   逃走中の敵を捕まえた
FRIGHT_TICKS = 30    逃走の長さ
SCATTER_TICKS = 20   散開モードの長さ
CHASE_TICKS  = 60    追跡モードの長さ
START_LIVES  = 3
```

### 状態

```
{
  maze,            // parseMaze の戻り値そのまま
  pellets,         // 現在の餌 pellets[y][x]
  player: { x, y, dir },              // dir は進行方向。開始時 null
  ghosts: [{ x, y, dir, mode, start: {x,y}, corner: {x,y} }],
  score, lives, tick,
  mode,            // 全体モード 'scatter' | 'chase'。開始時 'scatter'
  modeTimer,       // 全体モードの残りティック。開始時 SCATTER_TICKS
  frightenedTimer, // 逃走の残りティック。0 なら逃走中でない
  status,          // 'playing' | 'won' | 'lost'
}
```

### `createGame(lines)`

`parseMaze(lines)` から初期状態を作る。敵は `maze.ghosts` の順に、`dir: null`、`mode: 'scatter'`、`start` は開始座標、
`corner` は `[右上, 左上, 右下, 左下]` を順番に割り当てる（5 体目以降は先頭に戻る）。
右上は `{x: width-1, y: 0}`、左上は `{x: 0, y: 0}`、右下は `{x: width-1, y: height-1}`、左下は `{x: 0, y: height-1}`。
`score: 0, lives: START_LIVES, tick: 0, mode: 'scatter', modeTimer: SCATTER_TICKS, frightenedTimer: 0, status: 'playing'`。

### `step(state, input, rng)`

`input` は `'up' | 'left' | 'down' | 'right' | null`。`rng` は `() => number`。新しい状態を返す。**この順序で処理する**:

1. `status` が `'playing'` でなければ、状態をそのまま返す（同じ内容）
2. **自機の移動**: `want = input ?? player.dir`。`want` があり、その方向が壁でなければ進み `player.dir = want`。
   そうでなく `player.dir` があり壁でなければそちらへ進む。どちらも駄目なら止まる（`dir` は変えない）
3. **餌**: 進んだ先の餌を取る。`1` なら `score += PELLET_SCORE`。`2` なら `score += POWER_SCORE`、`frightenedTimer = FRIGHT_TICKS`、
   すべての敵を `setMode(ghost, 'frightened')`（進行方向が反転する）
4. **衝突判定 A**: 自機と同じマスに敵がいれば「衝突処理」。残機が減った場合は 5〜6 を飛ばして 7 へ
5. **敵の移動**: 各敵について `target = targetFor(ghost.mode, player, ghost.corner)` を求め、`moveGhost(maze, ghost, target, rng)`。
   敵は `ghosts` の順に処理し、`rng` はこの順で消費する
6. **衝突判定 B**: もう一度、自機と同じマスの敵を「衝突処理」。残機が減った場合はそのまま 7 へ
7. **タイマー**: `frightenedTimer > 0` なら 1 減らし、0 になったら逃走中の敵すべてを `mode = state.mode`（全体モード）に戻す（**反転しない**）。
   `frightenedTimer` が 0 のときだけ `modeTimer` を 1 減らし、0 になったら全体モードを切り替える
   （`scatter → chase` なら `modeTimer = CHASE_TICKS`、`chase → scatter` なら `SCATTER_TICKS`）。切り替え時、逃走中でない敵すべてを `setMode(ghost, 新モード)`（反転する）
8. **勝利**: `status` が `'playing'` で `countPellets(pellets) === 0` なら `status = 'won'`
9. `tick += 1`

**衝突処理**（同じマスにいる敵ごとに）:

- 敵が `frightened` なら: `score += GHOST_SCORE`、その敵を `{ x: start.x, y: start.y, dir: null, mode: state.mode }` に戻す（`start`, `corner` は保つ）
- それ以外なら: `lives -= 1`。`lives === 0` なら `status = 'lost'`。
  そうでなければ自機を `{ x: maze.player.x, y: maze.player.y, dir: null }` に、すべての敵を開始位置（`dir: null, mode: state.mode`）に戻し、`frightenedTimer = 0`

## やってはいけないこと

- `test/` と既存の `src/*.mjs` の変更、削除
- ネットワークアクセス
- `src/game.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
- 描画や入力処理の実装（次のタスクで行う）
