import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from '../src/cli.mjs';
import { slide, spawn, createRng, canMove } from '../src/game.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, '..', 'src', 'cli.mjs');
const runCli = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', timeout: 10000 });

const EMPTY = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
const DIR = { L: 'left', R: 'right', U: 'up', D: 'down' };

// テスト側で仕様どおりに手順を再現し、CLI の出力と突き合わせる
function simulate(seed, moves) {
  const rng = createRng(seed);
  let board = spawn(spawn(EMPTY(), rng), rng);
  let score = 0;
  for (const ch of moves) {
    if (!canMove(board)) break;
    const r = slide(board, DIR[ch]);
    if (!r.moved) continue;
    board = spawn(r.board, rng);
    score += r.gained;
  }
  return { board, score };
}

// ---------- render ----------
test('render: 1 行目が Score:、続く 4 行が各セル幅 5 の右寄せ、空きは "."', () => {
  const board = [
    [2, 0, 4, 0],
    [0, 0, 0, 0],
    [16, 128, 0, 2048],
    [0, 0, 0, 0],
  ];
  const expected = [
    'Score: 12',
    '    2    .    4    .',
    '    .    .    .    .',
    '   16  128    . 2048',
    '    .    .    .    .',
  ].join('\n');
  assert.equal(render(board, 12), expected);
});

test('render は純関数で入力を変更しない', () => {
  const board = EMPTY();
  board[0][0] = 2;
  const snapshot = JSON.stringify(board);
  render(board, 0);
  assert.equal(JSON.stringify(board), snapshot);
});

// ---------- 非対話モード ----------
test('--seed と --moves を渡すと対話せずに終了し、render の結果を stdout に出す', () => {
  const r = runCli('--seed', '42', '--moves', 'LLUR');
  assert.equal(r.status, 0, r.stderr);
  const { board, score } = simulate(42, 'LLUR');
  assert.equal(r.stdout, render(board, score) + '\n');
});

test('非対話モードは決定的（同じ引数で同じ出力）', () => {
  const a = runCli('--seed', '7', '--moves', 'DDRRUULL');
  const b = runCli('--seed', '7', '--moves', 'DDRRUULL');
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
});

test('長い手順でも仕様どおりに再現される（動かない手は無視、動けなくなったら停止）', () => {
  const moves = 'LDRULDRULDRULDRULDRULDRULDRULDRULDRULDRU'.repeat(5);
  const r = runCli('--seed', '3', '--moves', moves);
  assert.equal(r.status, 0, r.stderr);
  const { board, score } = simulate(3, moves);
  assert.equal(r.stdout, render(board, score) + '\n');
});

test('--moves に L/R/U/D 以外の文字があれば exit 1 で stderr にメッセージ', () => {
  const r = runCli('--seed', '1', '--moves', 'LXR');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.trim().length > 0);
  assert.equal(r.stdout, '');
});

test('--seed が数値でなければ exit 1', () => {
  const r = runCli('--seed', 'abc', '--moves', 'L');
  assert.equal(r.status, 1);
});
