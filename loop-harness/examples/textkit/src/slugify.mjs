/**
 * 文字列を URL スラッグに変換する（小文字化・結合文字除去・英数字以外の連続をハイフン 1 つに）。
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
