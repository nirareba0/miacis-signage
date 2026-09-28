import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  daysBetween,
  expiredForPurge,
  defaultDates,
  cleanFileNameTitle,
} from '../js/admin-logic.js';

test('addDays: 通常の日付加算', () => {
  assert.equal(addDays('2026-09-10', 5), '2026-09-15');
});

test('addDays: 月末またぎ (9月30日 -> 10月)', () => {
  assert.equal(addDays('2026-09-28', 5), '2026-10-03');
  assert.equal(addDays('2026-09-28', 13), '2026-10-11');
});

test('addDays: 年末またぎ (12月31日 -> 翌年1月)', () => {
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('addDays: うるう年の加算・減算', () => {
  // 2024 年はうるう年
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  // 2026 年は平年
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween: 日数差の計算', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-01'), 0);
  assert.equal(daysBetween('2026-09-01', '2026-09-10'), 9);
  assert.equal(daysBetween('2026-09-10', '2026-09-01'), -9);
  // 月またぎ
  assert.equal(daysBetween('2026-09-28', '2026-10-05'), 7);
  // 年またぎ
  assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
});

test('expiredForPurge: 終了日から30日過ぎたスライドだけを抽出', () => {
  const today = '2026-10-01';
  const slides = [
    { id: '1', ends_on: '2026-09-01' }, // 30日前 (ちょうど30日: 削除しない)
    { id: '2', ends_on: '2026-08-31' }, // 31日前 (30日超過: 削除対象)
    { id: '3', ends_on: '2026-08-15' }, // 47日前 (削除対象)
    { id: '4', ends_on: '2026-10-05' }, // 未来 (未終了: 削除しない)
    { id: '5', ends_on: '2026-10-01' }, // 当日終了 (削除しない)
  ];

  const expired = expiredForPurge(slides, today, 30);
  const ids = expired.map(s => s.id).sort();
  assert.deepEqual(ids, ['2', '3']);
});

test('defaultDates: 今日から13日後（計14日間）を返す', () => {
  assert.deepEqual(defaultDates('2026-09-28'), {
    starts_on: '2026-09-28',
    ends_on: '2026-10-11',
  });
});

test('cleanFileNameTitle: 拡張子の除去', () => {
  assert.equal(cleanFileNameTitle('秋祭りポスター.png'), '秋祭りポスター');
  assert.equal(cleanFileNameTitle('event.preview.2026.mp4'), 'event.preview.2026');
  assert.equal(cleanFileNameTitle('README'), 'README');
  assert.equal(cleanFileNameTitle(''), '');
});
