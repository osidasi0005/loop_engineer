import { DIRS, OPPOSITE, openDirections } from './maze.mjs';

/**
 * モードに応じた目標座標を返す。
 * chase は自機、scatter は担当コーナー、frightened は目標なし（null）。
 * @param {'chase'|'scatter'|'frightened'} mode
 * @param {{x:number,y:number}} player
 * @param {{x:number,y:number}} corner
 * @returns {{x:number,y:number}|null}
 */
export function targetFor(mode, player, corner) {
  if (mode === 'chase') return player;
  if (mode === 'scatter') return corner;
  return null;
}

/**
 * 敵が次に進む方向を選ぶ。逆走は候補から外し、それしか無いときだけ逆走する。
 * frightened は候補から rng で一様に選び、他は目標に最も近づく候補を選ぶ。
 * @param {object} maze
 * @param {{x:number,y:number,dir:?string,mode:string}} ghost
 * @param {{x:number,y:number}|null} target
 * @param {() => number} [rng]
 * @returns {'up'|'left'|'down'|'right'}
 */
export function chooseDirection(maze, ghost, target, rng) {
  const back = ghost.dir === null || ghost.dir === undefined ? null : OPPOSITE[ghost.dir];
  const open = openDirections(maze, ghost);
  const candidates = back === null ? open : open.filter((name) => name !== back);
  if (candidates.length === 0) return back;

  if (ghost.mode === 'frightened') {
    return candidates[Math.floor(rng() * candidates.length)];
  }

  let best = candidates[0];
  let bestDist = Infinity;
  for (const name of candidates) {
    const d = DIRS[name];
    const dx = ghost.x + d.dx - target.x;
    const dy = ghost.y + d.dy - target.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}

/**
 * 選んだ方向へ 1 マス進めた新しい敵オブジェクトを返す。
 * dir は選んだ方向に更新し、他のプロパティはそのまま保つ。入力は変更しない。
 * @param {object} maze
 * @param {{x:number,y:number,dir:?string,mode:string}} ghost
 * @param {{x:number,y:number}|null} target
 * @param {() => number} [rng]
 * @returns {object}
 */
export function moveGhost(maze, ghost, target, rng) {
  const dir = chooseDirection(maze, ghost, target, rng);
  const d = DIRS[dir];
  return { ...ghost, x: ghost.x + d.dx, y: ghost.y + d.dy, dir };
}

/**
 * モードを変更した新しい敵オブジェクトを返す。
 * モードが変わるときだけ dir を逆方向にする（null なら null のまま）。
 * @param {{x:number,y:number,dir:?string,mode:string}} ghost
 * @param {'chase'|'scatter'|'frightened'} mode
 * @returns {object}
 */
export function setMode(ghost, mode) {
  if (ghost.mode === mode) return { ...ghost };
  const dir = ghost.dir === null || ghost.dir === undefined ? ghost.dir : OPPOSITE[ghost.dir];
  return { ...ghost, dir, mode };
}
