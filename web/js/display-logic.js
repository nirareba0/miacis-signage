/**
 * display-logic.js - 表示ページ用の純粋ロジック関数（DOM や Supabase に依存しない）
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * スライドのキャッシュキーを生成する（id + updated_at）
 */
export function getBlobKey(slide) {
  if (!slide || !slide.id) return '';
  return `${slide.id}_${slide.updated_at || ''}`;
}

/**
 * 古くなった Blob URL を解放し、キャッシュマップを整理する
 * @param {Map<string, string>} cacheMap key -> objectUrl
 * @param {Array<{id: string, updated_at: string}>} currentSlides
 * @param {(url: string) => void} revokeFn URL.revokeObjectURL
 * @returns {number} 解放された件数
 */
export function cleanBlobCache(cacheMap, currentSlides, revokeFn = () => {}) {
  const validKeys = new Set((currentSlides || []).map(getBlobKey));
  let revokedCount = 0;

  for (const [key, url] of cacheMap.entries()) {
    if (!validKeys.has(key)) {
      try {
        revokeFn(url);
      } catch (err) {
        console.error('Failed to revoke object URL:', err);
      }
      cacheMap.delete(key);
      revokedCount++;
    }
  }

  return revokedCount;
}

/**
 * 次のスライドのインデックスを計算する
 */
export function getNextIndex(currentIndex, totalCount) {
  if (!totalCount || totalCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= totalCount) return 0;
  return (currentIndex + 1) % totalCount;
}

/**
 * 現在のスライド ID をもとに、次のスライドを返す
 */
export function getNextSlide(slides, currentSlideId) {
  if (!slides || slides.length === 0) return null;
  if (!currentSlideId) return slides[0];

  const idx = slides.findIndex(s => s.id === currentSlideId);
  if (idx === -1) return slides[0];
  const nextIdx = (idx + 1) % slides.length;
  return slides[nextIdx];
}

/**
 * 次の日本時間 04:00:00 までのミリ秒を計算する
 * 端末のローカルタイムゾーン設定に依存しない
 */
export function msUntilNext4AM(now = new Date()) {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const tokyoUtc = new Date(nowMs + JST_OFFSET_MS);

  let targetUtc = new Date(Date.UTC(
    tokyoUtc.getUTCFullYear(),
    tokyoUtc.getUTCMonth(),
    tokyoUtc.getUTCDate(),
    4, 0, 0, 0
  ));

  if (tokyoUtc.getTime() >= targetUtc.getTime()) {
    // 今日の 4:00 は既に過ぎているため翌日の 4:00 を目指す
    targetUtc.setUTCDate(targetUtc.getUTCDate() + 1);
  }

  const targetEpoch = targetUtc.getTime() - JST_OFFSET_MS;
  return targetEpoch - nowMs;
}

/**
 * 次の日本時間 00:00:00（日付変更）までのミリ秒を計算する
 */
export function msUntilNextMidnight(now = new Date()) {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const tokyoUtc = new Date(nowMs + JST_OFFSET_MS);

  const targetUtc = new Date(Date.UTC(
    tokyoUtc.getUTCFullYear(),
    tokyoUtc.getUTCMonth(),
    tokyoUtc.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  const targetEpoch = targetUtc.getTime() - JST_OFFSET_MS;
  const diff = targetEpoch - nowMs;
  return diff > 0 ? diff : 24 * 60 * 60 * 1000;
}

/**
 * 日本時間の HH:MM を返す
 */
export function formatClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

/**
 * 画面を何度回すか（モニターを縦に置いたとき用）。'0' | '90' | '270'。
 * URL の ?rotate= が最優先（キオスクの起動 URL に書ける）。無ければ端末に覚えた値。
 * ?rotate=0 は「回さない」を明示して、覚えた値も消す。
 * @param {string} search location.search
 * @param {string|null} stored 端末に覚えた値
 * @returns {{ rotate: '0'|'90'|'270', save: string|null }} save は端末に覚え直す値（null なら触らない）
 */
export function resolveRotation(search, stored) {
  const allowed = ['0', '90', '270'];
  const fromUrl = new URLSearchParams(search || '').get('rotate');
  if (fromUrl !== null) {
    const r = allowed.includes(fromUrl) ? fromUrl : '0';
    return { rotate: r, save: r };
  }
  return { rotate: allowed.includes(stored) ? stored : '0', save: null };
}
