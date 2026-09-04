/** スラッグの最大文字数（slugify 固有のため、このモジュールに置く） */
const MAX_SLUG_LENGTH = 50;

/**
 * 文字列を URL スラッグに変換する（小文字化・結合文字除去・英数字以外の連続をハイフン 1 つに）。
 * 結果が MAX_SLUG_LENGTH を超える場合は切り詰め、末尾のハイフンを除く。
 * @param {string} text 変換対象の文字列
 * @returns {string} スラッグ（空文字なら空文字）
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
