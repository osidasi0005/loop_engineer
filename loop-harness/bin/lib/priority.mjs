// priority.mjs — ランナー自身の OS プロセス優先度を下げ、内側のエージェントと検証コマンドをその優先度で走らせる
//
// loop.mjs / wave.mjs は自分では CPU をほとんど使わないが、内側の `claude -p` や `node --test`、Electron が
// 並列数ぶん同時に走ると PC 全体が重くなる。ランナーの優先度を下げておけば、子プロセスは
// Windows でも Linux でもその優先度を引き継ぐ（Windows は BELOW_NORMAL / IDLE のときだけ子に伝わる。
// nice 値は常に継承される）。CPU の総使用量は減らないが、人間の作業（エディタ・ブラウザ）が引っかかりにくくなる。
//
//   normal        既定。何もしない
//   below-normal  少し下げる（他の作業を優先させたいとき。まずはこれ）
//   low           最も下げる（Windows の IDLE_PRIORITY_CLASS / nice 19。他が空いているときだけ CPU を使う）

import { setPriority, constants } from 'node:os';

const LEVELS = {
  normal: { value: constants.priority.PRIORITY_NORMAL, label: 'normal' },
  'below-normal': { value: constants.priority.PRIORITY_BELOW_NORMAL, label: 'below-normal' },
  low: { value: constants.priority.PRIORITY_LOW, label: 'low' },
};
const ALIASES = { belownormal: 'below-normal', below_normal: 'below-normal', idle: 'low', lowest: 'low' };

export const PRIORITY_NAMES = Object.keys(LEVELS);

/** 優先度の名前を正規化する。不明なら null */
export function normalizePriority(name) {
  if (name == null || name === '') return 'normal';
  const key = String(name).trim().toLowerCase();
  const n = ALIASES[key] ?? key;
  return LEVELS[n] ? n : null;
}

/**
 * 現在のプロセス（= ランナー）の優先度を設定する。以後に spawn する子プロセスはこれを引き継ぐ。
 * 戻り値は { name, changed, error }。normal なら何もしない。失敗しても例外にはせず error に理由を入れる
 * （優先度を「上げる」には権限が要るが、下げるだけなら通常は失敗しない）。
 */
export function applyPriority(name) {
  const n = normalizePriority(name);
  if (!n) return { name: String(name), changed: false, error: `不明な優先度: ${name}（${PRIORITY_NAMES.join(' / ')}）` };
  if (n === 'normal') return { name: n, changed: false, error: null };
  try {
    setPriority(process.pid, LEVELS[n].value);
    return { name: n, changed: true, error: null };
  } catch (e) {
    return { name: n, changed: false, error: e.message };
  }
}
