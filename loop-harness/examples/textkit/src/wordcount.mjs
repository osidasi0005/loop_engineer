import { WORD_SEPARATOR } from './contract.mjs';
/** 単語数を数える（暫定版） */
export function wordCount(text) {
  return text.split(WORD_SEPARATOR).length;
}
