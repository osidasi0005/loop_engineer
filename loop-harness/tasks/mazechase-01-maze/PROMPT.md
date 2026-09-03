# タスク仕様: 迷路追いかけゲーム 01 — 迷路と自機

ターミナルで遊ぶ「迷路の餌を全部食べる、敵に捕まらない」ゲームを 4 タスクで作る。
このタスクは土台となる `src/maze.mjs` と `src/rng.mjs` を純関数で実装する。I/O は一切行わない。

## 完了条件（すべて満たすこと）

1. `node --test test/maze.test.mjs` がすべて PASS する
2. 依存パッケージを追加しない（Node 標準機能のみ）
3. `test/` 配下のファイルを変更しない
4. すべての export 関数が純関数で、引数を破壊的に変更しない
5. 各 export 関数に 1〜3 行の JSDoc コメントがある

## 仕様の詳細

座標は `{ x, y }`。`x` が列（左から 0）、`y` が行（上から 0）。二次元配列は `arr[y][x]`。

### `src/rng.mjs`

- `createRng(seed)`: 整数の種から決定的な乱数関数 `() => number`（0 以上 1 未満）を返す。線形合同法など簡単な実装でよい

### `src/maze.mjs`

#### 定数

- `DIRS = { up: {dx:0,dy:-1}, left: {dx:-1,dy:0}, down: {dx:0,dy:1}, right: {dx:1,dy:0} }`（この順序で定義）
- `OPPOSITE = { up:'down', down:'up', left:'right', right:'left' }`

#### `parseMaze(lines)`

`lines` は文字列の配列（1 要素が 1 行）。戻り値:

```
{ width, height, walls, pellets, player, ghosts }
```

- `walls[y][x]`: 壁なら `true`
- `pellets[y][x]`: 通常の餌 `.` は `1`、パワー餌 `o` は `2`、それ以外（壁、床、P、G）は `0`
- `player`: `P` の座標 `{x, y}`
- `ghosts`: `G` の座標の配列。行優先（上の行から、同じ行では左から）
- 文字の意味: `#` 壁、`.` 餌、`o` パワー餌、` `（空白）床、`P` 自機の開始位置（床）、`G` 敵の開始位置（床）
- 次の場合は `Error` を投げる: 行の長さが揃っていない、`P` が 0 個または 2 個以上、上記以外の文字がある
- 入力の配列を変更しない

#### `isWall(maze, x, y)`

盤面の外は壁とみなして `true`。

#### `movePlayer(maze, pos, dir)`

`dir` は `'up' | 'left' | 'down' | 'right'`。進んだ先が壁でなければ新しい座標、壁なら同じ座標を、いずれも**新しいオブジェクト**で返す。不正な `dir` は `Error`。

#### `eatPellet(pellets, pos)`

`{ pellets, eaten }` を返す。`eaten` はそのマスにあった値（0, 1, 2）。`pellets` はそのマスを 0 にした新しい二次元配列。元の配列は変更しない。

#### `countPellets(pellets)`

値が 0 でないマスの数。

#### `openDirections(maze, pos)`

`pos` から進める（壁でない）方向名の配列を、**必ず `up, left, down, right` の順**で返す。

## やってはいけないこと

- `test/` の変更、削除
- ネットワークアクセス
- `src/maze.mjs`、`src/rng.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
- 敵の移動、ゲーム進行、描画の実装（後のタスクで行う）
