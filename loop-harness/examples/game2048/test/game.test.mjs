import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slide, spawn, createRng, canMove, hasWon } from '../src/game.mjs';

const E = () => [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
const withRow = (i, row) => {
  const b = E();
  b[i] = [...row];
  return b;
};
const withCol = (j, col) => {
  const b = E();
  col.forEach((v, i) => (b[i][j] = v));
  return b;
};
const col = (b, j) => b.map((r) => r[j]);

// ---------- slide: left ----------
test('left: 隣接する同じ数を併合して左に寄せる', () => {
  const r = slide(withRow(0, [2, 2, 0, 0]), 'left');
  assert.deepEqual(r.board[0], [4, 0, 0, 0]);
  assert.equal(r.gained, 4);
  assert.equal(r.moved, true);
});

test('left: 間に空きがあっても併合する', () => {
  const r = slide(withRow(1, [2, 0, 2, 0]), 'left');
  assert.deepEqual(r.board[1], [4, 0, 0, 0]);
  assert.equal(r.gained, 4);
});

test('left: 1 手で 1 回しか併合しない（2,2,4 → 4,4 であって 8 ではない）', () => {
  const r = slide(withRow(0, [2, 2, 4, 0]), 'left');
  assert.deepEqual(r.board[0], [4, 4, 0, 0]);
  assert.equal(r.gained, 4);
});

test('left: 4 つ同じ数は 2 組に併合する', () => {
  const r = slide(withRow(2, [4, 4, 4, 4]), 'left');
  assert.deepEqual(r.board[2], [8, 8, 0, 0]);
  assert.equal(r.gained, 16);
});

test('left: 併合は左側優先（2,2,2 → 4,2）', () => {
  const r = slide(withRow(0, [2, 2, 2, 0]), 'left');
  assert.deepEqual(r.board[0], [4, 2, 0, 0]);
  assert.equal(r.gained, 4);
});

test('left: 動かない盤面は moved=false, gained=0', () => {
  const b = withRow(0, [2, 4, 2, 4]);
  const r = slide(b, 'left');
  assert.deepEqual(r.board, b);
  assert.equal(r.moved, false);
  assert.equal(r.gained, 0);
});

test('left: 空きに寄せるだけでも moved=true', () => {
  const r = slide(withRow(0, [0, 0, 0, 2]), 'left');
  assert.deepEqual(r.board[0], [2, 0, 0, 0]);
  assert.equal(r.moved, true);
  assert.equal(r.gained, 0);
});

// ---------- slide: right / up / down ----------
test('right: 右に寄せて右側優先で併合する', () => {
  const r = slide(withRow(0, [0, 2, 2, 4]), 'right');
  assert.deepEqual(r.board[0], [0, 0, 4, 4]);
  assert.equal(r.gained, 4);
  const r2 = slide(withRow(0, [2, 2, 2, 0]), 'right');
  assert.deepEqual(r2.board[0], [0, 0, 2, 4]);
});

test('up: 列を上に寄せる', () => {
  const r = slide(withCol(0, [2, 0, 2, 4]), 'up');
  assert.deepEqual(col(r.board, 0), [4, 4, 0, 0]);
  assert.equal(r.gained, 4);
});

test('down: 列を下に寄せる', () => {
  const r = slide(withCol(3, [4, 2, 0, 2]), 'down');
  assert.deepEqual(col(r.board, 3), [0, 0, 4, 4]);
  assert.equal(r.gained, 4);
});

test('複数行の得点は合算される', () => {
  const b = E();
  b[0] = [2, 2, 0, 0];
  b[3] = [8, 8, 16, 16];
  const r = slide(b, 'left');
  assert.deepEqual(r.board[0], [4, 0, 0, 0]);
  assert.deepEqual(r.board[3], [16, 32, 0, 0]);
  assert.equal(r.gained, 4 + 16 + 32);
});

test('slide は入力の盤面を変更しない（純関数）', () => {
  const b = withRow(0, [2, 2, 0, 0]);
  const snapshot = JSON.stringify(b);
  slide(b, 'left');
  assert.equal(JSON.stringify(b), snapshot);
});

test('slide: 不正な方向は Error を投げる', () => {
  assert.throws(() => slide(E(), 'diagonal'), Error);
});

// ---------- spawn / rng ----------
test('spawn: 空きが 1 つならそこに置く。rng < 0.9 なら 2', () => {
  const b = E().map((r) => r.map(() => 2));
  b[2][1] = 0;
  const out = spawn(b, () => 0.5);
  assert.equal(out[2][1], 2);
  assert.equal(b[2][1], 0, '入力を変更しない');
});

test('spawn: rng >= 0.9 なら 4', () => {
  const b = E().map((r) => r.map(() => 2));
  b[0][0] = 0;
  assert.equal(spawn(b, () => 0.95)[0][0], 4);
});

test('spawn: 空き盤面にはタイルがちょうど 1 つ増え、他は変わらない', () => {
  const out = spawn(E(), createRng(1));
  const tiles = out.flat().filter((v) => v !== 0);
  assert.equal(tiles.length, 1);
  assert.ok(tiles[0] === 2 || tiles[0] === 4);
});

test('spawn: 空きが無ければ同じ内容の盤面を返す', () => {
  const b = E().map((r) => r.map(() => 2));
  assert.deepEqual(spawn(b, () => 0.1), b);
});

test('createRng: 同じ種は同じ列を返し、値は 0 以上 1 未満', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1, `範囲外: ${v}`);
  assert.ok(new Set(seqA).size > 10, '値がほとんど同じ');
});

test('createRng: 異なる種は異なる列を返す', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

// ---------- canMove / hasWon ----------
test('canMove: 空きがあれば true', () => {
  assert.equal(canMove(withRow(0, [2, 4, 8, 16])), true);
});

test('canMove: 満杯でも隣接する同じ数があれば true', () => {
  const b = [
    [2, 4, 8, 16],
    [16, 8, 4, 2],
    [2, 4, 8, 16],
    [16, 8, 4, 4],
  ];
  assert.equal(canMove(b), true);
});

test('canMove: 満杯で併合できなければ false', () => {
  const b = [
    [2, 4, 8, 16],
    [16, 8, 4, 2],
    [2, 4, 8, 16],
    [16, 8, 4, 2],
  ];
  assert.equal(canMove(b), false);
});

test('hasWon: 2048 以上のタイルがあれば true', () => {
  assert.equal(hasWon(withRow(0, [2048, 0, 0, 0])), true);
  assert.equal(hasWon(withRow(0, [4096, 0, 0, 0])), true);
  assert.equal(hasWon(withRow(0, [1024, 1024, 0, 0])), false);
});
