import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMaze, isWall, movePlayer, eatPellet, countPellets, openDirections, DIRS, OPPOSITE,
} from '../src/maze.mjs';
import { createRng } from '../src/rng.mjs';

const M1 = [
  '#######',
  '#P..o.#',
  '#.###.#',
  '#..G..#',
  '#######',
];

// ---------- parseMaze ----------
test('parseMaze: 幅と高さ', () => {
  const m = parseMaze(M1);
  assert.equal(m.width, 7);
  assert.equal(m.height, 5);
});

test('parseMaze: 壁は walls[y][x] に true', () => {
  const m = parseMaze(M1);
  assert.equal(m.walls[0][0], true);
  assert.equal(m.walls[1][1], false);
  assert.equal(m.walls[2][2], true);
  assert.equal(m.walls[3][3], false);
});

test('parseMaze: P が自機の開始位置、G が敵の開始位置', () => {
  const m = parseMaze(M1);
  assert.deepEqual(m.player, { x: 1, y: 1 });
  assert.deepEqual(m.ghosts, [{ x: 3, y: 3 }]);
});

test('parseMaze: 複数の G は行優先・左から右の順', () => {
  const m = parseMaze(['#####', '#PG.#', '#G.G#', '#####']);
  assert.deepEqual(m.ghosts, [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }]);
});

test('parseMaze: pellets[y][x] は . が 1、o が 2、それ以外（壁・床・P・G）は 0', () => {
  const m = parseMaze(M1);
  assert.equal(m.pellets[1][2], 1);
  assert.equal(m.pellets[1][4], 2);
  assert.equal(m.pellets[1][1], 0, 'P のマスには餌がない');
  assert.equal(m.pellets[3][3], 0, 'G のマスには餌がない');
  assert.equal(m.pellets[0][0], 0, '壁には餌がない');
  assert.equal(parseMaze(['####', '#P #', '####']).pellets[1][2], 0, '空白の床には餌がない');
});

test('parseMaze: 行の長さが揃っていなければ Error', () => {
  assert.throws(() => parseMaze(['####', '#P.#', '###']), Error);
});

test('parseMaze: P が無い、または 2 つ以上あれば Error', () => {
  assert.throws(() => parseMaze(['####', '#..#', '####']), Error);
  assert.throws(() => parseMaze(['####', '#PP#', '####']), Error);
});

test('parseMaze: 未知の文字があれば Error', () => {
  assert.throws(() => parseMaze(['####', '#P?#', '####']), Error);
});

test('parseMaze: 入力の配列を変更しない', () => {
  const lines = [...M1];
  parseMaze(lines);
  assert.deepEqual(lines, M1);
});

// ---------- isWall ----------
test('isWall: 盤面の外は壁とみなす', () => {
  const m = parseMaze(M1);
  assert.equal(isWall(m, -1, 1), true);
  assert.equal(isWall(m, 1, -1), true);
  assert.equal(isWall(m, 7, 1), true);
  assert.equal(isWall(m, 1, 5), true);
  assert.equal(isWall(m, 0, 0), true);
  assert.equal(isWall(m, 1, 1), false);
});

// ---------- DIRS / OPPOSITE ----------
test('DIRS は 4 方向の移動量、OPPOSITE は逆方向', () => {
  assert.deepEqual(DIRS, {
    up: { dx: 0, dy: -1 },
    left: { dx: -1, dy: 0 },
    down: { dx: 0, dy: 1 },
    right: { dx: 1, dy: 0 },
  });
  assert.deepEqual(OPPOSITE, { up: 'down', down: 'up', left: 'right', right: 'left' });
});

// ---------- movePlayer ----------
test('movePlayer: 開いている方向なら 1 マス進む', () => {
  const m = parseMaze(M1);
  assert.deepEqual(movePlayer(m, { x: 1, y: 1 }, 'right'), { x: 2, y: 1 });
  assert.deepEqual(movePlayer(m, { x: 1, y: 1 }, 'down'), { x: 1, y: 2 });
});

test('movePlayer: 壁なら同じ位置を返す', () => {
  const m = parseMaze(M1);
  assert.deepEqual(movePlayer(m, { x: 1, y: 1 }, 'up'), { x: 1, y: 1 });
  assert.deepEqual(movePlayer(m, { x: 1, y: 1 }, 'left'), { x: 1, y: 1 });
});

test('movePlayer: 入力の位置オブジェクトを変更せず、新しいオブジェクトを返す', () => {
  const m = parseMaze(M1);
  const pos = { x: 1, y: 1 };
  const out = movePlayer(m, pos, 'right');
  assert.deepEqual(pos, { x: 1, y: 1 });
  assert.notEqual(out, pos);
});

test('movePlayer: 不正な方向は Error', () => {
  const m = parseMaze(M1);
  assert.throws(() => movePlayer(m, { x: 1, y: 1 }, 'north'), Error);
});

// ---------- eatPellet / countPellets ----------
test('countPellets: 通常の餌とパワー餌を合わせた残数', () => {
  const m = parseMaze(M1);
  assert.equal(countPellets(m.pellets), 10);
});

test('eatPellet: 通常の餌を取ると eaten=1 で、そのマスが 0 になる。入力は変更しない', () => {
  const m = parseMaze(M1);
  const before = JSON.stringify(m.pellets);
  const r = eatPellet(m.pellets, { x: 2, y: 1 });
  assert.equal(r.eaten, 1);
  assert.equal(r.pellets[1][2], 0);
  assert.equal(countPellets(r.pellets), 9);
  assert.equal(JSON.stringify(m.pellets), before);
});

test('eatPellet: パワー餌は eaten=2', () => {
  const m = parseMaze(M1);
  const r = eatPellet(m.pellets, { x: 4, y: 1 });
  assert.equal(r.eaten, 2);
  assert.equal(r.pellets[1][4], 0);
});

test('eatPellet: 餌が無いマスは eaten=0 で内容は同じ', () => {
  const m = parseMaze(M1);
  const r = eatPellet(m.pellets, { x: 1, y: 1 });
  assert.equal(r.eaten, 0);
  assert.deepEqual(r.pellets, m.pellets);
});

// ---------- openDirections ----------
test('openDirections: 壁でない方向を up, left, down, right の順で返す', () => {
  const m = parseMaze(M1);
  assert.deepEqual(openDirections(m, { x: 1, y: 1 }), ['down', 'right']);
  assert.deepEqual(openDirections(m, { x: 3, y: 3 }), ['left', 'right']);
  assert.deepEqual(openDirections(m, { x: 1, y: 2 }), ['up', 'down']);
  assert.deepEqual(openDirections(m, { x: 5, y: 2 }), ['up', 'down']);
});

// ---------- rng ----------
test('createRng: 同じ種は同じ列、値は 0 以上 1 未満、異なる種は異なる列', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const sa = Array.from({ length: 20 }, () => a());
  const sb = Array.from({ length: 20 }, () => b());
  const sc = Array.from({ length: 20 }, () => c());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1, `範囲外: ${v}`);
  assert.ok(new Set(sa).size > 10, '値がほとんど同じ');
});
