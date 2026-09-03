import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, DEFAULT_MAZE } from '../src/cli.mjs';
import { parseMaze, countPellets } from '../src/maze.mjs';
import { createRng } from '../src/rng.mjs';
import { createGame, step } from '../src/game.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, '..', 'src', 'cli.mjs');
const runCli = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', timeout: 10000 });

const M1 = ['#######', '#P..o.#', '#.###.#', '#..G..#', '#######'];
const INPUT = { U: 'up', D: 'down', L: 'left', R: 'right', '.': null };

function simulate(seed, inputs) {
  const rng = createRng(seed);
  let s = createGame(DEFAULT_MAZE);
  for (const ch of inputs) s = step(s, INPUT[ch], rng);
  return s;
}

// ---------- render ----------
test('render: 1 行目に得点と残機、続けて盤面。自機は @、敵は G', () => {
  const s = createGame(M1);
  assert.equal(
    render(s),
    ['Score: 0  Lives: 3', '#######', '#@..o.#', '#.###.#', '#..G..#', '#######'].join('\n'),
  );
});

test('render: 取った餌は消え、frightened の敵は小文字 g', () => {
  let s = createGame(M1);
  s = { ...s, player: { x: 2, y: 1, dir: 'right' }, score: 10 };
  s = { ...s, pellets: s.pellets.map((row, y) => row.map((v, x) => (x === 2 && y === 1 ? 0 : v))) };
  s = { ...s, ghosts: [{ ...s.ghosts[0], mode: 'frightened' }] };
  assert.equal(
    render(s),
    ['Score: 10  Lives: 3', '#######', '#.@.o.#', '#.###.#', '#..g..#', '#######'].join('\n'),
  );
});

test('render: 自機と敵が同じマスなら自機を描く', () => {
  let s = createGame(M1);
  s = { ...s, player: { x: 3, y: 3, dir: null } };
  assert.equal(render(s).split('\n')[4], '#..@..#');
});

test('render: won なら最後に You Win!、lost なら Game Over の行を足す', () => {
  const s = createGame(M1);
  assert.ok(render({ ...s, status: 'won' }).endsWith('\n#######\nYou Win!'));
  assert.ok(render({ ...s, status: 'lost' }).endsWith('\n#######\nGame Over'));
  assert.ok(!render(s).endsWith('\n'));
});

test('render は入力を変更しない', () => {
  const s = createGame(M1);
  const snapshot = JSON.stringify(s);
  render(s);
  assert.equal(JSON.stringify(s), snapshot);
});

// ---------- DEFAULT_MAZE ----------
test('DEFAULT_MAZE: parseMaze でき、敵が 2 体以上、餌が 50 個以上ある', () => {
  const m = parseMaze(DEFAULT_MAZE);
  assert.ok(m.ghosts.length >= 2);
  assert.ok(countPellets(m.pellets) >= 50);
  assert.ok(m.width >= 15 && m.height >= 9);
});

// ---------- 非対話モード ----------
test('--seed と --inputs を渡すと対話せずに終了し、render の結果を stdout に出す', () => {
  const r = runCli('--seed', '42', '--inputs', 'RRRR..DDLL');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, render(simulate(42, 'RRRR..DDLL')) + '\n');
});

test('長い入力列でも仕様どおりに再現される', () => {
  const inputs = 'RRRRRDDDDDLLLLLUUUUU.....RRRDDDLLLUUU'.repeat(6);
  const r = runCli('--seed', '7', '--inputs', inputs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, render(simulate(7, inputs)) + '\n');
});

test('--inputs に U D L R . 以外の文字があれば exit 1 で stderr にメッセージ、stdout は空', () => {
  const r = runCli('--seed', '1', '--inputs', 'RXL');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.trim().length > 0);
  assert.equal(r.stdout, '');
});

test('--seed が整数でなければ exit 1', () => {
  const r = runCli('--seed', 'abc', '--inputs', 'R');
  assert.equal(r.status, 1);
});
