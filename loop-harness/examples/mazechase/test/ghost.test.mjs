import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMaze, isWall } from '../src/maze.mjs';
import { createRng } from '../src/rng.mjs';
import { chooseDirection, moveGhost, setMode, targetFor } from '../src/ghost.mjs';

// 上の通路と下の通路が左右の縦通路でつながった環状の迷路
const M2 = [
  '#########',
  '#P......#',
  '#.#####.#',
  '#.#####.#',
  '#...G...#',
  '#########',
];
const m2 = parseMaze(M2);
const ghost = (x, y, dir = null, mode = 'chase') => ({ x, y, dir, mode });

// ---------- chooseDirection: 追跡・散開 ----------
test('chase: 候補のうち、進んだ先が目標に最も近い方向を選ぶ（距離は差の二乗和）', () => {
  // (4,4) の候補は left (3,4) と right (5,4)。目標 (1,1) には left が近い
  assert.equal(chooseDirection(m2, ghost(4, 4), { x: 1, y: 1 }), 'left');
  // 目標 (7,1) なら right
  assert.equal(chooseDirection(m2, ghost(4, 4), { x: 7, y: 1 }), 'right');
});

test('逆走しない: 今の進行方向の逆は候補から外す', () => {
  // 右に進んでいる敵は、目標が左にあっても右を選ぶ
  assert.equal(chooseDirection(m2, ghost(4, 4, 'right'), { x: 1, y: 1 }), 'right');
});

test('行き止まりで逆走しか無いときだけ逆走する', () => {
  const m3 = parseMaze(['#####', '#P.G#', '#####']);
  assert.equal(chooseDirection(m3, ghost(3, 1, 'right'), { x: 1, y: 1 }), 'left');
});

test('同じ距離なら up, left, down, right の優先順', () => {
  // (4,4) から目標 (4,1): left (3,4) と right (5,4) は同距離 → left
  assert.equal(chooseDirection(m2, ghost(4, 4), { x: 4, y: 1 }), 'left');
  // 上の通路 (4,1) から目標 (4,4): left (3,1) と right (5,1) は同距離 → left
  assert.equal(chooseDirection(m2, ghost(4, 1), { x: 4, y: 4 }), 'left');
});

test('scatter も同じ選び方（目標が違うだけ）', () => {
  assert.equal(chooseDirection(m2, ghost(4, 4, null, 'scatter'), { x: 7, y: 4 }), 'right');
});

// ---------- chooseDirection: 逃走 ----------
test('frightened: 候補（逆走を除く）から rng で一様に選ぶ。目標は無視', () => {
  const g = ghost(4, 4, null, 'frightened');
  // 候補は [left, right]。rng=0 → left、rng=0.99 → right
  assert.equal(chooseDirection(m2, g, { x: 7, y: 4 }, () => 0), 'left');
  assert.equal(chooseDirection(m2, g, { x: 1, y: 4 }, () => 0.99), 'right');
});

test('frightened でも逆走は除外される', () => {
  const g = ghost(4, 4, 'right', 'frightened');
  assert.equal(chooseDirection(m2, g, null, () => 0), 'right');
  assert.equal(chooseDirection(m2, g, null, () => 0.99), 'right');
});

// ---------- moveGhost ----------
test('moveGhost: 選んだ方向に 1 マス進み、dir を更新した新しい敵を返す。入力は変更しない', () => {
  const g = ghost(4, 4);
  const out = moveGhost(m2, g, { x: 1, y: 1 }, createRng(1));
  assert.deepEqual(out, { x: 3, y: 4, dir: 'left', mode: 'chase' });
  assert.deepEqual(g, { x: 4, y: 4, dir: null, mode: 'chase' });
});

test('moveGhost: 追跡は目標に到達する（(4,4) → (7,1) は 6 手）', () => {
  let g = ghost(4, 4);
  const target = { x: 7, y: 1 };
  const path = [];
  for (let i = 0; i < 6; i++) {
    g = moveGhost(m2, g, target, createRng(1));
    path.push(`${g.x},${g.y}`);
  }
  assert.deepEqual(path, ['5,4', '6,4', '7,4', '7,3', '7,2', '7,1']);
});

test('moveGhost: 200 手動かしても壁に入らず、毎回ちょうど 1 マス動く', () => {
  const rng = createRng(7);
  const modes = ['chase', 'scatter', 'frightened'];
  let g = ghost(4, 4);
  for (let i = 0; i < 200; i++) {
    const mode = modes[i % 3];
    const next = moveGhost(m2, { ...g, mode }, { x: 1, y: 1 }, rng);
    assert.equal(isWall(m2, next.x, next.y), false, `壁に入った: ${next.x},${next.y}`);
    assert.equal(Math.abs(next.x - g.x) + Math.abs(next.y - g.y), 1, `1 マス以外の移動: ${g.x},${g.y} → ${next.x},${next.y}`);
    g = next;
  }
});

// ---------- setMode ----------
test('setMode: モードが変わると進行方向が反転する', () => {
  const out = setMode(ghost(4, 4, 'right', 'chase'), 'frightened');
  assert.deepEqual(out, { x: 4, y: 4, dir: 'left', mode: 'frightened' });
  assert.deepEqual(setMode(ghost(4, 4, 'up', 'scatter'), 'chase').dir, 'down');
});

test('setMode: 同じモードなら反転しない。dir が null なら null のまま', () => {
  assert.deepEqual(setMode(ghost(4, 4, 'right', 'chase'), 'chase'), ghost(4, 4, 'right', 'chase'));
  assert.deepEqual(setMode(ghost(4, 4, null, 'chase'), 'scatter'), ghost(4, 4, null, 'scatter'));
});

test('setMode: 入力を変更しない', () => {
  const g = ghost(4, 4, 'right', 'chase');
  setMode(g, 'scatter');
  assert.deepEqual(g, ghost(4, 4, 'right', 'chase'));
});

// ---------- targetFor ----------
test('targetFor: chase は自機、scatter は担当コーナー、frightened は null', () => {
  const player = { x: 2, y: 3 };
  const corner = { x: 8, y: 0 };
  assert.deepEqual(targetFor('chase', player, corner), { x: 2, y: 3 });
  assert.deepEqual(targetFor('scatter', player, corner), { x: 8, y: 0 });
  assert.equal(targetFor('frightened', player, corner), null);
});
