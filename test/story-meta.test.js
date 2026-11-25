// Story wings (C) + late-fee Renovations (A): pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (m) => import(`../src/${m}.js`);

test('every room is harder than the one before it, in every wing', async () => {
  const { WINGS, roomsIn, difficulty, threat } = await load('story');
  for (let w = 1; w <= WINGS.length; w++) {
    for (let r = 2; r <= roomsIn(w); r++) {
      const prev = threat(difficulty(w, r - 1)), cur = threat(difficulty(w, r));
      assert.ok(cur > prev, `wing ${w}: room ${r} (${cur.toFixed(1)}) should beat room ${r - 1} (${prev.toFixed(1)})`);
    }
  }
});

// Wing w-1's room to compare wing w's room r with: the same room index when both wings have the same length, else the
// room of the same kind at the same position on the old 10-room curve (the nearest one at or below it; Act II's extra rooms sit between).
function twin(S, w, r) {
  if (S.roomsIn(w - 1) === S.roomsIn(w)) return r;
  const pos = S.curveRoom(r, w);
  let best = 1;
  for (let q = 1; q <= S.roomsIn(w - 1); q++) if (S.curveRoom(q, w - 1) <= pos && S.roomKind(w - 1, q) === S.roomKind(w, r)) best = q;   // same kind: elite vs elite, boss vs boss
  return best;
}

test('every wing is harder than the previous wing, room for room (Act II compares at the same position on the old curve)', async () => {
  const S = await load('story');
  const { WINGS, roomsIn, SURVIVE_BUDGET_MULT, difficulty, threat } = S;
  for (let w = 2; w <= WINGS.length; w++) {
    for (let r = 1; r <= roomsIn(w); r++) {
      const a = difficulty(w - 1, twin(S, w, r)), b = difficulty(w, r);
      assert.ok(threat(b) > threat(a), `wing ${w} room ${r} should beat wing ${w - 1} room ${twin(S, w, r)}`);
      for (const k of ['hpMult', 'speedMult', 'hazardSpeed']) assert.ok(b[k] > a[k] || (b.pos > a.pos && b[k] >= a[k]), `${k} rises from wing ${w - 1} to ${w} (room ${r})`);
      // Budget compared without the Survive multiplier (a Survive room's extra budget is its own, tested separately); threat above covers the rest.
      const plain = (d) => d.budget / (d.goal === 'survive' ? SURVIVE_BUDGET_MULT : 1);
      assert.ok(plain(b) > plain(a) || b.kind !== a.kind, `budget rises from wing ${w - 1} to ${w} (room ${r})`);
      assert.ok(b.eliteChance >= a.eliteChance && b.bossTier >= a.bossTier && b.gapMult <= a.gapMult);
    }
  }
});

test('Act II: 9 rooms, elite at 5, boss at 9; wing 11 beats wing 10 at every position, rooms 8-9 beat wing 10\'s boss room', async () => {
  const S = await load('story');
  const { roomsIn, eliteRoom, bossRoom, roomKind, difficulty, threat, CURVE_ACT2, CURVE } = S;
  assert.deepEqual(CURVE_ACT2, [1, 2, 3, 4, 5, 6, 8, 9, 10]);
  assert.ok(CURVE_ACT2.every((v, i) => i === 0 || v > CURVE_ACT2[i - 1]));
  for (const w of [1, 10]) { assert.equal(roomsIn(w), 7); assert.equal(eliteRoom(w), 4); assert.equal(bossRoom(w), 7); }
  for (const w of [11, 12]) {
    assert.equal(roomsIn(w), 9); assert.equal(eliteRoom(w), 5); assert.equal(bossRoom(w), 9);
    assert.ok(CURVE_ACT2[eliteRoom(w) - 1] >= CURVE[3 + 0] && CURVE_ACT2[eliteRoom(w) - 1] >= 5, 'elite sits at the old elite position or later');
    assert.equal(CURVE_ACT2[bossRoom(w) - 1], 10, 'boss at the old boss position');
    assert.equal(roomKind(w, 5), 'elite'); assert.equal(roomKind(w, 9), 'boss'); assert.equal(roomKind(w, 4), 'normal'); assert.equal(roomKind(w, 7), 'normal');
    assert.equal(roomKind(10, 4), 'elite'); assert.equal(roomKind(10, 7), 'boss');
  }
  // Same position on the old curve (shared positions 1, 2, 4, 5, 8, 10): wing 11 must beat wing 10 by a clear margin.
  for (const [r11, r10] of [[1, 1], [2, 2], [4, 3], [5, 4], [7, 6], [9, 7]]) {
    const a = difficulty(10, r10), b = difficulty(11, r11);
    assert.equal(S.curveRoom(r11, 11), S.curveRoom(r10, 10), 'same position');
    assert.ok(threat(b) > threat(a) * 1.1, `wing 11 room ${r11} is at least 10% harder than wing 10 room ${r10}`);
  }
  // Rooms 8 and 9 sit at or past the old boss position's neighbourhood: both beat wing 10's boss room.
  const boss10 = threat(difficulty(10, 7));
  for (const r of [8, 9]) assert.ok(threat(difficulty(11, r)) > boss10, `wing 11 room ${r} beats wing 10's boss room`);
  // Wing 12 beats wing 11 room for room (same length).
  for (let r = 1; r <= 9; r++) assert.ok(threat(difficulty(12, r)) > threat(difficulty(11, r)), `wing 12 room ${r} beats wing 11`);
});

test('wing 1 plays like the opening of endless (mapped onto the old curve); room 4 is elite and room 7 a boss', async () => {
  const { difficulty, roomKind, composeRoom, WINGS, CURVE, curveRoom, ROOMS_PER_WING, ELITE_ROOM, BOSS_ROOM, roomsIn, eliteRoom, bossRoom, wingHp, BOSS_BUDGET_STEP, STORY_HP_MULT } = await load('story');
  const { Rng } = await load('util');
  assert.deepEqual(CURVE, [1, 2, 4, 5, 7, 8, 10]);
  assert.equal(CURVE.length, ROOMS_PER_WING);
  assert.ok(CURVE.every((v, i) => i === 0 || v > CURVE[i - 1]), 'mapping strictly increasing');
  assert.equal(CURVE[ELITE_ROOM - 1], 5); assert.equal(CURVE[BOSS_ROOM - 1], 10);
  assert.equal(curveRoom(1), 1);
  // Room 3 sits at old position 4: its numbers are the old room 4's.
  assert.equal(difficulty(1, 3).hpMult, (1 + 0.08 * 3) * STORY_HP_MULT);   // v1.15.2: story HP -5%
  assert.equal(difficulty(1, 1).eliteChance, 0);
  assert.equal(roomKind(1, 4), 'elite'); assert.equal(roomKind(1, 7), 'boss'); assert.equal(roomKind(1, 5), 'normal');
  for (let w = 1; w <= WINGS.length; w++) {
    const elite = composeRoom(w, eliteRoom(w), new Rng(w)).spawns;
    assert.ok(elite.length > 0 && elite.filter((s) => s.type !== 'worm').every((s) => s.elite), `wing ${w} room ${eliteRoom(w)} is all elites`);
    const boss = composeRoom(w, bossRoom(w), new Rng(w));
    assert.equal(boss.spawns.filter((s) => s.type === 'boss').length, 1);
    for (let r = 1; r < bossRoom(w); r++) assert.ok(!composeRoom(w, r, new Rng(r)).spawns.some((s) => s.type === 'boss'));
    // Boss HP follows the flattened wing curve (v1.14.0); story HP -5% since v1.15.2.
    assert.equal(difficulty(w, bossRoom(w)).bossHp, Math.round(330 * STORY_HP_MULT * wingHp(w - 1) * (1 + BOSS_BUDGET_STEP * (w - 1))));
  }
});

test('roomGoal: never room 1, the elite or the boss room; capped per wing; deterministic; most wings have one', async () => {
  const { roomGoal, WINGS, roomsIn, eliteRoom, bossRoom } = await load('story');
  let wingsWith = 0;
  for (let w = 1; w <= WINGS.length; w++) {
    let n = 0;
    for (let r = 1; r <= roomsIn(w); r++) {
      const g = roomGoal(w, r);
      assert.equal(g, roomGoal(w, r));
      assert.ok(g === 'clear' || g === 'survive');
      if (g === 'survive') { n++; assert.ok(r !== 1 && r !== eliteRoom(w) && r !== bossRoom(w), `wing ${w} room ${r} must not be a goal room`); }
    }
    assert.ok(n <= 1, `wing ${w} has ${n} Survive rooms`);
    if (n) wingsWith++;
  }
  assert.ok(wingsWith >= 6 && wingsWith <= 10, `${wingsWith} of ${WINGS.length} wings have a Survive room`);
});

test('a Survive room is never easier than the same room played plain, and its spawns fill the whole timer', async () => {
  const { roomGoal, difficulty, threat, composeRoom, WINGS, roomsIn, SURVIVE_SECONDS, SURVIVE_BUDGET_MULT } = await load('story');
  const { ENEMY_TYPES } = await load('waves');
  const { Rng } = await load('util');
  assert.ok(SURVIVE_BUDGET_MULT >= 1);
  let found = 0;
  for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= roomsIn(w); r++) {
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
  const { roomGoal, composeRoom, WINGS, roomsIn, SURVIVE_SECONDS, SURVIVE_CHUNKS } = await load('story');
  const { ENEMY_TYPES } = await load('waves');
  const { Rng } = await load('util');
  const [c1, c2] = [SURVIVE_CHUNKS[1].from, SURVIVE_CHUNKS[2].from];   // phase boundaries
  let rooms = 0;
  for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= roomsIn(w); r++) {
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

test('fines: an Act II wing keeps Act II\'s per-room pay (9 rooms pay ~9/7 of the 7-room formula); elite and boss stay the biggest', async () => {
  const { roomReward, roomKind } = await load('story');
  for (const w of [11, 12]) {
    const plain = Math.round(1.6 * (3 + w)), elite = Math.round(1.25 * (10 + w * 3)), boss = Math.round(0.9 * (25 + w * 8));
    let total = 0;
    for (let r = 1; r <= 9; r++) { total += roomReward(w, r); assert.equal(roomReward(w, r), roomKind(w, r) === 'boss' ? boss : roomKind(w, r) === 'elite' ? elite : plain); }
    assert.equal(total, 7 * plain + elite + boss);
    assert.ok(roomReward(w, 9) > roomReward(w, 5) && roomReward(w, 5) > roomReward(w, 1));
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
  const { WINGS, roomsIn, difficulty, layoutSeed, roomShape } = await load('story');
  for (const portrait of [false, true]) {
    setOrientation(portrait);
    for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= roomsIn(w); r++) {
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

test('Renovation cards show now -> next, "Now: none" at level 0 and "Maxed" at the top (v1.16.3)', async () => {
  const { RENOVATIONS, renoById, renoText } = await load('meta');
  for (const r of RENOVATIONS) {
    const mid = Math.floor(r.max / 2);
    assert.match(renoText(r, 0), /^Now: none → Next: .+/, `${r.id} level 0`);
    assert.ok(renoText(r, 0).endsWith(r.at(1)), `${r.id} level 0 next is level 1`);
    if (r.max > 1 && mid >= 1) assert.equal(renoText(r, mid), `Now: ${r.at(mid)} → Next: ${r.at(mid + 1)}`, `${r.id} mid level`);
    assert.equal(renoText(r, r.max), `Maxed: ${r.at(r.max)}`, `${r.id} max`);
    for (let n = 0; n <= r.max; n++) assert.ok(!/\d\s?(px|rad)\b|undefined|NaN/.test(renoText(r, n)), `${r.id} level ${n} is plain`);
  }
  assert.equal(renoText(renoById('spines'), 0), 'Now: none → Next: +10% book damage');
  assert.equal(renoText(renoById('spines'), 4), 'Now: +40% book damage → Next: +50% book damage');
  assert.equal(renoText(renoById('spines'), 10), 'Maxed: +100% book damage');
  assert.equal(renoText(renoById('armchair'), 1), 'Now: +1 max heart → Next: +2 max hearts');
  assert.equal(renoText(renoById('chute'), 2), 'Now: +17% throw speed → Next: +26% throw speed');
  assert.equal(renoText(renoById('secondwind'), 1), 'Maxed: Once per run, get back up with 2 hearts');
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
  const { WINGS, roomsIn, eliteRoom, bossRoom, roomShape } = await load('story');
  const { SHAPES, WATER_SHAPES } = await load('arena');
  for (let w = 1; w <= WINGS.length; w++) {
    const list = WINGS[w - 1].shapes;
    assert.ok(list.length >= 1 && list.length <= 3 && list.every((s) => SHAPES.includes(s) || WATER_SHAPES.includes(s)), `wing ${w} shapes`);
    const open = ['pillars', 'reading'].find((s) => list.includes(s)) || 'scatter';
    for (let r = 1; r <= roomsIn(w); r++) {
      const s = roomShape(w, r);
      assert.equal(s, roomShape(w, r), 'deterministic');
      if (r === eliteRoom(w) || r === bossRoom(w)) { assert.equal(s, open, `wing ${w} room ${r} is the open shape`); continue; }
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

test('saves: an Act II best of 7 (the 1.16.0 boss) stays cleared with wing 12 unlocked; best clamps per wing (7 in Act I, 9 in Act II)', async () => {
  const { normalizeProgress, recordRun } = await load('meta');
  const old = { v: 1, fines: 120, lifetime: 400, unlocked: 12, best: { 1: 7, 10: 7, 11: 7, 12: 3 }, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], reno: { spines: 2 } };
  const p = normalizeProgress(JSON.parse(JSON.stringify(old)));
  assert.equal(p.best[11], 7); assert.ok(p.cleared.includes(11)); assert.equal(p.unlocked, 12); assert.equal(p.best[12], 3);
  assert.deepEqual(Object.keys(p).sort(), ['best', 'cleared', 'fines', 'lifetime', 'reno', 'unlocked', 'v']);
  assert.equal(p.reno.spines, 2); assert.equal(p.fines, 120);
  // Clamp per wing: Act I stops at 7, Act II at 9.
  const q = normalizeProgress({ unlocked: 12, best: { 3: 9, 11: 12, 12: 9 }, cleared: [] });
  assert.equal(q.best[3], 7); assert.equal(q.best[11], 9); assert.equal(q.best[12], 9);
  // A run that reaches room 9 of wing 11 is recorded as 9; a run in Act I can't exceed 7.
  const r = recordRun(p, { fines: 10, mode: 'story', wing: 11, room: 9, cleared: false });
  assert.equal(r.progress.best[11], 9);
  const r2 = recordRun(p, { fines: 10, mode: 'story', wing: 2, room: 9, cleared: false });
  assert.equal(r2.progress.best[2], 7);
});
