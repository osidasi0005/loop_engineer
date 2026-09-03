/**
 * 文字列を URL スラッグに変換する。
 * 小文字化・アクセント除去・非英数字の連続をハイフン 1 つに・先頭末尾のハイフン除去。
 */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
