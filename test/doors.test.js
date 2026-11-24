// Story doors (v1.7.0): pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (n) => import(`../src/${n}.js`);
const SEEDS = [1, 2, 42, 99999, 123456789];

test('door offers are deterministic per (seed, wing, room) and never two of the same type', async () => {
  const { doorOffer } = await load('doors');
  for (const seed of SEEDS) for (let wing = 1; wing <= 10; wing++) for (const room of [1, 2, 4, 5]) {
    const a = doorOffer(seed, wing, room, { atFullHp: false }), b = doorOffer(seed, wing, room, { atFullHp: false });
    assert.deepEqual(a, b);
    assert.equal(a.length, 2);
    assert.notEqual(a[0], a[1]);
  }
  // Different rooms give variety overall (not the same pair everywhere).
  const pairs = new Set();
  for (const seed of SEEDS) for (const room of [1, 2, 4]) pairs.add(doorOffer(seed, 1, room, {}).join('+'));
  assert.ok(pairs.size > 1);
});

test('The Stacks only replaces Break Room, and only at full health', async () => {
  const { doorOffer } = await load('doors');
  for (const seed of SEEDS) for (let wing = 1; wing <= 10; wing++) for (const room of [1, 2, 4, 5]) {
    const hurt = doorOffer(seed, wing, room, { atFullHp: false }), full = doorOffer(seed, wing, room, { atFullHp: true });
    assert.ok(!hurt.includes('stacks'));
    assert.ok(!full.includes('rest'));
    assert.deepEqual(hurt.map((d) => (d === 'rest' ? 'stacks' : d)), full, 'same two slots, only Break Room swapped');
  }
});

test('doors follow ELITE_ROOM / BOSS_ROOM: fixed elite door, fixed author door, 2-door choice elsewhere, none after the boss', async () => {
  const { doorOffer, DOORS } = await load('doors');
  const { ELITE_ROOM, BOSS_ROOM, ROOMS_PER_WING } = await load('story');
  assert.equal(ROOMS_PER_WING, 7); assert.equal(ELITE_ROOM, 4); assert.equal(BOSS_ROOM, 7);
  for (const seed of SEEDS) for (let wing = 1; wing <= 10; wing++) {
    for (let room = 1; room < BOSS_ROOM; room++) {
      const o = doorOffer(seed, wing, room, {});
      if (room === ELITE_ROOM - 1) assert.deepEqual(o, ['elite']);
      else if (room === BOSS_ROOM - 1) assert.deepEqual(o, ['author']);
      else { assert.equal(o.length, 2, `after room ${room}`); assert.notEqual(o[0], o[1]); }
    }
    assert.deepEqual(doorOffer(seed, wing, 3, {}), ['elite']);
    assert.deepEqual(doorOffer(seed, wing, 6, {}), ['author']);
    assert.equal(doorOffer(seed, wing, 4, {}).length, 2);   // after the elite room: a normal choice
    assert.deepEqual(doorOffer(seed, wing, 7, {}), []);
    assert.deepEqual(doorOffer(seed, wing, 8, {}), []);
  }
  assert.ok(DOORS.elite.fixed && DOORS.author.fixed);
});

test('doors never make a room easier, and Rare Books adds exactly +0.35 elite share (capped at 1)', async () => {
  const { DOORS, applyDoor } = await load('doors');
  const { difficulty, threat, ROOMS_PER_WING } = await load('story');
  for (let wing = 1; wing <= 10; wing++) for (let room = 1; room <= ROOMS_PER_WING; room++) {
    const d = difficulty(wing, room);
    for (const id of Object.keys(DOORS)) {
      assert.ok(threat(applyDoor(d, id)) >= threat(d), `${id} made wing ${wing} room ${room} easier`);
      assert.equal(applyDoor(d, id).hpMult, d.hpMult, 'doors never weaken or strengthen individual enemies');
    }
    const rare = applyDoor(d, 'rare');
    assert.equal(rare.eliteChance, Math.min(1, d.eliteChance + (d.kind === 'normal' ? 0.35 : 0)));
    assert.ok(rare.eliteChance <= 1);
    assert.equal(applyDoor(d, 'rest').eliteChance, d.eliteChance, 'Break Room does not weaken enemies');
  }
  // Rare Books rooms spawn visibly more elites (same seed, composeRoom).
  const { composeRoom } = await load('story');
  const { Rng } = await load('util');
  let plain = 0, rich = 0;
  for (let s = 1; s <= 30; s++) {
    plain += composeRoom(1, 3, new Rng(s)).spawns.filter((x) => x.elite).length;
    rich += composeRoom(1, 3, new Rng(s), applyDoor(difficulty(1, 3), 'rare')).spawns.filter((x) => x.elite).length;
  }
  assert.ok(rich > plain * 3, `elites ${plain} -> ${rich}`);
});

test('door fines: Rare ×2, Break Room halved (rounded up, min 3), the others normal', async () => {
  const { doorReward } = await load('doors');
  const { roomReward } = await load('story');
  for (let wing = 1; wing <= 10; wing++) for (let room = 1; room <= 10; room++) {
    const base = roomReward(wing, room);
    assert.equal(doorReward(wing, room, 'rare'), base * 2);
    assert.equal(doorReward(wing, room, 'rest'), Math.max(3, Math.ceil(base / 2)));
    for (const id of ['mystery', 'stacks', 'elite', 'author', null]) assert.equal(doorReward(wing, room, id), base);
  }
  assert.equal(doorReward(1, 2, 'rest'), 3);   // base 4 -> 2 -> floor of 3
});

test('Mystery Shelf: deterministic, only unowned unbanned cursed books, otherwise a bonus perk', async () => {
  const { mysteryPrize } = await load('doors');
  const { UPGRADES } = await load('upgrades');
  const cursed = UPGRADES.filter((u) => u.kind === 'cursed');
  let curses = 0, perks = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = mysteryPrize(seed, 1, 3, {}, {}), b = mysteryPrize(seed, 1, 3, {}, {});
    assert.deepEqual(a, b);
    if (a.kind === 'cursed') { curses++; assert.ok(cursed.some((u) => u.id === a.id)); } else perks++;
  }
  assert.ok(curses > 60 && perks > 60, `${curses} curses / ${perks} perks`);
  // Everything owned or banished: always the bonus perk.
  const owned = Object.fromEntries(cursed.map((u) => [u.id, 1]));
  for (let seed = 1; seed <= 50; seed++) assert.equal(mysteryPrize(seed, 1, 3, owned, {}).kind, 'perk');
  const banned = new Set(cursed.map((u) => u.id));
  for (let seed = 1; seed <= 50; seed++) assert.equal(mysteryPrize(seed, 1, 3, {}, { banned }).kind, 'perk');
  // Lights Out needs lighting on.
  for (let seed = 1; seed <= 200; seed++) { const p = mysteryPrize(seed, 1, 3, {}, { lights: false }); assert.ok(p.kind !== 'cursed' || p.id !== 'lightsout'); }
});

test('Rare Books (v1.7.1): strictly harder in every wing and room; the bite starts at wing 4', async () => {
  const { applyDoor } = await load('doors');
  const { difficulty, threat, ROOMS_PER_WING } = await load('story');
  for (let wing = 1; wing <= 10; wing++) for (let room = 1; room <= ROOMS_PER_WING; room++) {
    const d = difficulty(wing, room), r = applyDoor(d, 'rare');
    if (d.kind !== 'normal') { assert.deepEqual(r, d, 'elite and boss rooms have no door effect'); continue; }
    assert.ok(threat(r) > threat(d), `Rare Books not harder at wing ${wing} room ${room}`);
    assert.ok(Math.abs(r.budget - d.budget * 1.15) < 1e-9, 'spawn budget x1.15');
    assert.equal(r.hpMult, d.hpMult);
    if (wing < 4) { assert.equal(r.eliteHpMult, undefined); assert.equal(r.eliteShootEvery, d.eliteShootEvery); }
    else { assert.equal(r.eliteHpMult, 1.3); assert.ok(Math.abs(r.eliteShootEvery - d.eliteShootEvery / 1.15) < 1e-9); }
  }
  // Other doors leave budget and elite stats alone.
  const d = difficulty(5, 3);
  for (const id of ['rest', 'mystery', 'stacks']) assert.deepEqual(applyDoor(d, id), d);
});

test('v1.12.2: fixed Elite / Author doors are walked through without a screen; real choices are not', async () => {
  const { doorOffer, soleDoor, DOORS } = await load('doors');
  const { ELITE_ROOM, ROOMS_PER_WING } = await load('story');
  assert.equal(soleDoor(doorOffer(1, 1, ELITE_ROOM - 1)), 'elite');
  assert.equal(soleDoor(doorOffer(1, 1, ROOMS_PER_WING - 1)), 'author');
  for (let r = 1; r < ROOMS_PER_WING; r++) {
    if (r === ELITE_ROOM - 1 || r === ROOMS_PER_WING - 1) continue;
    assert.equal(soleDoor(doorOffer(1, 1, r)), null, `room ${r} keeps its 2-door choice`);
  }
  assert.equal(soleDoor([]), null);
  assert.ok(DOORS.mystery.line.includes('50/50'), 'Mystery Shelf says what it is');
});

test('Rare pick (v1.14.1): completes a combo first, else advances a Masterwork perk, else any owned perk, else nothing', async () => {
  const { rarePick, DOORS } = await load('doors');
  const { Rng } = await load('util');
  assert.match(DOORS.rare.line, /better pick/);
  for (let seed = 1; seed <= 30; seed++) {
    const r = () => new Rng(seed);
    assert.equal(rarePick(r(), {}), null, 'nothing owned: no guarantee');
    assert.equal(rarePick(r(), { dewey: 1 }).id, 'bookmark', 'bookmark completes Dewey combo (also the only combo partner)');
    // Owning two perks at 1/3 each with no combo path: the closest to max is advanced, ties are allowed
    assert.equal(rarePick(r(), { coffee: 1 }).id, 'graceperiod', 'completing a combo beats advancing a perk');
    const a = rarePick(r(), { extendedloan: 2, speedreader: 1 });
    assert.equal(a.id, 'extendedloan', 'closest to its Masterwork wins');
    assert.equal(rarePick(r(), { extendedloan: 3 }), null, 'a maxed perk is not a path (Masterworks come as specials)');
    // banned perks are skipped
    assert.notEqual(rarePick(r(), { dewey: 1 }, { banned: new Set(['bookmark']) })?.id, 'bookmark');
  }
});
