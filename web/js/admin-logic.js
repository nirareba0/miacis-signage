/**
 * admin-logic.js - 管理ページ用の純粋ロジック関数（日付計算、期限切れ判定、タイトル抽出等）
 */

/**
 * 'YYYY-MM-DD' 文字列に n 日を加減算した 'YYYY-MM-DD' を返す
 */
export function addDays(dateStr, n) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';

  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 2つの 'YYYY-MM-DD' の日数差（to - from）を返す
 */
export function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

/**
 * 終了日から指定日数（既定30日）を過ぎたスライドを抽出する
 * @param {Array<{id: string, ends_on: string, storage_path: string}>} slides
 * @param {string} today 'YYYY-MM-DD'
 * @param {number} days 既定 30
 * @returns {Array} 削除対象スライドの配列
 */
export function expiredForPurge(slides, today, days = 30) {
  if (!Array.isArray(slides)) return [];
  return slides.filter((slide) => {
    if (!slide || !slide.ends_on) return false;
    return daysBetween(slide.ends_on, today) > days;
  });
}

/**
 * 今日の日付から、新規スライドの既定の期間（今日〜今日+13日）を返す
 */
export function defaultDates(today) {
  return {
    starts_on: today,
    ends_on: addDays(today, 13),
  };
}

/**
 * ファイル名から拡張子を取り除いた既定タイトルを返す
 */
export function cleanFileNameTitle(fileName) {
  if (!fileName || typeof fileName !== 'string') return '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return fileName;
  return fileName.substring(0, lastDot);
}
