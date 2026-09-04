export { slugify } from './slugify.mjs';
export { wordCount } from './wordcount.mjs';
export { truncate } from './truncate.mjs';
export { TRUNCATE_DEFAULT_MAX, ELLIPSIS, WORD_SEPARATOR } from './contract.mjs';
import { slugify } from './slugify.mjs';
import { wordCount } from './wordcount.mjs';
import { truncate } from './truncate.mjs';

/** 見出し用の要約: slug / 単語数 / 切り詰めたタイトル */
export function summarize(text) {
  return { slug: slugify(text), words: wordCount(text), title: truncate(text) };
}
