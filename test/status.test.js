// Status effects (v1.15.0 part A): freeze rule, boss immunity, chain rule, proc scaling, ink/chill/zap maths. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { procChance, canFreeze, freeze, chillFactor, applyChill, applyInk, tickInk, shouldShatter, statusDamageMult, makeBurstBudget,
  deepFreezeHit, zapChain, isStatusSource, canProc, FREEZE_COOLDOWN, INK_TICK, CHILL_TIME, makeMetrics, tickMetrics, percentile } from '../src/status.js';
import { baseStats, byId, UPGRADES, gainText } from '../src/upgrades.js';
import { PLAYER, isEnemyHue } from '../src/palette.js';

const mk = (o = {}) => ({ type: 'bunny', x: 0, y: 0, r: 10, hp: 10, maxHp: 10, stun: 0, dead: false, ...o });

test('proc chance scales by 4 / hits per second, clamped 0.5..2 and never above 100%', () => {
  assert.equal(procChance(0.35, 4), 0.35);
  assert.equal(procChance(0.35, 8), 0.175);       // 2x faster weapon: half the chance per hit
  assert.equal(procChance(0.35, 100), 0.175);     // clamped at 0.5x
  assert.equal(procChance(0.35, 2), 0.7);         // slow weapon: up to 2x
  assert.equal(procChance(0.35, 0.2), 0.7);       // clamped at 2x
  assert.equal(procChance(0.8, 1), 1);            // never above 100%
});

test('freeze rule: bosses are immune; others get a 3 s cooldown after a freeze', () => {
  const boss = mk({ type: 'boss' });
  assert.equal(canFreeze(boss, 0), false);
  assert.equal(freeze(boss, 1, 0), false); assert.equal(boss.stun, 0);
  const e = mk();
  assert.equal(freeze(e, 1, 10), true); assert.equal(e.stun, 1);
  assert.equal(freeze(e, 1, 10.5), false, 'still frozen / cooling down');
  assert.equal(freeze(e, 1, 10 + 1 + FREEZE_COOLDOWN - 0.01), false);
  assert.equal(freeze(e, 0.5, 10 + 1 + FREEZE_COOLDOWN + 0.01), true);
  e.stun = 0.2; assert.equal(freeze(mk({ stun: 0.2 }), 0.1, 0), true); // never shortens a longer stun
  const f = mk({ stun: 2 }); freeze(f, 1, 0); assert.equal(f.stun, 2);
});

test('chill slows; bosses get half the slow; it ends with its timer', () => {
  const e = mk(); applyChill(e, 0.4);
  assert.equal(chillFactor(e), 0.6);
  const b = mk({ type: 'boss' }); applyChill(b, 0.4);
  assert.equal(chillFactor(b), 0.8);
  applyChill(e, 0.2); assert.equal(e.chill, 0.4, 'strongest slow wins while active');
  e.chillT = 0; assert.equal(chillFactor(e), 1);
  applyChill(e, 0.2); assert.equal(e.chill, 0.2); assert.equal(e.chillT, CHILL_TIME);
});

test('chilled bosses take +25% damage; Brittle Pages adds +25% more when inked too', () => {
  const b = mk({ type: 'boss' });
  assert.equal(statusDamageMult(b, false), 1);
  b.chillT = 1; assert.equal(statusDamageMult(b, false), 1.25);
  assert.equal(statusDamageMult(b, true), 1.25, 'brittle needs ink too');
  b.inkT = 1; assert.equal(statusDamageMult(b, true), 1.5);
  assert.equal(statusDamageMult(b, false), 1.25);
  assert.equal(statusDamageMult(mk({ chillT: 1 }), true), 1, 'normal enemies are unaffected');
});

test('ink: total damage = fraction x hit over its duration, lands every 0.5 s, refreshes without stacking', () => {
  const e = mk(); applyInk(e, 4, 0.5, 2);          // 2 damage over 2 s
  assert.equal(e.inkDps, 1);
  let total = 0, t = 0;
  while (e.inkT > 0 && t < 5) { total += tickInk(e, 1 / 120); t += 1 / 120; }
  assert.ok(Math.abs(total - 2) < 0.6, `total ${total}`);
  const ticks = []; const f = mk(); applyInk(f, 4, 0.5, 2);
  for (let i = 0; i < 120; i++) { const d = tickInk(f, 1 / 120); if (d) ticks.push(d); }
  assert.ok(ticks.length >= 1 && ticks.length <= 3, 'a few merged ticks, not one per frame');
  const g = mk(); applyInk(g, 4, 0.5, 2); applyInk(g, 4, 0.5, 2); assert.equal(g.inkDps, 1, 'no stacking');
  applyInk(g, 8, 0.5, 2); assert.equal(g.inkDps, 2, 'stronger ink replaces weaker');
  const w = mk(); applyInk(w, 4, 1, 3, 1); assert.equal(w.inkGen, 1);
  assert.equal(tickInk(mk(), 1), 0);
});

test('Brittle Pages: inked + slowed normal enemies shatter at 20% health, bosses never', () => {
  assert.equal(shouldShatter(mk({ inkT: 1, chillT: 1, hp: 2 })), true);
  assert.equal(shouldShatter(mk({ inkT: 1, chillT: 1, hp: 3 })), false);
  assert.equal(shouldShatter(mk({ chillT: 1, hp: 1 })), false);
  assert.equal(shouldShatter(mk({ type: 'boss', inkT: 1, chillT: 1, hp: 1 })), false);
});

test('chain rule: ink, zap and pop damage never procs; only book hits do; burst budget drops extras', () => {
  for (const s of ['ink', 'zap', 'pop', 'cleanup']) { assert.ok(isStatusSource(s), s); assert.ok(!canProc(s), s); }
  for (const s of ['throw', 'crit', 'orbit']) assert.ok(canProc(s), s);
  for (const s of ['burst', 'splash', 'shhh', 'dash', 'other']) assert.ok(!isStatusSource(s) && !canProc(s), s);
  const b = makeBurstBudget(); let ok = 0;
  for (let i = 0; i < 20; i++) if (b.take()) ok++;
  assert.equal(ok, 6); assert.equal(b.take(), false, 'extras are dropped, not queued');
  b.reset(); assert.equal(b.take(), true, 'next frame starts fresh');
});

test('Deep Freeze counts every 5th hit', () => {
  const e = mk(); const r = [];
  for (let i = 0; i < 10; i++) r.push(deepFreezeHit(e));
  assert.deepEqual(r, [false, false, false, false, true, false, false, false, false, true]);
});

test('zap chain: nearest not-yet-hit enemy in reach, up to n hops; Conductive prefers inked', () => {
  const a = mk({ x: 0, y: 0 }), b = mk({ x: 50, y: 0 }), c = mk({ x: 100, y: 0 }), far = mk({ x: 600, y: 0 }), d = mk({ x: 0, y: 140, inkT: 1 });
  const all = [a, b, c, far, d];
  assert.deepEqual(zapChain(a, all, 1), [b]);
  const chain = zapChain(a, all, 3, 150);
  assert.ok(!chain.includes(a) && !chain.includes(far) && new Set(chain).size === chain.length);
  assert.equal(zapChain(a, all, 1, 150, (e) => e.inkT > 0)[0], d, 'inked enemy preferred over a nearer plain one');
  assert.deepEqual(zapChain(far, [far], 3), []);
  const dead = mk({ x: 10, y: 0, dead: true }); assert.deepEqual(zapChain(a, [a, dead], 2), []);
});

test('status perks: levels, Masterworks and combos are wired and plain-spoken', () => {
  for (const id of ['leakypen', 'coldstorage', 'static', 'popup']) {
    const u = byId(id); assert.equal(u.kind, 'perk'); assert.equal(u.max, 3); assert.equal(u.weight, 5);
  }
  for (const id of ['m_indelible', 'm_deepfreeze', 'm_powergrid', 'm_finale']) assert.equal(byId(id).kind, 'master');
  const combos = { brittle: ['leakypen', 'coldstorage'], conductive: ['static', 'leakypen'], superconductor: ['coldstorage', 'static'], inkbombs: ['popup', 'leakypen'] };
  for (const [id, req] of Object.entries(combos)) assert.deepEqual(byId(id).requires, req, id);
  const s = baseStats(), p = { hp: 5 };
  const lp = byId('leakypen'); lp.apply(s); assert.equal(s.ink, 0.8); assert.equal(s.inkDur, 2); lp.apply(s); assert.equal(s.ink, 0.85); lp.apply(s); assert.equal(s.ink, 1); assert.equal(s.inkDur, 3);
  const cs = byId('coldstorage'); const c = baseStats(); cs.apply(c); assert.equal(c.chill, 0.3); cs.apply(c); assert.equal(c.chill, 0.35); cs.apply(c); assert.equal(c.chill, 0.4);
  const st = baseStats(), sc = byId('static'); sc.apply(st); assert.equal(st.staticChance, 0.45); assert.equal(st.staticJumps, 0); sc.apply(st); assert.equal(st.staticChance, 0.5); sc.apply(st); assert.equal(st.staticChance, 0.55); assert.equal(st.staticJumps, 2);
  byId('m_powergrid').apply(st); assert.equal(st.staticJumps, 3); assert.equal(st.staticDmg, 0.75);
  const pp = baseStats(), pu = byId('popup'); pu.apply(pp); assert.deepEqual([pp.popRadius, pp.popMult], [52, 1]); pu.apply(pp); assert.deepEqual([pp.popRadius, pp.popMult], [60, 1]); pu.apply(pp); assert.deepEqual([pp.popRadius, pp.popMult], [60, 2]);
  assert.deepEqual(gainText(byId('popup'), baseStats(), p), ['Defeated enemies pop, hurting enemies nearby']);
  assert.deepEqual(gainText(byId('coldstorage'), baseStats(), p), ['Hits slow enemies 30%']);
  assert.deepEqual(gainText(byId('static'), baseStats(), p), ['45% of hits zap a nearby enemy']);
  for (const id of ['leakypen', 'coldstorage', 'static', 'popup']) for (const line of gainText(byId(id), baseStats(), p)) assert.ok(!/px|rad\b|rad\/s/.test(line), line);
  assert.match(byId('annotated').desc, /burst, hurting everything nearby/);
});

test('status colours are in the player palette and none is an enemy hue', () => {
  for (const k of ['ink', 'inkRim', 'chill', 'static', 'pop']) assert.ok(PLAYER[k] && !isEnemyHue(PLAYER[k]), k);
});

test('metrics: per-second histograms and percentile', () => {
  const m = makeMetrics(); m.burstsThisSec = 7; m.statusKillsSec = 3; tickMetrics(m, 1.01);
  assert.deepEqual(m.burstHist, [7]); assert.equal(m.maxStatusKills1s, 3);
  assert.equal(percentile([1, 2, 3, 4, 100], 0.95), 100); assert.equal(percentile([], 0.95), 0);
});

test('a pop chain is capped at 6 hits and the metric tracks it', async () => {
  const { POP_CHAIN_HITS, makeMetrics } = await import('../src/status.js');
  assert.equal(POP_CHAIN_HITS, 6);
  assert.equal(makeMetrics().maxPopChain, 0);
});

test('every perk, combo and Masterwork has its own icon (variation selectors ignored)', () => {
  const seen = new Map();
  for (const u of UPGRADES) {
    const key = u.icon.replace(/️/g, '');
    assert.ok(!seen.has(key), `${u.id} and ${seen.get(key)} share the icon ${u.icon}`);
    seen.set(key, u.id);
  }
});
