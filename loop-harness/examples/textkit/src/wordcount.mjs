import { WORD_SEPARATOR } from './contract.mjs';

/**
 * 文字列中の単語数を数える。
 * 区切りは契約の WORD_SEPARATOR（空白の連続）で、先頭末尾の空白は数えない。
 * @param {string} text 対象の文字列
 * @returns {number} 単語数（空文字と空白だけの場合は 0）
 */
export function wordCount(text) {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(WORD_SEPARATOR).length;
}
