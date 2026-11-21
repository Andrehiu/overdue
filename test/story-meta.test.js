// Story wings (C) + late-fee Renovations (A): pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (m) => import(`../src/${m}.js`);

test('every room is harder than the one before it, in every wing', async () => {
  const { WINGS, ROOMS_PER_WING, difficulty, threat } = await load('story');
  for (let w = 1; w <= WINGS.length; w++) {
    for (let r = 2; r <= ROOMS_PER_WING; r++) {
      const prev = threat(difficulty(w, r - 1)), cur = threat(difficulty(w, r));
      assert.ok(cur > prev, `wing ${w}: room ${r} (${cur.toFixed(1)}) should beat room ${r - 1} (${prev.toFixed(1)})`);
    }
  }
});

test('every wing is harder than the previous wing, room for room', async () => {
  const { WINGS, ROOMS_PER_WING, difficulty, threat } = await load('story');
  for (let w = 2; w <= WINGS.length; w++) {
    for (let r = 1; r <= ROOMS_PER_WING; r++) {
      const a = difficulty(w - 1, r), b = difficulty(w, r);
      assert.ok(threat(b) > threat(a), `wing ${w} room ${r} should beat wing ${w - 1}`);
      for (const k of ['hpMult', 'speedMult', 'hazardSpeed', 'budget']) assert.ok(b[k] > a[k], `${k} rises from wing ${w - 1} to ${w} (room ${r})`);
      assert.ok(b.eliteChance >= a.eliteChance && b.bossTier >= a.bossTier && b.gapMult <= a.gapMult);
    }
  }
});

test('wing 1 plays like the opening of endless; room 5 is elite and room 10 a boss', async () => {
  const { difficulty, roomKind, composeRoom, WINGS } = await load('story');
  const { Rng } = await load('util');
  assert.equal(difficulty(1, 3).hpMult, 1 + 0.08 * 2);
  assert.equal(difficulty(1, 1).eliteChance, 0);
  assert.equal(roomKind(5), 'elite'); assert.equal(roomKind(10), 'boss'); assert.equal(roomKind(7), 'normal');
  for (let w = 1; w <= WINGS.length; w++) {
    const elite = composeRoom(w, 5, new Rng(w)).spawns;
    assert.ok(elite.length > 0 && elite.filter((s) => s.type !== 'worm').every((s) => s.elite), `wing ${w} room 5 is all elites`);
    const boss = composeRoom(w, 10, new Rng(w));
    assert.equal(boss.spawns.filter((s) => s.type === 'boss').length, 1);
    for (let r = 1; r <= 9; r++) assert.ok(!composeRoom(w, r, new Rng(r)).spawns.some((s) => s.type === 'boss'));
  }
});

test('composeWave without story options is unchanged (endless runs stay reproducible)', async () => {
  const { composeWave } = await load('waves');
  const { Rng } = await load('util');
  for (let w = 1; w <= 15; w++) {
    const a = composeWave(w, new Rng(99)), b = composeWave(w, new Rng(99), {});
    assert.deepEqual(a, b);
    assert.ok(!a.spawns.some((s) => s.elite));
  }
});

test('story layouts are fixed per room and every room is connected', async () => {
  const { generateArena, isConnected, setOrientation } = await load('arena');
  const { WINGS, ROOMS_PER_WING, difficulty, layoutSeed, roomShape } = await load('story');
  for (const portrait of [false, true]) {
    setOrientation(portrait);
    for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) {
      const d = difficulty(w, r);
      const a = generateArena(layoutSeed(w, r), r, d.shelvesPerHalf, roomShape(w, r)), b = generateArena(layoutSeed(w, r), r, d.shelvesPerHalf, roomShape(w, r));
      assert.deepEqual(a.shelves, b.shelves);
      assert.ok(isConnected(a.solid), `wing ${w} room ${r} connected`);
    }
  }
  setOrientation(false);
});

test('Renovation costs rise with level and every stat stays finite at max', async () => {
  const { RENOVATIONS, normalizeProgress, applyRenovations, runBonuses } = await load('meta');
  const { baseStats } = await load('upgrades');
  for (const r of RENOVATIONS) {
    for (let n = 1; n < r.max; n++) assert.ok(r.cost(n) > r.cost(n - 1), `${r.id} level ${n + 1} costs more`);
    assert.ok(r.gain && !/\d\s?(px|rad)\b/.test(r.gain), `${r.id} has a plain gain line`);
  }
  const maxed = normalizeProgress({ reno: Object.fromEntries(RENOVATIONS.map((r) => [r.id, 99])) });
  const s = applyRenovations(baseStats(), maxed);
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} finite`);
  assert.equal(s.maxHp, 8);
  assert.ok(Math.abs(s.damage - 2) < 1e-9);
  assert.deepEqual(runBonuses(maxed), { cards: 4, startPerks: 2, banishes: 3, renews: 2, revives: 1, fineMult: 2 });
});

test('buying spends fines, refuses when broke or maxed', async () => {
  const { normalizeProgress, buy, canBuy, nextCost, level } = await load('meta');
  let p = normalizeProgress({ fines: 100 });
  assert.equal(nextCost(p, 'spines'), 25);
  p = buy(p, 'spines');
  assert.equal(level(p, 'spines'), 1); assert.equal(p.fines, 75);
  assert.equal(buy(p, 'catalogue'), p, 'cannot afford 300');
  p = { ...p, fines: 1000 };
  p = buy(p, 'catalogue');
  assert.equal(level(p, 'catalogue'), 1); assert.equal(canBuy(p, 'catalogue'), false); assert.equal(nextCost(p, 'catalogue'), null);
});

test('runs bank fines, unlock the next wing once, and saves repair themselves', async () => {
  const { normalizeProgress, recordRun } = await load('meta');
  const { firstClearBonus, WINGS } = await load('story');
  let p = normalizeProgress(null);
  assert.deepEqual(p, { v: 1, fines: 0, lifetime: 0, unlocked: 1, best: {}, cleared: [], reno: {} });
  // A lost run still pays and records the best room.
  let r = recordRun(p, { fines: 12, mode: 'story', wing: 1, room: 6, cleared: false });
  assert.equal(r.banked, 12); assert.equal(r.progress.best[1], 6); assert.equal(r.progress.unlocked, 1);
  // Clearing wing 1: first-clear bonus + unlock wing 2.
  r = recordRun(r.progress, { fines: 40, mode: 'story', wing: 1, room: 10, cleared: true });
  assert.ok(r.firstClear); assert.equal(r.unlockedWing, 2); assert.equal(r.banked, 40 + firstClearBonus(1));
  assert.equal(r.progress.unlocked, 2);
  // Clearing it again pays no bonus and unlocks nothing new.
  const again = recordRun(r.progress, { fines: 40, mode: 'story', wing: 1, room: 10, cleared: true });
  assert.ok(!again.firstClear); assert.equal(again.banked, 40); assert.equal(again.unlockedWing, null);
  // Endless runs bank too, with the Fine Collector bonus.
  const rich = recordRun({ ...p, reno: { collector: 2 } }, { fines: 10, mode: 'endless' });
  assert.equal(rich.banked, 14);
  // Tampered or partial saves are repaired.
  const fixed = normalizeProgress({ fines: -5, unlocked: 99, best: { 1: 50 }, cleared: [1, 2, 'x'], reno: { spines: 'lots', armchair: 9, nope: 3 } });
  assert.equal(fixed.fines, 0); assert.equal(fixed.unlocked, WINGS.length); assert.equal(fixed.best[1], 10);
  assert.deepEqual(fixed.cleared, [1, 2]); assert.deepEqual(fixed.reno, { armchair: 3 });
  // Cleared wings always unlock the next one, even if `unlocked` was lost.
  assert.equal(normalizeProgress({ cleared: [1, 2, 3] }).unlocked, 4);
});

test('a lost wing-1 run that reaches room 6 still affords the cheapest Renovation', async () => {
  const { roomReward } = await load('story');
  const { RENOVATIONS } = await load('meta');
  let earned = 0;
  for (let r = 1; r <= 5; r++) earned += roomReward(1, r);
  assert.ok(earned >= Math.min(...RENOVATIONS.map((x) => x.cost(0))), `earned ${earned}`);
  for (let w = 2; w <= 10; w++) assert.ok(roomReward(w, 3) > roomReward(w - 1, 3) && roomReward(w, 10) > roomReward(w - 1, 10), 'harder wings pay more');
});

test('every wing has room shapes; elite and boss rooms are open; shapes do not repeat back to back', async () => {
  const { WINGS, ROOMS_PER_WING, ELITE_ROOM, BOSS_ROOM, roomShape } = await load('story');
  const { SHAPES } = await load('arena');
  for (let w = 1; w <= WINGS.length; w++) {
    const list = WINGS[w - 1].shapes;
    assert.ok(list.length >= 1 && list.length <= 3 && list.every((s) => SHAPES.includes(s)), `wing ${w} shapes`);
    const open = ['pillars', 'reading'].find((s) => list.includes(s)) || 'scatter';
    for (let r = 1; r <= ROOMS_PER_WING; r++) {
      const s = roomShape(w, r);
      assert.equal(s, roomShape(w, r), 'deterministic');
      if (r === ELITE_ROOM || r === BOSS_ROOM) { assert.equal(s, open, `wing ${w} room ${r} is the open shape`); continue; }
      assert.ok(list.includes(s), `wing ${w} room ${r}: ${s} is one of the wing's shapes`);
      if (r > 1 && list.length >= 2) assert.notEqual(s, roomShape(w, r - 1), `wing ${w}: room ${r} repeats ${s}`);
    }
  }
});
