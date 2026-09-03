/** 4 方向の移動量。up, left, down, right の順で定義する。 */
export const DIRS = {
  up: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  down: { dx: 0, dy: 1 },
  right: { dx: 1, dy: 0 },
};

/** 各方向の逆方向の名前。 */
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** DIRS の定義順（up, left, down, right）の方向名一覧。 */
const DIR_NAMES = Object.keys(DIRS);

/** 迷路として認識する文字の一覧。 */
const VALID_CHARS = new Set(['#', '.', 'o', ' ', 'P', 'G']);

/**
 * 迷路の文字列行を解析して盤面データにする。
 * 行の長さ不揃い、P が 1 個でない、未知の文字がある場合は Error を投げる。
 * @param {string[]} lines 1 要素が 1 行の文字列配列（変更しない）
 * @returns {{width:number, height:number, walls:boolean[][], pellets:number[][], player:{x:number,y:number}, ghosts:{x:number,y:number}[]}}
 */
export function parseMaze(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('迷路の行が空です');
  }
  const height = lines.length;
  const width = lines[0].length;
  const walls = [];
  const pellets = [];
  const ghosts = [];
  let player = null;

  for (let y = 0; y < height; y += 1) {
    const line = lines[y];
    if (typeof line !== 'string' || line.length !== width) {
      throw new Error(`行 ${y} の長さが揃っていません`);
    }
    const wallRow = [];
    const pelletRow = [];
    for (let x = 0; x < width; x += 1) {
      const ch = line[x];
      if (!VALID_CHARS.has(ch)) {
        throw new Error(`未知の文字です: ${JSON.stringify(ch)} (x=${x}, y=${y})`);
      }
      wallRow.push(ch === '#');
      pelletRow.push(ch === '.' ? 1 : ch === 'o' ? 2 : 0);
      if (ch === 'P') {
        if (player !== null) throw new Error('P が 2 個以上あります');
        player = { x, y };
      } else if (ch === 'G') {
        ghosts.push({ x, y });
      }
    }
    walls.push(wallRow);
    pellets.push(pelletRow);
  }

  if (player === null) throw new Error('P がありません');
  return { width, height, walls, pellets, player, ghosts };
}

/**
 * 指定座標が壁かどうかを返す。盤面の外は壁とみなす。
 * @param {{width:number, height:number, walls:boolean[][]}} maze
 * @returns {boolean}
 */
export function isWall(maze, x, y) {
  if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) return true;
  return maze.walls[y][x] === true;
}

/**
 * 自機を 1 マス動かした座標を新しいオブジェクトで返す。
 * 進む先が壁なら同じ座標を（やはり新しいオブジェクトで）返す。不正な dir は Error。
 * @param {object} maze
 * @param {{x:number,y:number}} pos
 * @param {'up'|'left'|'down'|'right'} dir
 * @returns {{x:number,y:number}}
 */
export function movePlayer(maze, pos, dir) {
  const d = DIRS[dir];
  if (!d || !Object.prototype.hasOwnProperty.call(DIRS, dir)) {
    throw new Error(`不正な方向です: ${String(dir)}`);
  }
  const nx = pos.x + d.dx;
  const ny = pos.y + d.dy;
  if (isWall(maze, nx, ny)) return { x: pos.x, y: pos.y };
  return { x: nx, y: ny };
}

/**
 * 指定マスの餌を食べた結果を返す。元の配列は変更しない。
 * @param {number[][]} pellets
 * @param {{x:number,y:number}} pos
 * @returns {{pellets:number[][], eaten:number}}
 */
export function eatPellet(pellets, pos) {
  const next = pellets.map((row) => row.slice());
  const row = next[pos.y];
  if (!row || row[pos.x] === undefined) return { pellets: next, eaten: 0 };
  const eaten = row[pos.x];
  row[pos.x] = 0;
  return { pellets: next, eaten };
}

/**
 * 残っている餌（値が 0 でないマス）の数を数える。
 * @param {number[][]} pellets
 * @returns {number}
 */
export function countPellets(pellets) {
  let count = 0;
  for (const row of pellets) {
    for (const v of row) if (v !== 0) count += 1;
  }
  return count;
}

/**
 * 指定座標から進める（壁でない）方向名を up, left, down, right の順で返す。
 * @param {object} maze
 * @param {{x:number,y:number}} pos
 * @returns {string[]}
 */
export function openDirections(maze, pos) {
  return DIR_NAMES.filter((name) => {
    const d = DIRS[name];
    return !isWall(maze, pos.x + d.dx, pos.y + d.dy);
  });
}
