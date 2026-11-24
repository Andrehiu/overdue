// Save backup code (v1.13.1): pure encode / decode / validate rules, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { BACKUP_KEYS, encodeBackup, decodeBackup, checksum, describeBackup } = await import('../src/backup.js');

const sample = {
  'overdue.settings.v1': '{"sfx":true,"music":false}',
  'overdue.progress.v1': '{"fines":1234,"unlocked":3}',
  'overdue.name.v1': '{"name":"Zoë ☕ 日本"}',
  'overdue.tips.v1': '{"seen":["firstrun"]}',
};

test('round trip keeps every key and unicode intact', () => {
  const r = decodeBackup(encodeBackup(sample));
  assert.equal(r.ok, true);
  assert.deepEqual(r.keys, sample);
});
test('code is versioned, one line, copy-paste safe', () => {
  const c = encodeBackup(sample);
  assert.match(c, /^OVD1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
});
test('whitespace and line breaks from pasting are ignored', () => {
  const c = encodeBackup(sample);
  const r = decodeBackup(`  ${c.slice(0, 20)}\n${c.slice(20)} \n`);
  assert.equal(r.ok, true);
});
test('only the known player keys are written; unknown keys are dropped', () => {
  const r = decodeBackup(encodeBackup({ ...sample, 'evil.key': '{}' }));
  assert.deepEqual(Object.keys(r.keys).sort(), Object.keys(sample).sort());
  assert.ok(Object.keys(r.keys).every((k) => BACKUP_KEYS.includes(k)));
});
test('bad checksum is rejected', () => {
  const c = encodeBackup(sample);
  const bad = c.slice(0, 12) + (c[12] === 'A' ? 'B' : 'A') + c.slice(13);
  const r = decodeBackup(bad);
  assert.equal(r.ok, false); assert.match(r.error, /damaged|checksum/);
});
test('truncated code is rejected', () => {
  const c = encodeBackup(sample);
  for (const cut of [c.length - 1, c.length - 9, Math.floor(c.length / 2), 8]) assert.equal(decodeBackup(c.slice(0, cut)).ok, false);
});
test('wrong version prefix is rejected with a clear message', () => {
  const r = decodeBackup(encodeBackup(sample).replace('OVD1:', 'OVD2:'));
  assert.equal(r.ok, false); assert.match(r.error, /different version/);
});
test('valid wrapper but wrong inner version / missing keys / non-JSON values are rejected', () => {
  const wrap = (obj) => { const body = Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return `OVD1:${body}.${checksum(body)}`; };
  assert.equal(decodeBackup(wrap({ v: 2, keys: sample })).ok, false);
  assert.equal(decodeBackup(wrap({ v: 1 })).ok, false);
  assert.equal(decodeBackup(wrap({ v: 1, keys: {} })).ok, false);
  assert.equal(decodeBackup(wrap({ v: 1, keys: { 'overdue.progress.v1': 5 } })).ok, false);
  assert.equal(decodeBackup(wrap({ v: 1, keys: { 'overdue.progress.v1': '{oops' } })).ok, false);
  assert.equal(decodeBackup(wrap([1, 2])).ok, false);
});
test('junk input never throws', () => {
  for (const j of ['', '   ', 'hello', 'OVD', 'OVD1:', 'OVD1:!!!.zzzz', null, undefined, 42, {}, 'OVD1:' + 'A'.repeat(50) + '.00000000', '\u0000￿'])
    assert.equal(decodeBackup(j).ok, false);
});
test('describeBackup summarises fines', () => {
  assert.match(describeBackup({ 'overdue.progress.v1': '{"fines":12340}' }), /12,340 fines/);
  assert.match(describeBackup({ 'overdue.name.v1': '{}' }), /1 saved items/);
});
