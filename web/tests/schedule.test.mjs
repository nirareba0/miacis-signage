import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayInTokyo, slideStatus, pickSlides } from '../js/schedule.js';

const s = (id, starts_on, ends_on, sort_order = 0, created_at = '2026-09-01T00:00:00Z') =>
  ({ id, starts_on, ends_on, sort_order, created_at });

test('日本時間の日付: UTC 15:00 は翌日', () => {
  assert.equal(todayInTokyo(new Date('2026-09-22T14:59:59Z')), '2026-09-22');
  assert.equal(todayInTokyo(new Date('2026-09-22T15:00:00Z')), '2026-09-23');
});

test('終了日の当日はまだ出る・翌日は出ない', () => {
  const x = s('a', '2026-09-20', '2026-09-23');
  assert.equal(slideStatus(x, '2026-09-19'), 'upcoming');
  assert.equal(slideStatus(x, '2026-09-20'), 'showing');
  assert.equal(slideStatus(x, '2026-09-23'), 'showing');
  assert.equal(slideStatus(x, '2026-09-24'), 'ended');
});

test('pickSlides: 期間内のものだけを選ぶ', () => {
  const list = [s('past', '2026-09-01', '2026-09-10'), s('now', '2026-09-20', '2026-09-30'),
    s('future', '2026-10-01', '2026-10-05'), s('oneday', '2026-09-23', '2026-09-23')];
  const ids = pickSlides(list, '2026-09-23').map(x => x.id).sort();
  assert.deepEqual(ids, ['now', 'oneday']);
});

test('pickSlides: 開始日の早い順。同じなら先に載せたもの', () => {
  const list = [s('later-start', '2026-09-10', '2026-09-30', 0, '2026-09-01T00:00:00Z'),
    s('late', '2026-09-01', '2026-09-30', 0, '2026-09-05T00:00:00Z'),
    s('early', '2026-09-01', '2026-09-30', 0, '2026-09-02T00:00:00Z')];
  assert.deepEqual(pickSlides(list, '2026-09-23').map(x => x.id), ['early', 'late', 'later-start']);
});

test('pickSlides: 元の配列を変えない・空なら空', () => {
  const list = [s('b', '2026-09-01', '2026-09-30', 2), s('a', '2026-09-01', '2026-09-30', 1)];
  const copy = structuredClone(list);
  pickSlides(list, '2026-09-23');
  assert.deepEqual(list, copy);
  assert.deepEqual(pickSlides([], '2026-09-23'), []);
});
