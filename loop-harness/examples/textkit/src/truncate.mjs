import { TRUNCATE_DEFAULT_MAX, ELLIPSIS } from './contract.mjs';
/** 最大長を超える文字列を、省略記号込みで最大長に収める */
export function truncate(text, max = TRUNCATE_DEFAULT_MAX) {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}
