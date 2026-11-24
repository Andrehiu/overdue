// Run log (v1.14.0): record build, ring buffer, Share stats code. Pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCounters, addDealt, addTaken, bookEnded, sampleFlight, histPercentile, buildRecord, pushRun, normalizeRuns, encodeStats, decodeStats, MAX_RUNS, RUN_KEY } from '../src/runlog.js';

const info = (o = {}) => {
  const c = newCounters();
  addDealt(c, 'throw', 120.04); addDealt(c, 'crit', 40); addDealt(c, 'orbit', 12); addDealt(c, 'nonsense', 3);
  addTaken(c, 'bunny'); addTaken(c, 'bunny'); addTaken(c, 'page:fan');
  return { version: '1.14.0', mode: 'story', wing: 4, room: 5, result: 'd', killer: 'page:fan', elite: true, perks: ['dewey', 'interlibrary'], banished: ['audiobook'], cursed: ['x'],
    doors: ['rare', 'rest'], reno: { spines: 3 }, time: 200.4, maxHp: 6, counters: c, ...o };
};

test('record: compact, versioned, damage by source rounded, killer only on death', () => {
  const r = buildRecord(info());
  assert.equal(r.v, 1); assert.equal(r.mode, 's'); assert.equal(r.res, 'd'); assert.equal(r.killer, 'page:fan'); assert.equal(r.elite, 1);
  assert.deepEqual(r.dealt, { throw: 120, crit: 40, orbit: 12, other: 3 });   // unknown source lands in "other"; zero sources are left out
  assert.deepEqual(r.taken, { bunny: 2, 'page:fan': 1 });
  assert.deepEqual(r.perks, ['dewey', 'interlibrary']); assert.equal(r.hp, 6); assert.equal(r.t, 200);
  const q = buildRecord(info({ result: 'q' })); assert.equal(q.killer, undefined);
  const w = buildRecord(info({ result: 'c' })); assert.equal(w.res, 'c'); assert.equal(w.killer, undefined);
  assert.equal(buildRecord(info({ mode: 'endless' })).wing, 0);
  assert.ok(JSON.stringify(r).length < 600, 'a record stays small');
});

test('counters: plain adds, histograms and percentiles', () => {
  const c = newCounters();
  for (let i = 0; i < 100; i++) sampleFlight(c, i < 90 ? 10 : 30);
  assert.equal(histPercentile(c.flight, 0.5), 10); assert.equal(histPercentile(c.flight, 0.95), 30);
  for (let i = 0; i < 10; i++) bookEnded(c, i * 0.1 + 0.01, i % 2 === 0);
  assert.equal(c.ended, 10); assert.equal(c.thrownHit, 5);
  assert.ok(Math.abs(histPercentile(c.life, 0.95, 0.1) - 0.9) < 1e-9);
  assert.equal(histPercentile(new Uint32Array(4), 0.5), 0);
});

test('ring buffer keeps the newest 50 and drops junk', () => {
  let runs = [];
  for (let i = 0; i < MAX_RUNS + 7; i++) runs = pushRun(runs, buildRecord(info({ room: (i % 7) + 1, time: i })));
  assert.equal(runs.length, MAX_RUNS); assert.equal(runs[MAX_RUNS - 1].t, MAX_RUNS + 6); assert.equal(runs[0].t, 7);
  assert.equal(pushRun(null, buildRecord(info())).length, 1);
  assert.equal(pushRun([{ junk: 1 }, 5, null], buildRecord(info())).length, 1);
  assert.deepEqual(normalizeRuns('nope'), []); assert.equal(normalizeRuns(new Array(80).fill(buildRecord(info()))).length, MAX_RUNS);
  assert.equal(RUN_KEY, 'overdue.runs.v1');
});

test('Share stats code round-trips, is one line, and rejects bad input', () => {
  const runs = [buildRecord(info()), buildRecord(info({ result: 'c', wing: 2 }))];
  const code = encodeStats(runs);
  assert.ok(code.startsWith('OVS1:') && !/\s/.test(code));
  const back = decodeStats(code);
  assert.ok(back.ok); assert.deepEqual(back.runs, runs);
  assert.ok(decodeStats(`  ${code.slice(0, 20)}\n${code.slice(20)}  `).ok, 'line breaks from pasting are ignored');
  const bad = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
  assert.match(decodeStats(bad).error, /damaged|checksum/);
  assert.equal(decodeStats(code.slice(0, 30)).ok, false);
  assert.equal(decodeStats('OVD1:abc.00000000').ok, false);
  for (const junk of [undefined, null, 42, {}, '', 'OVS1:', 'OVS1:!!!.zzzzzzzz', 'OVS1:e30.00000000']) assert.equal(decodeStats(junk).ok, false);
  assert.ok(encodeStats([]).startsWith('OVS1:') && decodeStats(encodeStats([])).ok);
  assert.ok(code.length < 1800, `two runs fit in ${code.length} chars`);
});

test('decode script: turns runs into a per-run table and a summary', async () => {
  const { report } = await import('../scripts/stats-decode.mjs');
  const runs = [buildRecord(info()), buildRecord(info({ result: 'c', wing: 2, room: 7 })), buildRecord(info({ killer: 'bunny', elite: false, room: 2 }))];
  const text = report(runs);
  assert.match(text, /3 runs/); assert.match(text, /\| 1 \| 1\.14\.0 \| story \| 4 \| 5 \| died \| page:fan \(elite\)/);
  assert.match(text, /Deaths by room[\s\S]*wing 4 room 5: 1/); assert.match(text, /dewey: 100%/); assert.match(text, /throw: \d+/);
  assert.match(report([]), /0 runs/);
});
