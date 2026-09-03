# タスク仕様: 迷路追いかけゲーム 02 — 敵の移動

`src/maze.mjs` と `src/rng.mjs`（実装済み。変更しない）を使い、敵の移動ルールを `src/ghost.mjs` に純関数で実装する。

## 完了条件（すべて満たすこと）

1. `node --test test/maze.test.mjs test/ghost.test.mjs` がすべて PASS する
2. 依存パッケージを追加しない（Node 標準機能のみ）
3. `test/`、`src/maze.mjs`、`src/rng.mjs` を変更しない
4. すべての export 関数が純関数で、引数を破壊的に変更しない
5. 各 export 関数に 1〜3 行の JSDoc コメントがある

## 仕様の詳細

敵は `{ x, y, dir, mode }`。`dir` は `'up' | 'left' | 'down' | 'right' | null`（まだ動いていなければ null）。
`mode` は `'chase'`（追跡）| `'scatter'`（散開）| `'frightened'`（逃走）。
敵オブジェクトに他のプロパティ（`start`, `corner` など）が付いていても、そのまま保って返す（スプレッドでコピーする）。

### `targetFor(mode, player, corner)`

- `chase` → `player` の座標、`scatter` → `corner`、`frightened` → `null`

### `chooseDirection(maze, ghost, target, rng)`

1. 候補 = `openDirections(maze, ghost)` から、`ghost.dir` の逆方向（`OPPOSITE[ghost.dir]`）を除いたもの。`dir` が null なら何も除かない
2. 候補が空（行き止まりで逆走しか無い）なら、逆方向を返す
3. `mode` が `frightened` なら `候補[Math.floor(rng() * 候補.length)]` を返す（`target` は無視）
4. それ以外は、各候補について「1 マス進んだ先の座標と `target` の距離の二乗（`dx*dx + dy*dy`）」を計算し、最小の候補を返す。同じ距離なら候補の順（`up, left, down, right`）で先のもの

### `moveGhost(maze, ghost, target, rng)`

`chooseDirection` で方向を決め、その方向に 1 マス進めた新しい敵を返す。`dir` は選んだ方向に更新する。入力は変更しない。

### `setMode(ghost, mode)`

新しいモードの敵を返す。モードが**変わる**場合は `dir` を逆方向にする（null なら null のまま）。同じモードなら `dir` はそのまま。

## やってはいけないこと

- `test/`、`src/maze.mjs`、`src/rng.mjs` の変更、削除
- ネットワークアクセス
- `src/ghost.mjs` 以外への新規ファイル作成（進捗メモへの追記は除く）
- ゲーム進行や描画の実装（後のタスクで行う）
