// Act II water enemies (v1.16.0 part B): eel surface/dive timer, boat drop cadence, spawn and movement only on water, endless/Act I untouched. Pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (n) => import(`../src/${n}.js`);
const seqRng = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('eel cycle: under -> rise -> up (spits once, hittable) -> dive -> under, and it can only be hit while up', async () => {
  const W = await load('water-enemies'), E = { };
  W.eelInit(E, () => 0);
  assert.equal(E.ph, 'under'); assert.equal(E.under, true); assert.equal(W.eelHittable(E), false);
  const seen = [], shots = []; let t = 0;
  for (let i = 0; i < 1500; i++) {   // 25 s at 60 fps
    const r = W.eelStep(E, 1 / 60, () => 0.5); t += 1 / 60;
    if (seen[seen.length - 1] !== E.ph) seen.push(E.ph);
    if (r.fire) shots.push(t);
    assert.equal(E.under, E.ph !== 'up', 'untargetable in every phase but up');
    assert.equal(W.eelHittable(E), E.ph === 'up');
    if (r.fire) assert.equal(E.ph, 'up', 'spits only while surfaced');
  }
  assert.deepEqual(seen.slice(0, 5), ['under', 'rise', 'up', 'dive', 'under']);
  const cycles = seen.filter((p) => p === 'up').length;
  assert.equal(shots.length, cycles, 'one fan per surfacing');
  assert.ok(Math.abs(W.EEL.rise + W.EEL.up - 1.6) < 1e-9 && W.EEL.up === 1, 'surfaced ~1 s, with a 0.6 s tell before it');
  assert.equal(W.EEL.fanPages, 3);
});

test('eel: the surfaced time is ~1 s and the tell comes before the first page', async () => {
  const W = await load('water-enemies'), E = {};
  W.eelInit(E, () => 0); E.phT = 0.01;
  let tUp = null, tFire = null, tDive = null, t = 0;
  for (let i = 0; i < 600; i++) {
    const r = W.eelStep(E, 0.01, () => 0); t += 0.01;
    if (E.ph === 'rise' && tUp === null) tUp = -1;
    if (E.ph === 'up' && tUp === -1) tUp = t;
    if (r.fire && tFire === null) tFire = t;
    if (E.ph === 'dive' && tDive === null) tDive = t;
  }
  assert.ok(tFire > tUp && tDive - tUp >= 0.95 && tDive - tUp <= 1.1, `up for ${(tDive - tUp).toFixed(2)} s`);
});

test('boat drop cadence: first drop within 3.2 s, then about every 4 s (+-25%)', async () => {
  const W = await load('water-enemies');
  const B = {}; W.boatInit(B, () => 0.5);
  const drops = []; let t = 0;
  for (let i = 0; i < 6000; i++) { t += 0.01; if (W.boatStep(B, 0.01, () => Math.random()).drop) drops.push(t); }   // 60 s
  assert.ok(drops[0] >= 1.8 && drops[0] <= 3.3, `first drop ${drops[0]}`);
  for (let i = 1; i < drops.length; i++) { const g = drops[i] - drops[i - 1]; assert.ok(g >= 3 - 0.02 && g <= 5 + 0.02, `gap ${g.toFixed(2)}`); }
  assert.ok(drops.length >= 11 && drops.length <= 18, `${drops.length} drops in 60 s`);
  assert.equal(W.BOAT.hp, 2);
});

test('water geometry: moves only into water, slides along a shore, spawns on water, drops on the nearest dry cell', async () => {
  const W = await load('water-enemies'), A = await load('arena');
  try {
    A.setGrid(40, 19);
    const cols = 40, rows = 19, cell = A.CELL;
    let waterRooms = 0;
    for (const shape of A.WATER_SHAPES) for (let seed = 1; seed <= 12; seed++) {
      const a = A.generateArena(seed * 17, 3, 2, shape);
      if (!W.hasWater(a)) continue;
      waterRooms++;
      // spawn: always a cell with water on all 4 sides, far from the player when possible
      const sp = W.waterSpawn(a.water, cols, rows, cell, cols * cell / 2, rows * cell / 2, () => Math.random());
      assert.ok(sp && W.discInWater(a.water, cols, rows, cell, sp.x, sp.y, 8), `${shape} ${seed}: spawn is on water`);
      // a long random swim never leaves the water
      let x = sp.x, y = sp.y, hd = 0;
      for (let i = 0; i < 2000; i++) {
        if (i % 20 === 0) hd = Math.random() * Math.PI * 2;
        const r = W.moveInWater(a.water, cols, rows, cell, x, y, Math.cos(hd) * 2.5, Math.sin(hd) * 2.5, 8);
        x = r.x; y = r.y;
        assert.ok(W.discInWater(a.water, cols, rows, cell, x, y, 8), `${shape} ${seed}: still in water after ${i} steps`);
      }
      // the drop cell is a free walkway cell (not shelf, not water), the nearest one
      const c = W.nearestWalkway(a.walk, cols, rows, cell, x, y);
      assert.ok(c && !W.inWater(a.water, cols, rows, cell, c.x, c.y) && !a.solid[A.idx(Math.floor(c.x / cell), Math.floor(c.y / cell))], `${shape} ${seed}: drop cell is a walkway`);
      for (let k = 0; k < 20; k++) {
        const px = (cell / 2) + Math.floor(Math.random() * cols) * cell, py = (cell / 2) + Math.floor(Math.random() * rows) * cell;
        const n = W.nearestWalkway(a.walk, cols, rows, cell, px, py), d = Math.hypot(n.x - px, n.y - py);
        for (let i = 0; i < a.walk.length; i++) if (!a.walk[i]) assert.ok(Math.hypot(((i % cols) + 0.5) * cell - px, (Math.floor(i / cols) + 0.5) * cell - py) >= d - 1e-6, 'nearest');
      }
    }
    assert.ok(waterRooms >= 10, `${waterRooms} water rooms tested`);
    assert.equal(W.hasWater({ water: new Uint8Array(10) }), false);
    assert.equal(W.waterSpawn(new Uint8Array(cols * rows), cols, rows, cell, 0, 0), null);
  } finally { A.setOrientation(false); }
});

test('water enemies are opt-in: endless, Act I and wings without them never roll an eel or boat; wings 11-12 do', async () => {
  const { composeWave } = await load('waves'), S = await load('story'), { Rng } = await load('util'), W = await load('water-enemies');
  for (let wave = 1; wave <= 30; wave++) for (let seed = 1; seed <= 20; seed++) {
    const spawns = composeWave(wave, new Rng(seed)).spawns;
    assert.ok(spawns.every((s) => !W.isWaterType(s.type)), 'endless has no water enemies');
  }
  for (let w = 1; w <= 10; w++) for (let r = 1; r <= S.ROOMS_PER_WING; r++) for (let seed = 1; seed <= 6; seed++)
    assert.ok(S.composeRoom(w, r, new Rng(seed)).spawns.every((s) => !W.isWaterType(s.type)), `Act I wing ${w} room ${r}`);
  for (const w of [11, 12]) {
    let eel = 0, boat = 0;
    for (let r = 1; r <= S.ROOMS_PER_WING; r++) for (let seed = 1; seed <= 30; seed++) for (const s of S.composeRoom(w, r, new Rng(seed)).spawns) { if (s.type === 'eel') eel++; if (s.type === 'boat') boat++; }
    assert.ok(eel > 0 && boat > 0, `wing ${w} rolls eels (${eel}) and boats (${boat})`);
  }
});

test('a room without water swaps water enemies for dry ones of similar cost', async () => {
  const W = await load('water-enemies'), { ENEMY_TYPES } = await load('waves');
  for (const t of W.WATER_TYPES) assert.ok(Math.abs(ENEMY_TYPES[W.DRY_SWAP[t]].cost - ENEMY_TYPES[t].cost) <= 1, t);
});
