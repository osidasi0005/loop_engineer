import { WORD_SEPARATOR } from './contract.mjs';
/** 単語数を数える。空白だけなら 0 */
export function wordCount(text) {
  const t = text.trim();
  return t === '' ? 0 : t.split(WORD_SEPARATOR).length;
}
