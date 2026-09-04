/**
 * 文字列を URL スラッグに変換する。
 * 小文字化し、NFD 正規化で結合文字（U+0300〜U+036F）を除去し、英数字以外の連続をハイフン 1 つにまとめる。
 * @param {string} text 変換対象の文字列
 * @returns {string} スラッグ（空文字なら空文字）
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
