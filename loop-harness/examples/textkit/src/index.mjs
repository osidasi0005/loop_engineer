import { slugify } from './slugify.mjs';
import { wordCount } from './wordcount.mjs';
import { truncate } from './truncate.mjs';

export { slugify } from './slugify.mjs';
export { wordCount } from './wordcount.mjs';
export { truncate } from './truncate.mjs';
export { TRUNCATE_DEFAULT_MAX, ELLIPSIS, WORD_SEPARATOR } from './contract.mjs';

/**
 * テキストの要約を 1 つのオブジェクトにまとめる。
 * slug は slugify、words は wordCount、title は既定最大長の truncate。
 * @param {string} text 対象のテキスト
 * @returns {{ slug: string, words: number, title: string }}
 */
export function summarize(text) {
  return {
    slug: slugify(text),
    words: wordCount(text),
    title: truncate(text),
  };
}
