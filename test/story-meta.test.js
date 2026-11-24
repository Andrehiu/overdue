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
  const { WINGS, ROOMS_PER_WING, SURVIVE_BUDGET_MULT, difficulty, threat } = await load('story');
  for (let w = 2; w <= WINGS.length; w++) {
    for (let r = 1; r <= ROOMS_PER_WING; r++) {
      const a = difficulty(w - 1, r), b = difficulty(w, r);
      assert.ok(threat(b) > threat(a), `wing ${w} room ${r} should beat wing ${w - 1}`);
      for (const k of ['hpMult', 'speedMult', 'hazardSpeed']) assert.ok(b[k] > a[k], `${k} rises from wing ${w - 1} to ${w} (room ${r})`);
      // Budget compared without the Survive multiplier (a Survive room's extra budget is its own, tested separately); threat above covers the rest.
      const plain = (d) => d.budget / (d.goal === 'survive' ? SURVIVE_BUDGET_MULT : 1);
      assert.ok(plain(b) > plain(a), `budget rises from wing ${w - 1} to ${w} (room ${r})`);
      assert.ok(b.eliteChance >= a.eliteChance && b.bossTier >= a.bossTier && b.gapMult <= a.gapMult);
    }
  }
});

test('wing 1 plays like the opening of endless (mapped onto the old curve); room 4 is elite and room 7 a boss', async () => {
  const { difficulty, roomKind, composeRoom, WINGS, CURVE, curveRoom, ROOMS_PER_WING, ELITE_ROOM, BOSS_ROOM, wingHp, BOSS_BUDGET_STEP } = await load('story');
  const { Rng } = await load('util');
  assert.deepEqual(CURVE, [1, 2, 4, 5, 7, 8, 10]);
  assert.equal(CURVE.length, ROOMS_PER_WING);
  assert.ok(CURVE.every((v, i) => i === 0 || v > CURVE[i - 1]), 'mapping strictly increasing');
  assert.equal(CURVE[ELITE_ROOM - 1], 5); assert.equal(CURVE[BOSS_ROOM - 1], 10);
  assert.equal(curveRoom(1), 1);
  // Room 3 sits at old position 4: its numbers are the old room 4's.
  assert.equal(difficulty(1, 3).hpMult, 1 + 0.08 * 3);
  assert.equal(difficulty(1, 1).eliteChance, 0);
  assert.equal(roomKind(4), 'elite'); assert.equal(roomKind(7), 'boss'); assert.equal(roomKind(5), 'normal');
  for (let w = 1; w <= WINGS.length; w++) {
    const elite = composeRoom(w, ELITE_ROOM, new Rng(w)).spawns;
    assert.ok(elite.length > 0 && elite.filter((s) => s.type !== 'worm').every((s) => s.elite), `wing ${w} room ${ELITE_ROOM} is all elites`);
    const boss = composeRoom(w, BOSS_ROOM, new Rng(w));
    assert.equal(boss.spawns.filter((s) => s.type === 'boss').length, 1);
    for (let r = 1; r < BOSS_ROOM; r++) assert.ok(!composeRoom(w, r, new Rng(r)).spawns.some((s) => s.type === 'boss'));
    // Boss HP follows the flattened wing curve (v1.14.0); wing 1 is still 330.
    assert.equal(difficulty(w, BOSS_ROOM).bossHp, Math.round(330 * wingHp(w - 1) * (1 + BOSS_BUDGET_STEP * (w - 1))));
  }
});

test('roomGoal: never room 1, the elite or the boss room; capped per wing; deterministic; most wings have one', async () => {
  const { roomGoal, WINGS, ROOMS_PER_WING, ELITE_ROOM, BOSS_ROOM } = await load('story');
  let wingsWith = 0;
  for (let w = 1; w <= WINGS.length; w++) {
    let n = 0;
    for (let r = 1; r <= ROOMS_PER_WING; r++) {
      const g = roomGoal(w, r);
      assert.equal(g, roomGoal(w, r));
      assert.ok(g === 'clear' || g === 'survive');
      if (g === 'survive') { n++; assert.ok(r !== 1 && r !== ELITE_ROOM && r !== BOSS_ROOM, `wing ${w} room ${r} must not be a goal room`); }
    }
    assert.ok(n <= 1, `wing ${w} has ${n} Survive rooms`);
    if (n) wingsWith++;
  }
  assert.ok(wingsWith >= 6 && wingsWith <= 8, `${wingsWith} of 10 wings have a Survive room`);
});

test('a Survive room is never easier than the same room played plain, and its spawns fill the whole timer', async () => {
  const { roomGoal, difficulty, threat, composeRoom, WINGS, ROOMS_PER_WING, SURVIVE_SECONDS, SURVIVE_BUDGET_MULT } = await load('story');
  const { ENEMY_TYPES } = await load('waves');
  const { Rng } = await load('util');
  assert.ok(SURVIVE_BUDGET_MULT >= 1);
  let found = 0;
  for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) {
    if (roomGoal(w, r) !== 'survive') continue;
    found++;
    const d = difficulty(w, r), plain = { ...d, goal: 'clear', budget: d.budget / SURVIVE_BUDGET_MULT };
    assert.equal(d.goal, 'survive');
    assert.ok(threat(d) >= threat(plain), `wing ${w} room ${r}: Survive threat >= plain`);
    for (const seed of [1, 2, 3]) {
      const sp = composeRoom(w, r, new Rng(seed)).spawns;
      const cost = sp.reduce((a, s) => a + (s.type === 'worm' ? ENEMY_TYPES.worm.cost : ENEMY_TYPES[s.type].cost), 0);
      assert.ok(cost <= d.budget + 1e-6, 'spawns stay within the budget');
      assert.ok(sp.at(-1).t >= SURVIVE_SECONDS * 0.55 && sp.at(-1).t <= SURVIVE_SECONDS, `wing ${w} room ${r}: last spawn at ${sp.at(-1).t}s`);
      for (let t = 0; t < SURVIVE_SECONDS - 6; t += 6) assert.ok(sp.some((s) => s.t >= t && s.t < t + 8), `wing ${w} room ${r}: gap in spawns near ${t}s`);
    }
  }
  assert.ok(found >= 7);
});

test('Survive rooms build up: every spawn lands well before the buzzer and the budget arrives in a rising crescendo', async () => {
  const { roomGoal, composeRoom, WINGS, ROOMS_PER_WING, SURVIVE_SECONDS, SURVIVE_CHUNKS } = await load('story');
  const { ENEMY_TYPES } = await load('waves');
  const { Rng } = await load('util');
  const [c1, c2] = [SURVIVE_CHUNKS[1].from, SURVIVE_CHUNKS[2].from];   // phase boundaries
  let rooms = 0;
  for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) {
    if (roomGoal(w, r) !== 'survive') continue;
    rooms++;
    let early = 0, mid = 0, late = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sp = composeRoom(w, r, new Rng(seed)).spawns;
      assert.ok(sp.length > 0);
      assert.ok(sp.at(-1).t <= SURVIVE_SECONDS - 1, `wing ${w} room ${r} seed ${seed}: last spawn at ${sp.at(-1).t}s`);
      assert.ok(sp[0].t >= 0 && sp.every((s, i) => i === 0 || s.t >= sp[i - 1].t), 'sorted, non-negative');
      for (const s of sp) { const c = ENEMY_TYPES[s.type].cost; if (s.t < c1) early += c; else if (s.t < c2) mid += c; else late += c; }
    }
    const all = early + mid + late;
    assert.ok(late >= 0.45 * all && late > mid && mid > early * 1.2, `wing ${w} room ${r}: budget by phase ${[early, mid, late].map((x) => (100 * x / all).toFixed(0)).join('/')}%`);
  }
  assert.ok(rooms >= 7);
});

test('fines: a full 7-room wing pays within 10% of the old 10-room wing, elite and boss stay the biggest', async () => {
  const { roomReward, ROOMS_PER_WING, ELITE_ROOM, BOSS_ROOM } = await load('story');
  for (let w = 1; w <= 10; w++) {
    const old = 8 * (3 + w) + (10 + 3 * w) + (25 + 8 * w);
    let now = 0; for (let r = 1; r <= ROOMS_PER_WING; r++) now += roomReward(w, r);
    assert.ok(Math.abs(now - old) / old <= 0.1, `wing ${w}: ${now} vs old ${old}`);
    assert.ok(roomReward(w, BOSS_ROOM) > roomReward(w, ELITE_ROOM) && roomReward(w, ELITE_ROOM) > roomReward(w, 1));
  }
});

test('an old 10-room save loads safely: best clamps to 7, wing 1 stays cleared, wing 2 stays unlocked', async () => {
  const { normalizeProgress } = await load('meta');
  const p = normalizeProgress({ v: 1, fines: 40, lifetime: 90, unlocked: 2, best: { 1: 10, 2: 6 }, cleared: [1], reno: { spines: 2 } });
  assert.deepEqual(p.best, { 1: 7, 2: 6 });
  assert.deepEqual(p.cleared, [1]); assert.equal(p.unlocked, 2); assert.equal(p.fines, 40); assert.deepEqual(p.reno, { spines: 2 });
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
  r = recordRun(r.progress, { fines: 40, mode: 'story', wing: 1, room: 7, cleared: true });
  assert.ok(r.firstClear); assert.equal(r.unlockedWing, 2); assert.equal(r.banked, 40 + firstClearBonus(1));
  assert.equal(r.progress.unlocked, 2);
  // Clearing it again pays no bonus and unlocks nothing new.
  const again = recordRun(r.progress, { fines: 40, mode: 'story', wing: 1, room: 7, cleared: true });
  assert.ok(!again.firstClear); assert.equal(again.banked, 40); assert.equal(again.unlockedWing, null);
  // Endless runs bank too, with the Fine Collector bonus.
  const rich = recordRun({ ...p, reno: { collector: 2 } }, { fines: 10, mode: 'endless' });
  assert.equal(rich.banked, 14);
  // Tampered or partial saves are repaired.
  const fixed = normalizeProgress({ fines: -5, unlocked: 99, best: { 1: 50 }, cleared: [1, 2, 'x'], reno: { spines: 'lots', armchair: 9, nope: 3 } });
  assert.equal(fixed.fines, 0); assert.equal(fixed.unlocked, WINGS.length); assert.equal(fixed.best[1], 7);
  assert.deepEqual(fixed.cleared, [1, 2]); assert.deepEqual(fixed.reno, { armchair: 3 });
  // Cleared wings always unlock the next one, even if `unlocked` was lost.
  assert.equal(normalizeProgress({ cleared: [1, 2, 3] }).unlocked, 4);
});

test('a lost wing-1 run that dies in the room after the elite room still affords the cheapest Renovation', async () => {
  const { roomReward, ELITE_ROOM } = await load('story');
  const { RENOVATIONS } = await load('meta');
  let earned = 0;
  for (let r = 1; r <= ELITE_ROOM; r++) earned += roomReward(1, r);
  assert.ok(earned >= Math.min(...RENOVATIONS.map((x) => x.cost(0))), `earned ${earned}`);
  for (let w = 2; w <= 10; w++) assert.ok(roomReward(w, 3) > roomReward(w - 1, 3) && roomReward(w, 7) > roomReward(w - 1, 7), 'harder wings pay more');
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

test('even the worst door route (cheapest door every time) still affords the cheapest Renovation by the room after the elite room', async () => {
  const { roomReward, ELITE_ROOM, ROOMS_PER_WING } = await load('story');
  const { DOORS, doorOffer, doorReward, POOL } = await load('doors');
  const { RENOVATIONS } = await load('meta');
  const cheapest = Math.min(...RENOVATIONS.map((x) => x.cost(0)));
  for (const seed of [1, 7, 12345, 987654321]) {
    let worst = 0, best = 0;
    for (let r = 1; r <= ELITE_ROOM; r++) {
      // Rooms behind a 2-door choice: the unluckiest route takes the cheapest door of the whole pool every time
      // (an actual offer only ever shows 2 of the 3), the luckiest the richest of this seed's real offers.
      const offer = r === 1 ? [] : doorOffer(seed, 1, r - 1, { atFullHp: false });
      const choosable = offer.length > 1;
      worst += choosable ? Math.min(...POOL.map((id) => doorReward(1, r, id))) : roomReward(1, r);
      best += choosable ? Math.max(...offer.map((id) => doorReward(1, r, id))) : roomReward(1, r);
    }
    assert.ok(worst >= cheapest, `seed ${seed}: worst route earned ${worst}, cheapest Renovation ${cheapest}`);
    assert.ok(best >= worst);
  }
  // The door after the elite room only shapes the next room, which is paid after the checkpoint this test covers.
  assert.equal(doorOffer(1, 1, ELITE_ROOM, {}).length, 2);
  // Break Room never pays less than 3 fines, in any wing.
  for (let w = 1; w <= 10; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) assert.ok(doorReward(w, r, 'rest') >= Math.min(3, roomReward(w, r)));
  assert.ok(DOORS.rare && DOORS.rest);
});

test('every wing has an intro, taunt and cleared line, each 1-60 characters', async () => {
  const { WINGS } = await load('story');
  for (const w of WINGS) for (const k of ['intro', 'taunt', 'cleared']) {
    assert.ok(typeof w[k] === 'string' && w[k].length > 0 && w[k].length <= 60, `${w.id}.${k}: ${w[k]}`);
  }
});
