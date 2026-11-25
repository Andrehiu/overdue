import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, parseTerms, summarize, FIXTURE_MARK } from '../scripts/qa/privacy.mjs';

const code = 'OVD1' + ':' + 'eyJ2IjoxLCJmaW5lcyI6MTIzfQ'.repeat(2) + '.0a1b2c3d';
const stats = 'OVS1' + ':' + 'A'.repeat(24);
const save = '{"overdue.' + 'progress.v1": {"fines": 5}}';

test('pasted backup / stats codes are caught', () => {
  assert.equal(scanText('README.md', `restore ${code}`).length, 1);
  assert.equal(scanText('docs/x.md', stats).length, 1);
});
test('short or prose mentions of the prefixes are fine', () => {
  assert.deepEqual(scanText('src/backup.js', 'starts with OVD1: and a checksum'), []);
  assert.deepEqual(scanText('src/runlog.js', "const P = 'OVS1:';"), []);
});
test('save-shaped JSON is caught, bare key names are not', () => {
  assert.equal(scanText('notes.md', save).length, 1);
  assert.deepEqual(scanText('src/meta.js', "const KEY = 'overdue.progress.v1';"), []);
});
test('synthetic fixtures are exempt only under test/ and only when marked', () => {
  const marked = `${FIXTURE_MARK}\n${code}\n${save}`;
  assert.deepEqual(scanText('test/backup.test.js', marked), []);
  assert.equal(scanText('test/backup.test.js', `${code}`).length, 1);
  assert.equal(scanText('src/main.js', marked).length, 2);
});
test('private terms: case-insensitive, never echoed', () => {
  const hits = scanText('a.md', 'Hello SECRETNAME', parseTerms('secretname, other\n\n x '));
  assert.deepEqual(hits, ['private term in a.md']);
  assert.ok(!hits.join().toLowerCase().includes('secretname'));
});
test('parseTerms splits on commas and newlines', () => {
  assert.deepEqual(parseTerms('a, b\nc,,'), ['a', 'b', 'c']);
  assert.deepEqual(parseTerms(undefined), []);
});
test('summarize counts per label', () => {
  assert.deepEqual(summarize(['x in f', 'x in f', 'y in g']), ['2 hits: x in f', '1 hit: y in g']);
});
