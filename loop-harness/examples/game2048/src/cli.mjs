/**
 * 2048 ターミナル UI。
 * `render` は副作用のない純関数として named export し、
 * それ以外の入出力処理（対話モード・非対話モード）は main() にまとめる。
 */

import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { slide, spawn, createRng, canMove, hasWon } from './game.mjs';

const SIZE = 4;
const DIR_KEYS = { L: 'left', R: 'right', U: 'up', D: 'down' };

/**
 * 盤面とスコアを表示用文字列に変換する（純関数、引数は変更しない）。
 * @param {number[][]} board 4x4 の盤面
 * @param {number} score スコア
 * @returns {string}
 */
export function render(board, score) {
  const lines = [`Score: ${score}`];
  for (const row of board) {
    const cells = row.map((v) => String(v === 0 ? '.' : v).padStart(5));
    lines.push(cells.join(''));
  }
  return lines.join('\n');
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

/**
 * 非対話モード: --seed と --moves を処理し、最終状態の render を stdout に出して終了する。
 * @param {string} seedArg
 * @param {string} movesArg
 */
function runNonInteractive(seedArg, movesArg) {
  const seed = Number(seedArg);
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    process.stderr.write('エラー: --seed は整数で指定してください\n');
    process.exit(1);
    return;
  }
  if (!/^[LRUD]*$/.test(movesArg)) {
    process.stderr.write('エラー: --moves には L, R, U, D 以外の文字は使えません\n');
    process.exit(1);
    return;
  }

  const rng = createRng(seed);
  let board = spawn(spawn(emptyBoard(), rng), rng);
  let score = 0;

  for (const ch of movesArg) {
    if (!canMove(board)) break;
    const direction = DIR_KEYS[ch];
    const result = slide(board, direction);
    if (!result.moved) continue;
    board = spawn(result.board, rng);
    score += result.gained;
  }

  process.stdout.write(render(board, score) + '\n');
  process.exit(0);
}

/**
 * 対話モード: 矢印キーで操作し、q または Ctrl+C で終了する。
 * @param {string|undefined} seedArg
 */
function runInteractive(seedArg) {
  if (!process.stdin.isTTY) {
    process.stdout.write('標準入力が TTY ではないため、対話モードを開始できません。\n');
    process.exit(0);
    return;
  }

  let seed;
  if (seedArg !== undefined) {
    seed = Number(seedArg);
    if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
      process.stderr.write('エラー: --seed は整数で指定してください\n');
      process.exit(1);
      return;
    }
  } else {
    seed = Date.now();
  }

  const rng = createRng(seed);
  let board = spawn(spawn(emptyBoard(), rng), rng);
  let score = 0;
  let over = false;
  let won = false;

  function draw() {
    console.clear();
    let output = render(board, score);
    if (won) output += '\nYou Win!';
    if (over) output += '\nGame Over';
    output += '\n(矢印キーで移動、q で終了)';
    process.stdout.write(output + '\n');
  }

  function applyMove(direction) {
    if (over) return;
    const result = slide(board, direction);
    if (!result.moved) return;
    board = spawn(result.board, rng);
    score += result.gained;
    if (hasWon(board)) won = true;
    if (!canMove(board)) over = true;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (key && key.ctrl && key.name === 'c') {
      cleanup();
      return;
    }
    if (str === 'q') {
      cleanup();
      return;
    }
    if (key && key.name) {
      switch (key.name) {
        case 'left':
          applyMove('left');
          draw();
          break;
        case 'right':
          applyMove('right');
          draw();
          break;
        case 'up':
          applyMove('up');
          draw();
          break;
        case 'down':
          applyMove('down');
          draw();
          break;
        default:
          break;
      }
    }
  });

  function cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(0);
  }

  draw();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') {
      args.seed = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--moves') {
      args.moves = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.moves !== undefined) {
    runNonInteractive(args.seed, args.moves);
  } else {
    runInteractive(args.seed);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
