import { TRUNCATE_DEFAULT_MAX, ELLIPSIS } from './contract.mjs';

/**
 * 文字列 text を最大長 max（既定は TRUNCATE_DEFAULT_MAX）に収める。
 * 超える場合は末尾を ELLIPSIS にして、省略記号込みの長さを max にする。
 */
export function truncate(text, max = TRUNCATE_DEFAULT_MAX) {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}
