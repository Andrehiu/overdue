// Balance bot (v1.7.1 tooling): pure helpers only, no browser. See scripts/balance-lib.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { chooseDoor, pickPerk, chooseMove, aggregate, findings, renderReport, roomStats, surviveChecks } = await import('../scripts/balance-lib.mjs');

test('door policies: rare, rest, mixed; Mystery Shelf only as a last resort; fixed doors are taken', () => {
  assert.equal(chooseDoor('rare', ['rest', 'rare'], 5), 'rare');
  assert.equal(chooseDoor('rare', ['rest', 'mystery'], 5), 'rest');
  assert.equal(chooseDoor('rare', ['stacks', 'mystery'], 5), 'stacks');
  assert.equal(chooseDoor('rest', ['rare', 'rest'], 5), 'rest');
  assert.equal(chooseDoor('rest', ['stacks', 'rare'], 5), 'stacks');
  assert.equal(chooseDoor('rest', ['rare', 'mystery'], 5), 'rare');
  assert.equal(chooseDoor('mixed', ['rare', 'rest'], 2), 'rest');
  assert.equal(chooseDoor('mixed', ['rare', 'rest'], 3), 'rare');
  assert.equal(chooseDoor('mixed', ['rest', 'mystery'], 4), 'rest');       // no Rare Books offered: first non-mystery
  assert.equal(chooseDoor('mixed', ['rare', 'mystery'], 1), 'rare');
  assert.equal(chooseDoor('rare', ['elite'], 3), 'elite');
  assert.equal(chooseDoor('rest', ['author'], 3), 'author');
});

test('perk priority: specials first, then damage / throw rate / hearts, cursed books last', () => {
  const c = (id, kind = 'perk') => ({ id, kind });
  assert.equal(pickPerk([c('bookmark'), c('hardcover'), c('speedreader')]), 1);
  assert.equal(pickPerk([c('speedreader'), c('extendedloan'), c('trilogy')]), 0);
  assert.equal(pickPerk([c('bannedbook', 'cursed'), c('readingnook')]), 1);
  assert.equal(pickPerk([c('hardcover'), c('m_tome', 'master')]), 1);
  assert.equal(pickPerk([c('somethingnew'), c('bannedbook', 'cursed')]), 0);
});

test('steering: runs from a threat, avoids shelves, holds or drifts to centre when nothing is near', () => {
  const base = { W: 960, H: 540, isSolid: () => false, prev: null };
  const away = chooseMove({ ...base, x: 480, y: 270, threats: [{ x: 540, y: 270, vx: 0, vy: 0, r: 11, w: 1 }] });
  assert.ok(away.x < -0.5, 'moves away from a threat on the right');
  // A shelf wall on the left blocks the escape: it must not walk into it.
  const wall = chooseMove({ ...base, x: 480, y: 270, isSolid: (x) => x < 440, threats: [{ x: 540, y: 270, vx: 0, vy: 0, r: 11, w: 1 }] });
  assert.ok(Math.abs(wall.y) > 0.3 || wall.x > -0.5, 'does not run straight into the shelf');
  // Never picks a heading toward a corner when a threat pushes from the middle.
  const calm = chooseMove({ ...base, x: 480, y: 270, threats: [] });
  assert.deepEqual(calm, { x: 0, y: 0 });
  const corner = chooseMove({ ...base, x: 40, y: 40, threats: [] });
  assert.ok(corner.x > 0 && corner.y > 0, 'drifts back toward the middle');
  const unit = Math.hypot(away.x, away.y);
  assert.ok(Math.abs(unit - 1) < 1e-9);
});

const run = (o) => ({ renos: 'none', wing: 1, policy: 'rare', outcome: 'death', room: 3, hearts: 0, fines: 10, time: 100, ...o });
test('aggregation: clear rate, death rooms, hearts, fines, time, timeouts; errors are left out', () => {
  const rows = aggregate([
    run({ outcome: 'clear', room: 7, hearts: 4, fines: 100, time: 300 }),
    run({ outcome: 'clear', room: 7, hearts: 2, fines: 120, time: 340 }),
    run({ room: 3, fines: 20, time: 60 }),
    run({ outcome: 'timeout', room: 7, fines: 40, time: 200 }),
    run({ outcome: 'error', room: 0 }),
  ]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.runs, 4); assert.equal(r.errors, 1);
  assert.equal(r.clearRate, 0.5); assert.equal(r.heartsLeft, 3);
  assert.equal(r.fines, 70); assert.equal(r.timeouts, 1);
  assert.deepEqual(r.deathRooms, [0, 0, 1, 0, 0, 0, 0]);
  assert.equal(r.time, 225);
});

test('what-stands-out: biggest wing drop, best policy, death pile-up; report renders', () => {
  const many = (wing, policy, clears, total, deathRoom, fines) => Array.from({ length: total }, (_, i) =>
    run({ wing, policy, outcome: i < clears ? 'clear' : 'death', room: i < clears ? 10 : deathRoom, hearts: 3, fines }));
  const results = [
    ...many(1, 'rare', 18, 20, 5, 90), ...many(1, 'rest', 19, 20, 5, 60),
    ...many(4, 'rare', 12, 20, 5, 120), ...many(4, 'rest', 16, 20, 5, 70),
    ...many(7, 'rare', 2, 20, 6, 150), ...many(7, 'rest', 5, 20, 6, 80),
  ];
  const rows = aggregate(results);
  const f = findings(rows).join('\n');
  assert.match(f, /Biggest clear-rate drop.*wing 4 → wing 7/);
  assert.match(f, /Wing 7.*"rare" earns the most fines/);
  assert.match(f, /deaths happen in room 6/);
  const md = renderReport(rows, { runsPerCell: 20, version: 't' });
  assert.match(md, /What stands out/);
  assert.match(md, /\| 7 \| rest \|/);
});

test('the balance bot knows the wing length', async () => {
  const { ROOMS } = await import('../scripts/balance-lib.mjs');
  const { ROOMS_PER_WING } = await import('../src/story.js');
  assert.equal(ROOMS, ROOMS_PER_WING);
});

test('per-room stats: reached counts, death share and reach-conditional death rate', () => {
  const run = (outcome, room) => ({ renos: 'none', wing: 1, policy: 'rest', outcome, room, hearts: 0, fines: 0, time: 1 });
  const [row] = aggregate([run('death', 2), run('death', 2), run('death', 4), run('clear', 7)]);
  assert.deepEqual(row.reached, [4, 4, 2, 2, 1, 1, 1]);
  const s = roomStats([row]);
  assert.equal(s[1].deaths, 2);
  assert.ok(Math.abs(s[1].share - 2 / 3) < 1e-9);   // 2 of 3 deaths
  assert.equal(s[1].rate, 0.5);                       // 2 deaths / 4 reached
  assert.equal(s[3].rate, 0.5);                       // 1 death / 2 reached
  assert.equal(s[6].rate, 0);
});

test('survive check: compares with the clear rooms around it, verdict easy / fine / hard', () => {
  const info = (r) => ({ goal: r === 3 ? 'survive' : 'clear', kind: r === 4 ? 'elite' : 'normal' });
  const mk = (rates) => rates.map((rate, i) => ({ room: i + 1, reached: 10, deaths: 0, share: 0, rate }));
  const v = (rates) => surviveChecks(mk(rates), info)[0];
  assert.equal(v([0, 0.2, 0.2, 0.9, 0, 0, 0]).verdict, 'fine');   // room 4 is elite: only room 2 counts as the reference
  assert.equal(v([0, 0.2, 0.05, 0.9, 0, 0, 0]).verdict, 'easy');
  assert.equal(v([0, 0.2, 0.4, 0.9, 0, 0, 0]).verdict, 'hard');
  assert.equal(v([0, 0, 0.1, 0.9, 0, 0, 0]).verdict, 'n/a');
});

test('report shows goal and kind per room', () => {
  const rows = aggregate([{ renos: 'none', wing: 3, policy: 'rest', outcome: 'death', room: 2, hearts: 0, fines: 0, time: 1 }]);
  const md = renderReport(rows, { roomInfo: (r) => ({ goal: r === 2 ? 'survive' : 'clear', kind: r === 4 ? 'elite' : r === 7 ? 'boss' : 'normal' }) });
  assert.match(md, /\| 2 \| ⏱️ survive \| normal \|/);
  assert.match(md, /\| 4 \| clear \| ⭐ elite \|/);
});

test('v1.14.0 tooling: force-perks parsing, histogram percentiles, pooled run-log metrics, report section', async () => {
  const L = await import('../scripts/balance-lib.mjs');
  assert.deepEqual(L.parseForce('dewey:3,interlibrary:2'), [['dewey', 3], ['interlibrary', 2]]);
  assert.deepEqual(L.parseForce('hardcover'), [['hardcover', 1]]);
  assert.deepEqual(L.parseForce('dewey:9,../x:1,:2,'), [['dewey', 3]]);
  assert.deepEqual(L.parseForce(''), []); assert.deepEqual(L.parseForce('none'), []);
  assert.deepEqual(L.RENO_PRESETS, ['none', 'half', 'p65', 'max']);
  assert.equal(L.histP([0, 0, 0], 0.5), null); assert.equal(L.histP([5, 0, 5], 0.5, 0.1), 0); assert.equal(L.histP([5, 0, 5], 0.95, 0.1), 0.2);
  const run = (o) => ({ dealt: { throw: 80, crit: 20, orbit: 0 }, taken: { bunny: 2 }, thrown: 10, ended: 10, thrownHit: 4, evict: 3, flight: [0, 5, 5], life: [2, 8], pages: { hits: 2, crossed: 3, crossedHit: 1, blocked: 2, blockedHit: 2 }, bossKills: [30], seconds: 100, ...o });
  const m = L.poolMetrics([{ metrics: run() }, { metrics: run({ taken: { 'page:fan': 1 }, bossKills: [] }) }, { outcome: 'error' }]);
  assert.equal(m.n, 2); assert.equal(m.dealt.throw, 160); assert.deepEqual(m.taken, { bunny: 2, 'page:fan': 1 }); assert.deepEqual(m.bossKills, [30]);
  const s = L.summariseMetrics(m);
  assert.equal(s.hitRate, 0.4); assert.equal(s.evictPerSec, 6 / 200); assert.equal(s.pagesBlockedShare, 0.5)   // blocked 4 of (4 blocked + 4 hit); assert.equal(s.dealtShare.throw, 0.8);
  assert.equal(s.takenList[0].src, 'bunny'); assert.equal(s.bossKillTime, 30);
  assert.equal(L.summariseMetrics(null), null);
  const rows = L.aggregate([{ renos: 'max', wing: 7, policy: 'rare', outcome: 'clear', room: 7, hearts: 3, fines: 50, time: 100, metrics: run() }]);
  const text = L.metricsSection(rows).join('\n');
  assert.match(text, /Damage and books \(max Renovations\)/); assert.match(text, /\| 7 \| 1 \|/); assert.match(text, /bunny 100%/);
  assert.match(L.renderReport(rows, { rooms: 'new', viewport: '844x390', force: 'dewey:3' }), /forced perks dewey:3/);
});
