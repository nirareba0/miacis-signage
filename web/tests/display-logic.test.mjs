import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBlobKey,
  cleanBlobCache,
  getNextIndex,
  getNextSlide,
  msUntilNext4AM,
  msUntilNextMidnight,
  formatClock,
} from '../js/display-logic.js';

test('getBlobKey: id と updated_at からキーを作成する', () => {
  assert.equal(getBlobKey({ id: 's1', updated_at: '2026-09-28T12:00:00Z' }), 's1_2026-09-28T12:00:00Z');
  assert.equal(getBlobKey({ id: 's2' }), 's2_');
  assert.equal(getBlobKey(null), '');
});

test('cleanBlobCache: 一覧から消えた古いキーの URL を revoke して削除する', () => {
  const cacheMap = new Map();
  cacheMap.set('s1_v1', 'blob:http://localhost/1');
  cacheMap.set('s2_v1', 'blob:http://localhost/2');
  cacheMap.set('s3_v1', 'blob:http://localhost/3');

  const revoked = [];
  const revokeFn = (url) => revoked.push(url);

  // s1_v1, s3_v2 が現在の一覧（s2 は消え、s3 は更新された）
  const currentSlides = [
    { id: 's1', updated_at: 'v1' },
    { id: 's3', updated_at: 'v2' },
  ];

  const count = cleanBlobCache(cacheMap, currentSlides, revokeFn);
  assert.equal(count, 2);
  assert.deepEqual(revoked.sort(), ['blob:http://localhost/2', 'blob:http://localhost/3']);
  assert.equal(cacheMap.has('s1_v1'), true);
  assert.equal(cacheMap.has('s2_v1'), false);
  assert.equal(cacheMap.has('s3_v1'), false);
});

test('getNextIndex: インデックスをループして返す', () => {
  assert.equal(getNextIndex(0, 3), 1);
  assert.equal(getNextIndex(1, 3), 2);
  assert.equal(getNextIndex(2, 3), 0);
  assert.equal(getNextIndex(-1, 3), 0);
  assert.equal(getNextIndex(5, 3), 0);
  assert.equal(getNextIndex(0, 0), -1);
});

test('getNextSlide: 次のスライドを正しく選択する', () => {
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(getNextSlide(slides, 'a'), { id: 'b' });
  assert.deepEqual(getNextSlide(slides, 'b'), { id: 'c' });
  assert.deepEqual(getNextSlide(slides, 'c'), { id: 'a' });
  assert.deepEqual(getNextSlide(slides, 'unknown'), { id: 'a' });
  assert.deepEqual(getNextSlide(slides, null), { id: 'a' });
  assert.equal(getNextSlide([], 'a'), null);
});

test('msUntilNext4AM: 日本時間の4:00までのミリ秒を計算する', () => {
  // 2026-09-28 03:00:00 JST (= 2026-09-27 18:00:00 UTC) -> 4:00 までちょうど 1時間 (3600000 ms)
  const t1 = new Date('2026-09-27T18:00:00Z');
  assert.equal(msUntilNext4AM(t1), 3600 * 1000);

  // 2026-09-28 04:00:00 JST (= 2026-09-27 19:00:00 UTC) -> ちょうど4:00なので翌日4:00まで 24時間
  const t2 = new Date('2026-09-27T19:00:00Z');
  assert.equal(msUntilNext4AM(t2), 24 * 3600 * 1000);

  // 2026-09-28 05:00:00 JST (= 2026-09-27 20:00:00 UTC) -> 翌日4:00まで 23時間
  const t3 = new Date('2026-09-27T20:00:00Z');
  assert.equal(msUntilNext4AM(t3), 23 * 3600 * 1000);

  // 年末またぎ: 2026-12-31 23:30:00 JST (= 2026-12-31 14:30:00 UTC) -> 翌年01-01 04:00 JST まで 4.5時間
  const t4 = new Date('2026-12-31T14:30:00Z');
  assert.equal(msUntilNext4AM(t4), 4.5 * 3600 * 1000);
});

test('msUntilNextMidnight: 日本時間の日付変更までのミリ秒を計算する', () => {
  // 2026-09-28 23:00:00 JST (= 2026-09-28 14:00:00 UTC) -> 00:00 までちょうど 1時間
  const t1 = new Date('2026-09-28T14:00:00Z');
  assert.equal(msUntilNextMidnight(t1), 3600 * 1000);
});

test('formatClock: 日本時間で HH:MM を返す', () => {
  const d = new Date('2026-09-28T01:05:00Z'); // JST 10:05
  assert.equal(formatClock(d), '10:05');
});

test('resolveRotation: URL が最優先で、端末に覚え直す', async () => {
  const { resolveRotation } = await import('../js/display-logic.js');
  assert.deepEqual(resolveRotation('?rotate=90', null), { rotate: '90', save: '90' });
  assert.deepEqual(resolveRotation('?rotate=270', '90'), { rotate: '270', save: '270' });
  assert.deepEqual(resolveRotation('?rotate=0', '90'), { rotate: '0', save: '0' });
});

test('resolveRotation: URL に無ければ覚えた値。おかしな値は回さない', async () => {
  const { resolveRotation } = await import('../js/display-logic.js');
  assert.deepEqual(resolveRotation('', '90'), { rotate: '90', save: null });
  assert.deepEqual(resolveRotation('', null), { rotate: '0', save: null });
  assert.deepEqual(resolveRotation('?rotate=45', '90'), { rotate: '0', save: '0' });
  assert.deepEqual(resolveRotation('?x=1', 'abc'), { rotate: '0', save: null });
});
