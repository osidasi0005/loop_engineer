import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createRng } from './rng.mjs';
import { createGame, step } from './game.mjs';

// ---------- DEFAULT_MAZE ----------
// 幅 21 / 高さ 13。左右対称、全マス連結、行き止まり無し。
// 中央の部屋に敵 G が 2 体、自機 P は下段中央。パワー餌 o は四隅。
export const DEFAULT_MAZE = [
  '#####################',
  '#o........#........o#',
  '#.###.###.#.###.###.#',
  '#.#.......#.......#.#',
  '#.#.##.#######.##.#.#',
  '#......#.....#......#',
  '#.####.#.G.G.#.####.#',
  '#......#.....#......#',
  '#.#.##...###...##.#.#',
  '#.#....#.....#....#.#',
  '#.###.#.......#.###.#',
  '#o.........P.......o#',
  '#####################',
];

// ---------- render ----------
/**
 * ゲーム状態から画面表示用の文字列を作る純関数。引数は変更しない。
 * @param {object} state ゲーム状態
 * @returns {string}
 */
export function render(state) {
  const { maze, pellets, player, ghosts, score, lives, status } = state;
  const lines = [`Score: ${score}  Lives: ${lives}`];
  for (let y = 0; y < maze.height; y += 1) {
    let row = '';
    for (let x = 0; x < maze.width; x += 1) {
      if (player.x === x && player.y === y) {
        row += '@';
        continue;
      }
      const ghost = ghosts.find((g) => g.x === x && g.y === y);
      if (ghost) {
        row += ghost.mode === 'frightened' ? 'g' : 'G';
        continue;
      }
      if (maze.walls[y][x]) {
        row += '#';
        continue;
      }
      const p = pellets[y][x];
      if (p === 2) {
        row += 'o';
        continue;
      }
      if (p === 1) {
        row += '.';
        continue;
      }
      // pellets の値が 0 の非壁マスは通常「床（空白）」だが、
      // 自機・敵の初期位置マスは（parseMaze の仕様上 P/G が乗るため常に 0 になる）
      // 通路として扱い、そこが無人になったら餌があった体で '.' を描く。
      const isSpawn =
        (maze.player.x === x && maze.player.y === y) ||
        maze.ghosts.some((g) => g.x === x && g.y === y);
      row += isSpawn ? '.' : ' ';
    }
    lines.push(row);
  }
  if (status === 'won') lines.push('You Win!');
  else if (status === 'lost') lines.push('Game Over');
  return lines.join('\n');
}

// ---------- 引数解析 ----------
const VALID_INPUT_CHARS = new Set(['U', 'D', 'L', 'R', '.']);
const INPUT_MAP = { U: 'up', D: 'down', L: 'left', R: 'right', '.': null };
const KEY_DIR = { up: 'up', down: 'down', left: 'left', right: 'right' };

function parseArgs(argv) {
  const result = { seedStr: undefined, hasSeed: false, inputs: undefined, hasInputs: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') {
      result.hasSeed = true;
      result.seedStr = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--inputs') {
      result.hasInputs = true;
      result.inputs = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

// ---------- 非対話モード ----------
function runNonInteractive(seed, inputs) {
  for (const ch of inputs) {
    if (!VALID_INPUT_CHARS.has(ch)) {
      process.stderr.write(`不正な入力文字です: ${JSON.stringify(ch)}\n`);
      process.exit(1);
      return;
    }
  }
  const rng = createRng(seed);
  let state = createGame(DEFAULT_MAZE);
  for (const ch of inputs) {
    state = step(state, INPUT_MAP[ch], rng);
  }
  process.stdout.write(`${render(state)}\n`);
  process.exit(0);
}

// ---------- 対話モード ----------
function runInteractive(seed) {
  if (!process.stdin.isTTY) {
    console.log('標準入力が TTY ではないため対話モードを開始できません。--seed と --inputs を指定してください。');
    process.exit(0);
    return;
  }

  const rng = createRng(seed);
  let state = createGame(DEFAULT_MAZE);
  let pendingInput = null;
  let timer = null;

  function draw(footer) {
    process.stdout.write(`\x1b[2J\x1b[H${render(state)}\n${footer}`);
  }

  function cleanup() {
    if (timer) clearInterval(timer);
    process.stdin.removeListener('keypress', onKeypress);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  function onKeypress(str, key) {
    if (!key) return;
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      cleanup();
      process.exit(0);
      return;
    }
    if (state.status !== 'playing') {
      if (key.name === 'return') {
        cleanup();
        process.exit(0);
      }
      return;
    }
    if (KEY_DIR[key.name]) {
      pendingInput = KEY_DIR[key.name];
    }
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('keypress', onKeypress);

  draw('矢印キーで移動 / q で終了');
  timer = setInterval(() => {
    state = step(state, pendingInput, rng);
    pendingInput = null;
    if (state.status !== 'playing') {
      clearInterval(timer);
      timer = null;
      draw('Enter で終了');
    } else {
      draw('矢印キーで移動 / q で終了');
    }
  }, 125);
}

// ---------- エントリポイント ----------
function main() {
  const argv = process.argv.slice(2);
  const { seedStr, hasSeed, inputs, hasInputs } = parseArgs(argv);

  let seed;
  if (hasSeed) {
    seed = Number(seedStr);
    if (seedStr === undefined || seedStr === '' || !Number.isInteger(seed)) {
      process.stderr.write('--seed は整数で指定してください\n');
      process.exit(1);
      return;
    }
  }

  if (hasInputs) {
    runNonInteractive(hasSeed ? seed : Date.now(), inputs ?? '');
    return;
  }

  runInteractive(hasSeed ? seed : Date.now());
}

function isDirectlyExecuted() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isDirectlyExecuted()) {
  main();
}
