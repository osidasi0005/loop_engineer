import { TRUNCATE_DEFAULT_MAX, ELLIPSIS } from './contract.mjs';

/**
 * 文字列を最大長に収める。超える場合は省略記号込みで長さが max になるよう切り詰める。
 * @param {string} text 対象の文字列
 * @param {number} [max=TRUNCATE_DEFAULT_MAX] 最大長
 * @returns {string} 最大長に収めた文字列
 */
export function truncate(text, max = TRUNCATE_DEFAULT_MAX) {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}
