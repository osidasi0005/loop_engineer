import { DIRS, parseMaze, isWall, eatPellet, countPellets } from './maze.mjs';
import { targetFor, moveGhost, setMode } from './ghost.mjs';

/** 通常の餌の得点。 */
export const PELLET_SCORE = 10;
/** パワー餌の得点。 */
export const POWER_SCORE = 50;
/** 逃走中の敵を捕まえたときの得点。 */
export const GHOST_SCORE = 200;
/** パワー餌で敵が逃走する長さ（ティック）。 */
export const FRIGHT_TICKS = 30;
/** 散開モードの長さ（ティック）。 */
export const SCATTER_TICKS = 20;
/** 追跡モードの長さ（ティック）。 */
export const CHASE_TICKS = 60;
/** 開始時の残機。 */
export const START_LIVES = 3;

/**
 * 敵に割り当てる担当コーナーを 右上, 左上, 右下, 左下 の順で返す。
 * @param {{width:number, height:number}} maze
 * @returns {{x:number,y:number}[]}
 */
function cornersOf(maze) {
  return [
    { x: maze.width - 1, y: 0 },
    { x: 0, y: 0 },
    { x: maze.width - 1, y: maze.height - 1 },
    { x: 0, y: maze.height - 1 },
  ];
}

/**
 * 迷路の行から初期のゲーム状態を作る。
 * 敵は maze.ghosts の順に開始位置と担当コーナー（右上, 左上, 右下, 左下 の繰り返し）を持つ。
 * @param {string[]} lines 迷路の文字列行（変更しない）
 * @returns {object} 新しいゲーム状態
 */
export function createGame(lines) {
  const maze = parseMaze(lines);
  const corners = cornersOf(maze);
  return {
    maze,
    pellets: maze.pellets.map((row) => row.slice()),
    player: { x: maze.player.x, y: maze.player.y, dir: null },
    ghosts: maze.ghosts.map((g, i) => ({
      x: g.x,
      y: g.y,
      dir: null,
      mode: 'scatter',
      start: { x: g.x, y: g.y },
      corner: corners[i % corners.length],
    })),
    score: 0,
    lives: START_LIVES,
    tick: 0,
    mode: 'scatter',
    modeTimer: SCATTER_TICKS,
    frightenedTimer: 0,
    status: 'playing',
  };
}

/**
 * 自機と同じマスにいる敵をすべて処理する（捕食か残機減）。
 * 作業用の状態を直接書き換え、残機が減ったかどうかを返す。
 * @param {object} w 作業用の状態
 * @returns {boolean} 残機が減ったら true
 */
function resolveCollisions(w) {
  for (let i = 0; i < w.ghosts.length; i += 1) {
    const ghost = w.ghosts[i];
    if (ghost.x !== w.player.x || ghost.y !== w.player.y) continue;
    if (ghost.mode === 'frightened') {
      w.score += GHOST_SCORE;
      w.ghosts = w.ghosts.slice();
      w.ghosts[i] = { ...ghost, x: ghost.start.x, y: ghost.start.y, dir: null, mode: w.mode };
      continue;
    }
    w.lives -= 1;
    if (w.lives === 0) {
      w.status = 'lost';
    } else {
      w.player = { x: w.maze.player.x, y: w.maze.player.y, dir: null };
      w.ghosts = w.ghosts.map((g) => ({ ...g, x: g.start.x, y: g.start.y, dir: null, mode: w.mode }));
      w.frightenedTimer = 0;
    }
    return true;
  }
  return false;
}

/**
 * 1 ティック分ゲームを進めた新しい状態を返す。引数の状態は変更しない。
 * @param {object} state 現在のゲーム状態
 * @param {'up'|'left'|'down'|'right'|null} input 自機への入力
 * @param {() => number} rng 0 以上 1 未満を返す乱数関数
 * @returns {object} 新しいゲーム状態
 */
export function step(state, input, rng) {
  if (state.status !== 'playing') return state;

  const w = { ...state, player: { ...state.player }, ghosts: state.ghosts.slice() };
  const { maze } = w;

  // 1. 自機の移動
  const want = input ?? w.player.dir;
  const canGo = (dir) => {
    if (!dir || !DIRS[dir]) return false;
    return !isWall(maze, w.player.x + DIRS[dir].dx, w.player.y + DIRS[dir].dy);
  };
  const chosen = canGo(want) ? want : canGo(w.player.dir) ? w.player.dir : null;
  if (chosen) {
    const d = DIRS[chosen];
    w.player = { x: w.player.x + d.dx, y: w.player.y + d.dy, dir: chosen };
  }

  // 2. 餌
  const bite = eatPellet(w.pellets, w.player);
  w.pellets = bite.pellets;
  if (bite.eaten === 1) {
    w.score += PELLET_SCORE;
  } else if (bite.eaten === 2) {
    w.score += POWER_SCORE;
    w.frightenedTimer = FRIGHT_TICKS;
    w.ghosts = w.ghosts.map((g) => setMode(g, 'frightened'));
  }

  // 3. 衝突判定 A → 敵の移動 → 衝突判定 B
  if (!resolveCollisions(w)) {
    w.ghosts = w.ghosts.map((g) => moveGhost(maze, g, targetFor(g.mode, w.player, g.corner), rng));
    resolveCollisions(w);
  }

  // 4. タイマー
  if (w.frightenedTimer > 0) {
    w.frightenedTimer -= 1;
    if (w.frightenedTimer === 0) {
      w.ghosts = w.ghosts.map((g) => (g.mode === 'frightened' ? { ...g, mode: w.mode } : g));
    }
  } else {
    w.modeTimer -= 1;
    if (w.modeTimer === 0) {
      w.mode = w.mode === 'scatter' ? 'chase' : 'scatter';
      w.modeTimer = w.mode === 'chase' ? CHASE_TICKS : SCATTER_TICKS;
      w.ghosts = w.ghosts.map((g) => (g.mode === 'frightened' ? g : setMode(g, w.mode)));
    }
  }

  // 5. 勝利判定（最後の餌を取った時だけ。元から餌が無い迷路は勝利にしない）
  if (w.status === 'playing' && bite.eaten !== 0 && countPellets(w.pellets) === 0) {
    w.status = 'won';
  }

  w.tick += 1;
  return w;
}
