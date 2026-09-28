// 表示ページと管理ページが共有する「今日なにを流すか」の規則。DOM にも Supabase にも触らない。
// 日付はすべて日本時間の 'YYYY-MM-DD' 文字列で扱う（文字列のまま大小比較できる）。

/** 日本時間の今日を 'YYYY-MM-DD' で返す。端末の時刻設定（タイムゾーン）に左右されない。 */
export function todayInTokyo(now = new Date()) {
  // en-CA は YYYY-MM-DD の形で出る
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * 1件のスライドが、指定した日にどの状態か。
 * @returns {'upcoming'|'showing'|'ended'}
 */
export function slideStatus(slide, today) {
  if (today < slide.starts_on) return 'upcoming';
  if (today > slide.ends_on) return 'ended'; // 終了日はその日の終わりまで出す
  return 'showing';
}

/**
 * 今日流すスライドを、流す順に並べて返す。元の配列は変えない。
 * 並べ方は日付順（本人の指示 2026-09-28）: 開始日の早いもの → 同じなら先に載せたもの。
 * @param {Array<{id:string, starts_on:string, ends_on:string, created_at:string}>} slides
 * @param {string} today 'YYYY-MM-DD'（日本時間）
 * @returns {Array} 流す順のスライド
 */
export function pickSlides(slides, today) {
  return slides
    .filter((slide) => slideStatus(slide, today) === 'showing')
    .sort((a, b) =>
      a.starts_on.localeCompare(b.starts_on) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)); // 最後は id で決めて、読み直すたびに順番が揺れないようにする
}
