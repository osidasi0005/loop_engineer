import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPellets } from '../src/maze.mjs';
import { createRng } from '../src/rng.mjs';
import {
  createGame, step,
  PELLET_SCORE, POWER_SCORE, GHOST_SCORE, FRIGHT_TICKS, SCATTER_TICKS, CHASE_TICKS, START_LIVES,
} from '../src/game.mjs';

const M4 = ['#######', '#P..o.#', '#######']; // 敵なし
const M5 = ['########', '#Po..G.#', '########']; // パワー餌と敵
const M6 = ['#####', '#P G#', '#####']; // 餌なし、敵と隣接
const M7 = ['####', '#P.#', '####']; // 餌 1 つ
const M8 = ['#####', '#P..#', '#####', '# G #', '#####']; // 敵は閉じた小部屋
const M9 = ['#####', '#Po.#', '#####', '#.G #', '#####']; // 小部屋 + パワー餌（小部屋の餌は自機が取れないので won にならない）
const M10 = [
  '#########',
  '#P......#',
  '#.#####.#',
  '#.#####.#',
  '#...G...#',
  '#########',
];

const zero = () => 0;
const run = (state, inputs, rng = zero) => {
  for (const i of inputs) state = step(state, i, rng);
  return state;
};
const nulls = (n) => Array(n).fill(null);

// ---------- 定数 ----------
test('定数', () => {
  assert.equal(PELLET_SCORE, 10);
  assert.equal(POWER_SCORE, 50);
  assert.equal(GHOST_SCORE, 200);
  assert.equal(FRIGHT_TICKS, 30);
  assert.equal(SCATTER_TICKS, 20);
  assert.equal(CHASE_TICKS, 60);
  assert.equal(START_LIVES, 3);
});

// ---------- createGame ----------
test('createGame: 初期状態', () => {
  const s = createGame(M4);
  assert.equal(s.score, 0);
  assert.equal(s.lives, 3);
  assert.equal(s.tick, 0);
  assert.equal(s.status, 'playing');
  assert.equal(s.mode, 'scatter');
  assert.equal(s.modeTimer, 20);
  assert.equal(s.frightenedTimer, 0);
  assert.deepEqual(s.player, { x: 1, y: 1, dir: null });
  assert.deepEqual(s.ghosts, []);
  assert.equal(countPellets(s.pellets), 4);
  assert.equal(s.maze.width, 7);
});

test('createGame: 敵は開始位置・担当コーナーを持ち、モードは全体モードと同じ', () => {
  const s = createGame(M5);
  assert.deepEqual(s.ghosts, [
    { x: 5, y: 1, dir: null, mode: 'scatter', start: { x: 5, y: 1 }, corner: { x: 7, y: 0 } },
  ]);
});

test('createGame: コーナーは 右上, 左上, 右下, 左下 の順に割り当てる', () => {
  const s = createGame(['#######', '#PGGGG#', '#######']);
  assert.deepEqual(s.ghosts.map((g) => g.corner), [
    { x: 6, y: 0 }, { x: 0, y: 0 }, { x: 6, y: 2 }, { x: 0, y: 2 },
  ]);
});

// ---------- 自機の移動と餌 ----------
test('step: 入力方向が開いていれば進み、餌を取って得点。入力の状態は変更しない', () => {
  const s0 = createGame(M4);
  const snapshot = JSON.stringify(s0);
  const s1 = step(s0, 'right', zero);
  assert.deepEqual(s1.player, { x: 2, y: 1, dir: 'right' });
  assert.equal(s1.score, 10);
  assert.equal(countPellets(s1.pellets), 3);
  assert.equal(s1.tick, 1);
  assert.equal(JSON.stringify(s0), snapshot);
});

test('step: 入力が null なら現在の進行方向に進み続ける', () => {
  const s = run(createGame(M4), ['right', null]);
  assert.deepEqual(s.player, { x: 3, y: 1, dir: 'right' });
  assert.equal(s.score, 20);
});

test('step: 入力方向が壁で進行方向も無ければ止まる', () => {
  const s = step(createGame(M4), 'up', zero);
  assert.deepEqual(s.player, { x: 1, y: 1, dir: null });
  assert.equal(s.score, 0);
  assert.equal(s.tick, 1);
});

test('step: 入力方向が壁でも進行方向が開いていればそちらに進む', () => {
  const s = run(createGame(M4), ['right', 'up']);
  assert.deepEqual(s.player, { x: 3, y: 1, dir: 'right' });
});

test('step: 壁にぶつかったら進行方向を保ったまま止まる', () => {
  const s = run(createGame(M4), ['right', null, null, null, null, null]);
  assert.deepEqual(s.player, { x: 5, y: 1, dir: 'right' });
  assert.equal(s.score, 10 + 10 + 50 + 10);
});

test('step: パワー餌で 50 点、逃走タイマーが FRIGHT_TICKS にセットされ同じ手で 1 減る', () => {
  const s = run(createGame(M4), ['right', null, null]);
  assert.deepEqual(s.player, { x: 4, y: 1, dir: 'right' });
  assert.equal(s.score, 70);
  assert.equal(s.frightenedTimer, 29);
});

// ---------- 敵との相互作用 ----------
test('step: パワー餌を取ると敵が frightened になり、rng で動く', () => {
  const s = step(createGame(M5), 'right', zero);
  assert.equal(s.score, 50);
  assert.equal(s.frightenedTimer, 29);
  assert.deepEqual(s.ghosts[0], {
    x: 4, y: 1, dir: 'left', mode: 'frightened', start: { x: 5, y: 1 }, corner: { x: 7, y: 0 },
  });
  assert.equal(countPellets(s.pellets), 3);
});

test('step: frightened の敵に触れると 200 点で敵は開始位置に戻り、全体モードに復帰', () => {
  const s = run(createGame(M5), ['right', 'right']);
  assert.deepEqual(s.player, { x: 3, y: 1, dir: 'right' });
  assert.equal(s.score, 50 + 10 + 200);
  assert.deepEqual(s.ghosts[0], {
    x: 5, y: 1, dir: null, mode: 'scatter', start: { x: 5, y: 1 }, corner: { x: 7, y: 0 },
  });
  assert.equal(s.frightenedTimer, 28);
  assert.equal(s.status, 'playing');
});

test('step: 通常の敵に触れると残機が減り、自機と敵が開始位置に戻る', () => {
  const s = step(createGame(M6), 'right', zero);
  assert.equal(s.lives, 2);
  assert.deepEqual(s.player, { x: 1, y: 1, dir: null });
  assert.deepEqual(s.ghosts[0], {
    x: 3, y: 1, dir: null, mode: 'scatter', start: { x: 3, y: 1 }, corner: { x: 4, y: 0 },
  });
  assert.equal(s.status, 'playing');
  assert.equal(s.tick, 1);
});

test('step: すれ違い（自機が敵のいるマスに進む）も自機移動直後に判定される', () => {
  const s0 = createGame(M6);
  const s = step({ ...s0, player: { x: 2, y: 1, dir: 'right' } }, 'right', zero);
  assert.equal(s.lives, 2);
  assert.deepEqual(s.player, { x: 1, y: 1, dir: null });
});

test('step: 残機が 0 になると lost。以後の step は同じ状態を返す', () => {
  const s0 = { ...createGame(M6), lives: 1 };
  const s1 = step(s0, 'right', zero);
  assert.equal(s1.status, 'lost');
  assert.equal(s1.lives, 0);
  const s2 = step(s1, 'left', zero);
  assert.deepEqual(s2, s1);
});

test('step: 餌を全部取ると won。以後の step は同じ状態を返す', () => {
  const s1 = step(createGame(M7), 'right', zero);
  assert.equal(s1.status, 'won');
  assert.equal(s1.score, 10);
  assert.deepEqual(step(s1, 'left', zero), s1);
});

// ---------- モードのタイマー ----------
test('モード: SCATTER_TICKS 後に chase、CHASE_TICKS 後に scatter へ切り替わり、敵のモードも追従する', () => {
  const rng = createRng(1);
  let s = run(createGame(M8), nulls(19), rng);
  assert.equal(s.mode, 'scatter');
  assert.equal(s.modeTimer, 1);
  s = step(s, null, rng);
  assert.equal(s.mode, 'chase');
  assert.equal(s.modeTimer, 60);
  assert.equal(s.ghosts[0].mode, 'chase');
  s = run(s, nulls(60), rng);
  assert.equal(s.mode, 'scatter');
  assert.equal(s.modeTimer, 20);
  assert.equal(s.ghosts[0].mode, 'scatter');
  assert.equal(s.lives, 3, '閉じた小部屋の敵は自機に触れない');
});

test('逃走中は全体モードのタイマーが止まり、逃走が終わると敵が全体モードに戻る', () => {
  const rng = createRng(2);
  let s = step(createGame(M9), 'right', rng); // パワー餌
  assert.equal(s.ghosts[0].mode, 'frightened');
  assert.equal(s.frightenedTimer, 29);
  s = run(s, nulls(29), rng);
  assert.equal(s.frightenedTimer, 0);
  assert.equal(s.ghosts[0].mode, 'scatter');
  assert.equal(s.mode, 'scatter');
  assert.equal(s.modeTimer, 20, '逃走中は全体モードのタイマーが進まない');
  s = step(s, null, rng);
  assert.equal(s.modeTimer, 19);
});

// ---------- 決定性 ----------
test('同じ種と同じ入力列なら同じ最終状態になる', () => {
  const inputs = 'RRRRRRDDDDLLLLLLUUUURRRRRDDDLLLUUURRRDDDLLLUUU'.split('').map(
    (c) => ({ R: 'right', L: 'left', U: 'up', D: 'down' })[c],
  );
  const a = run(createGame(M10), inputs, createRng(99));
  const b = run(createGame(M10), inputs, createRng(99));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
