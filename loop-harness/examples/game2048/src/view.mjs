/**
 * 2048 デスクトップ版の「ゲーム状態の更新」と「状態 → HTML 文字列」の純関数群。
 * DOM や window には触れない。Electron のレンダラーから import される想定。
 */

import { slide, spawn, canMove, hasWon } from './game.mjs';

const SIZE = 4;

/**
 * 整数を 3 桁ごとにカンマ区切りの文字列にする。
 * @param {number} n
 * @returns {string}
 */
export function formatScore(n) {
  return n.toLocaleString('en-US');
}

/**
 * 空盤面に spawn を 2 回適用した初期状態を返す。
 * @param {() => number} rng
 * @param {number} [best]
 * @returns {object} 状態オブジェクト
 */
export function createGame(rng, best = 0) {
  const empty = Array.from({ length: SIZE }, () => [0, 0, 0, 0]);
  const board = spawn(spawn(empty, rng), rng);
  return {
    board,
    score: 0,
    best,
    phase: 'playing',
    achieved: false,
    spawned: null,
  };
}

/**
 * spawn 前後の盤面を比較し、新しく置かれたマスの [row, col] を返す（内部ヘルパー）。
 * @param {number[][]} before
 * @param {number[][]} after
 * @returns {[number, number] | null}
 */
function findSpawned(before, after) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (before[r][c] === 0 && after[r][c] !== 0) return [r, c];
    }
  }
  return null;
}

/**
 * 状態と操作から新しい状態を返す。
 * @param {object} state
 * @param {'left'|'right'|'up'|'down'|'continue'|'new'|'quit'} action
 * @param {() => number} rng
 * @returns {object}
 */
export function reduce(state, action, rng) {
  if (action === 'new') {
    return createGame(rng, state.best);
  }
  if (action === 'quit') {
    return state;
  }
  if (action === 'continue') {
    if (state.phase !== 'won') return state;
    const phase = canMove(state.board) ? 'playing' : 'over';
    return { ...state, phase };
  }
  if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
    if (state.phase !== 'playing') return state;
    const slid = slide(state.board, action);
    if (!slid.moved) return state;

    const next = spawn(slid.board, rng);
    const spawned = findSpawned(slid.board, next);
    const score = state.score + slid.gained;
    const best = Math.max(state.best, score);
    const wonNow = !state.achieved && hasWon(next);
    const achieved = state.achieved || wonNow;
    const phase = wonNow ? 'won' : (!canMove(next) ? 'over' : 'playing');

    return { board: next, score, best, phase, achieved, spawned };
  }
  throw new Error(`不正な操作: ${String(action)}`);
}

const KEY_TO_ACTION = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  n: 'new', N: 'new',
  Enter: 'continue',
  q: 'quit', Q: 'quit', Escape: 'quit',
};

/**
 * KeyboardEvent.key の値を操作に変換する。該当なしは null。
 * @param {string} key
 * @returns {string | null}
 */
export function keyToAction(key) {
  return KEY_TO_ACTION[key] ?? null;
}

/**
 * hud 行を組み立てる（内部ヘルパー）。
 * @param {object} state
 * @returns {string}
 */
function renderHud(state) {
  const label = state.achieved
    ? '<span class="label">SCORE<span class="star">★</span></span>'
    : '<span class="label">SCORE</span>';
  return `<div class="hud">${label}<span class="score">${formatScore(state.score)}</span><span class="best">BEST ${formatScore(state.best)}</span></div>`;
}

/**
 * 16 マス分のタイル行を組み立てる（内部ヘルパー）。
 * @param {object} state
 * @returns {string[]}
 */
function renderTiles(state) {
  const spawned = state.phase === 'playing' ? state.spawned : null;
  const lines = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = state.board[r][c];
      if (v === 0) {
        lines.push('<div class="tile empty"></div>');
      } else {
        const isNew = spawned && spawned[0] === r && spawned[1] === c;
        lines.push(`<div class="tile v${v} d${String(v).length}${isNew ? ' new' : ''}">${v}</div>`);
      }
    }
  }
  return lines;
}

/**
 * veil 行を組み立てる（内部ヘルパー）。phase が playing なら null。
 * @param {object} state
 * @returns {string | null}
 */
function renderVeil(state) {
  if (state.phase === 'won') {
    return '<div class="veil won"><div class="title">2048!</div><button class="btn primary" data-action="continue">続ける　Enter</button><button class="btn" data-action="new">新しいゲーム　N</button></div>';
  }
  if (state.phase === 'over') {
    const highlight = state.score > 0 && state.score === state.best ? '・最高記録' : '';
    return `<div class="veil over"><div class="title">Game Over</div><div class="sub">${formatScore(state.score)} 点${highlight}</div><button class="btn primary" data-action="new">もう一度　N</button></div>`;
  }
  return null;
}

const FOOT_BY_PHASE = {
  playing: '<div class="foot"><span>ARROWS / WASD: MOVE</span><span>N: NEW · Q: QUIT</span></div>',
  won: '<div class="foot"><span>ENTER: CONTINUE</span><span>N: NEW</span></div>',
  over: '<div class="foot"><span>N: NEW</span><span>Q: QUIT</span></div>',
};

/**
 * 状態から HTML 文字列を返す（1 要素 1 行、末尾改行なし）。
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const lines = [
    renderHud(state),
    '<div class="boardwrap">',
    '<div class="board">',
    ...renderTiles(state),
    '</div>',
  ];
  const veil = renderVeil(state);
  if (veil) lines.push(veil);
  lines.push('</div>');
  lines.push(FOOT_BY_PHASE[state.phase]);
  return lines.join('\n');
}
