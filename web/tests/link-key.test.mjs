import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLinkKey } from '../js/link-key.js';

test('readLinkKey: #k= の鍵を取り出す', () => {
  assert.equal(readLinkKey('#k=Abc_def-123456789XYZ'), 'Abc_def-123456789XYZ');
  assert.equal(readLinkKey('#rotate=90&k=Abc_def-123456789XYZ'), 'Abc_def-123456789XYZ');
});

test('readLinkKey: 無い・短い・空なら null', () => {
  assert.equal(readLinkKey(''), null);
  assert.equal(readLinkKey('#'), null);
  assert.equal(readLinkKey('#k='), null);
  assert.equal(readLinkKey('#k=short'), null);
  assert.equal(readLinkKey(undefined), null);
});
