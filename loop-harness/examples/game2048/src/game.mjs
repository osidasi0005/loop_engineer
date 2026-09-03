/**
 * 2048 の盤面ロジック（純関数のみ、I/O なし）。
 * 盤面は 4x4 の number[][]（board[row][col]）、空きマスは 0。
 */

const SIZE = 4;
const DIRECTIONS = ['left', 'right', 'up', 'down'];

/**
 * 盤面を新しい二次元配列として複製する（内部ヘルパー）。
 * @param {number[][]} board
 * @returns {number[][]}
 */
function cloneBoard(board) {
  return board.map((row) => [...row]);
}

/**
 * 1 行を左方向へ寄せて併合し、新しい行と獲得点を返す（内部ヘルパー）。
 * 併合は 1 手につき同じタイルに対して 1 回まで、左側を優先する。
 * @param {number[]} line
 * @returns {{ line: number[], gained: number }}
 */
function collapseLeft(line) {
  const packed = line.filter((v) => v !== 0);
  const result = [];
  let gained = 0;
  for (let i = 0; i < packed.length; i += 1) {
    if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
      const merged = packed[i] * 2;
      result.push(merged);
      gained += merged;
      i += 1;
    } else {
      result.push(packed[i]);
    }
  }
  while (result.length < line.length) result.push(0);
  return { line: result, gained };
}

/**
 * 盤面を指定方向へ寄せて併合した結果を返す。入力の盤面は変更しない。
 * @param {number[][]} board 4x4 の盤面
 * @param {'left'|'right'|'up'|'down'} direction 寄せる方向
 * @returns {{ board: number[][], gained: number, moved: boolean }}
 */
export function slide(board, direction) {
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`不正な方向: ${String(direction)}`);
  }
  const next = cloneBoard(board);
  let gained = 0;
  let moved = false;
  const vertical = direction === 'up' || direction === 'down';
  const reversed = direction === 'right' || direction === 'down';

  for (let i = 0; i < SIZE; i += 1) {
    const original = [];
    for (let j = 0; j < SIZE; j += 1) {
      original.push(vertical ? next[j][i] : next[i][j]);
    }
    const input = reversed ? [...original].reverse() : original;
    const collapsed = collapseLeft(input);
    const output = reversed ? [...collapsed.line].reverse() : collapsed.line;
    gained += collapsed.gained;
    for (let j = 0; j < SIZE; j += 1) {
      if (output[j] !== original[j]) moved = true;
      if (vertical) next[j][i] = output[j];
      else next[i][j] = output[j];
    }
  }
  return { board: next, gained, moved };
}

/**
 * 空きマスを 1 つ選び、rng() < 0.9 なら 2、そうでなければ 4 を置いた新しい盤面を返す。
 * 空きマスが無ければ同じ内容のコピーを返す。
 * @param {number[][]} board 4x4 の盤面
 * @param {() => number} rng 0 以上 1 未満を返す乱数関数
 * @returns {number[][]}
 */
export function spawn(board, rng) {
  const next = cloneBoard(board);
  const empties = [];
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      if (next[i][j] === 0) empties.push([i, j]);
    }
  }
  if (empties.length === 0) return next;
  const [row, col] = empties[Math.floor(rng() * empties.length) % empties.length];
  next[row][col] = rng() < 0.9 ? 2 : 4;
  return next;
}

/**
 * 整数の種から決定的な乱数関数（線形合同法）を返す。
 * 同じ種なら同じ列を返し、値は 0 以上 1 未満。
 * @param {number} seed 整数の種
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * まだ動かせるか（空きマスがあるか、隣接する同じ数があるか）を返す。
 * @param {number[][]} board 4x4 の盤面
 * @returns {boolean}
 */
export function canMove(board) {
  for (let i = 0; i < SIZE; i += 1) {
    for (let j = 0; j < SIZE; j += 1) {
      const v = board[i][j];
      if (v === 0) return true;
      if (j + 1 < SIZE && board[i][j + 1] === v) return true;
      if (i + 1 < SIZE && board[i + 1][j] === v) return true;
    }
  }
  return false;
}

/**
 * 2048 以上のタイルが 1 つでもあるかを返す。
 * @param {number[][]} board 4x4 の盤面
 * @returns {boolean}
 */
export function hasWon(board) {
  return board.some((row) => row.some((v) => v >= 2048));
}
