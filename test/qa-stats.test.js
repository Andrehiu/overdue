import test from 'node:test';
import assert from 'node:assert/strict';
import { median, spread } from '../scripts/qa/stats.mjs';

test('median of odd and even lists, unsorted input untouched', () => {
  const xs = [5, 1, 3];
  assert.equal(median(xs), 3);
  assert.deepEqual(xs, [5, 1, 3]);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
});
test('median ignores one outlier sample', () => {
  assert.equal(median([52, 53, 12, 51, 52]), 52);
});
test('spread reports min / median / max', () => {
  assert.deepEqual(spread([3, 9, 5]), { min: 3, median: 5, max: 9 });
});
