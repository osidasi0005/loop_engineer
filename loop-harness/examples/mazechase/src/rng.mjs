/**
 * 整数の種から決定的な擬似乱数関数を作る（線形合同法）。
 * 戻り値は呼ぶたびに 0 以上 1 未満の数を返す関数。
 * @param {number} seed 種となる整数
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = (Math.trunc(seed) >>> 0) || 1;
  return () => {
    // Numerical Recipes の LCG 係数（mod 2^32）
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
