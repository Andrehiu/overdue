// Act II foundation (v1.16.0): water layouts, themes, wings 11-12, tester-safe progress. Pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (n) => import(`../src/${n}.js`);
const GRIDS = [[32, 18], [40, 19], [36, 22], [34, 22], [44, 22], [42, 19]];

test('water layouts: stone connects every dry cell, passages stay 2+ wide, spawn zone is dry, flow field reaches the player everywhere', async () => {
  const A = await load('arena'), { computeFlowField } = await load('flowfield');
  try {
    for (const [cols, rows] of GRIDS) {
      A.setGrid(cols, rows);
      for (const shape of A.WATER_SHAPES) for (let seed = 1; seed <= 40; seed++) for (const wave of [1, 4]) {
        const a = A.generateArena(seed * 31, wave, 1 + (seed % 5), shape);
        const label = `${cols}x${rows} ${shape} seed ${seed}`;
        if (cols > rows) assert.equal(a.shape, shape, `${label}: no silent fallback on landscape grids`);
        if (!a.water) continue;
        assert.ok(a.water.some(Boolean), `${label}: has water`);
        assert.ok(A.isConnected(a.walk), `${label}: every dry cell connected`);
        assert.ok(A.isWide(a.walk), `${label}: no 1-cell passage`);
        for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.walk[A.idx(x, y)], 0, `${label}: spawn zone dry`);
        for (let i = 0; i < a.walk.length; i++) {
          assert.equal(a.walk[i], a.solid[i] | a.water[i], `${label}: walk = shelves + water`);
          assert.ok(!(a.solid[i] && a.water[i]), `${label}: no shelf stands in water`);
        }
        const f = computeFlowField(a.walk, cols, rows, cols >> 1, rows >> 1);
        for (let i = 0; i < a.walk.length; i++) if (!a.walk[i]) assert.ok(Number.isFinite(f.dist[i]), `${label}: flow reaches cell ${i}`);
        // mirrored left/right, like every room
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) assert.equal(a.water[A.idx(x, y)], a.water[A.idx(cols - 1 - x, y)], `${label}: mirrored`);
        assert.ok(A.edgeCells(a.walk).length >= 12, `${label}: dry entry points`);
        assert.ok(A.edgeCells(a.walk).every(([x, y]) => !a.water[A.idx(x, y)]), `${label}: enemies never enter from water`);
      }
    }
  } finally { A.setOrientation(false); }
});

test('water blocks walkers (wrects) but not line of sight or books (solid): shelves are the only sight blockers', async () => {
  const A = await load('arena'), { lineOfSight } = await load('flowfield');
  try {
    A.setGrid(40, 19);
    const a = A.generateArena(77, 3, 3, 'causeway');
    assert.ok(a.waterRects.length > 0 && a.wrects.length === a.rects.length + a.waterRects.length);
    // a water cell in the top pool and the dry centre: nothing solid in between, so the line of sight is open
    let wx = -1, wy = -1;
    for (let y = 0; y < 8 && wx < 0; y++) for (let x = 0; x < A.COLS; x++) if (a.water[A.idx(x, y)]) { wx = x; wy = y; break; }
    assert.ok(wx >= 0, 'found water');
    assert.equal(A.isSolidPx(a.solid, wx * A.CELL + 15, wy * A.CELL + 15), false, 'books fly over water');
    assert.equal(lineOfSight(a.solid, A.COLS, A.ROWS, A.CELL, wx * A.CELL + 15, wy * A.CELL + 15, A.W / 2, A.H / 2), true, 'auto-aim sees across water');
  } finally { A.setOrientation(false); }
});

test('Act I and endless layouts carry no water and stay as they were (no extra fields)', async () => {
  const A = await load('arena');
  for (const shape of ['scatter', 'aisles', 'pillars', 'maze', 'reading', 'bridge']) {
    const a = A.generateArena(5, 3, 4, shape);
    assert.equal(a.water, undefined); assert.equal(a.walk, undefined); assert.equal(a.wrects, undefined);
  }
});

test('themes: Act I keeps its colours, Act II is cool stone with its own lamp tint, every act has a full theme', async () => {
  const { THEMES, themeOf, ACTS } = await load('themes');
  assert.equal(THEMES[1].floor.kind, 'planks'); assert.equal(THEMES[1].shelf.body, '#5b3a1e'); assert.equal(THEMES[1].lamp.bulb, '#ffd27a');
  assert.equal(THEMES[1].books.length, THEMES[2].books.length, 'same palette length keeps Act I RNG identical');
  assert.equal(themeOf(2).floor.kind, 'flagstone'); assert.notEqual(themeOf(2).lamp.glow, themeOf(1).lamp.glow);
  assert.equal(themeOf(99), THEMES[1]);
  for (const a of ACTS) { const t = THEMES[a.act]; for (const k of ['floor', 'shelf', 'books', 'lamp', 'wall']) assert.ok(t[k], `act ${a.act} has ${k}`); }
});

test('wings 11-12: Act II, harder than wing 10 at every room, water rooms, open elite and boss rooms', async () => {
  const S = await load('story'), A = await load('arena');
  assert.ok(S.WINGS.length >= 12);
  assert.equal(S.actOf(10), 1); assert.equal(S.actOf(11), 2); assert.equal(S.actOf(12), 2);
  for (let r = 1; r <= 9; r++) {   // wing 12 vs 11 (both 9 rooms); wing 11 vs 10 is checked by position in story-meta.test.js
    const a = S.difficulty(11, r), b = S.difficulty(12, r);
    assert.ok(S.threat(b) > S.threat(a), `wing 12 room ${r} is harder than wing 11`);
  }
  for (const w of [11, 12]) {
    const shapes = new Set(Array.from({ length: 9 }, (_, i) => S.roomShape(w, i + 1)));
    assert.ok([...shapes].some((x) => A.WATER_SHAPES.includes(x)), `wing ${w} has water rooms`);
    assert.ok([...shapes].some((x) => !A.WATER_SHAPES.includes(x)), `wing ${w} also has dry rooms`);
    for (const r of [S.eliteRoom(w), S.bossRoom(w)]) assert.ok(!A.WATER_SHAPES.includes(S.roomShape(w, r)), `wing ${w} room ${r} is open ground`);
    assert.ok(S.WINGS[w - 1].enemyTypes, `wing ${w} has the enemyTypes hook for part B`);
  }
});

test('saves: wing 11 unlocks after wing 10 is cleared; tester runs never unlock, clear or set best rooms but still bank fines', async () => {
  const M = await load('meta');
  let p = M.normalizeProgress({ unlocked: 10, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.equal(p.unlocked, 10);
  const real = M.recordRun(p, { fines: 40, mode: 'story', wing: 10, room: 7, cleared: true });
  assert.equal(real.unlockedWing, 11); assert.equal(real.progress.unlocked, 11);
  // an old save with wing 10 cleared and nothing else stored reads as wing 11 unlocked
  assert.equal(M.normalizeProgress({ unlocked: 10, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }).unlocked, 11);
  const t = M.recordRun(p, { fines: 40, mode: 'tester', wing: 10, room: 7, cleared: true });
  assert.equal(t.firstClear, false); assert.equal(t.unlockedWing, null);
  assert.deepEqual(t.progress.cleared, p.cleared); assert.deepEqual(t.progress.best, p.best); assert.equal(t.progress.unlocked, 10);
  assert.ok(t.progress.fines > p.fines, 'fines still earned');
});

test('per-wing tuning dials never make a wing easier (budgetBoost >= 1)', async () => {
  const S = await load('story');
  for (const w of S.WINGS) assert.ok((w.budgetBoost || 1) >= 1, `${w.id} budgetBoost`);
});

test('v1.16.2: walkers are at most 0.7 cells wide for walls, so a golem fits the 2-cell gaps the flow field plans through', async () => {
  const { wallRadius } = await load('flowfield'), { CELL } = await load('arena');
  assert.equal(wallRadius(12, CELL), 12, 'small walkers keep their size');
  assert.equal(wallRadius(30, CELL), 21, 'a big golem is capped at 0.7 cells');
  for (const r of [12, 15, 22, 24, 30, 40]) assert.ok(wallRadius(r, CELL) * 2 <= CELL * 2 * 0.75, `r ${r} fits a 2-cell gap with slack`);
});

const load2 = (m) => import(`../src/${m}.js`);
test('v1.17.0 wings 13-15: Act II, 9 rooms, harder than the previous wing at every room, elites/boss rooms open, wing 15 boss room is the harbour', async () => {
  const S = await load2('story'), A = await load2('arena');
  assert.ok(S.WINGS.length >= 15);
  for (const w of [13, 14, 15]) {
    assert.equal(S.actOf(w), 2); assert.equal(S.roomsIn(w), 9);
    for (let r = 1; r <= 9; r++) assert.ok(S.threat(S.difficulty(w, r)) > S.threat(S.difficulty(w - 1, r)), `wing ${w} room ${r} is harder than wing ${w - 1}`);
    assert.ok(S.WINGS[w - 1].shapes.some((x) => A.WATER_SHAPES.includes(x)));
    assert.ok(!A.WATER_SHAPES.includes(S.roomShape(w, 5)), 'elite room is open ground');
  }
  assert.equal(S.roomShape(15, 9), 'harbour'); assert.notEqual(S.roomShape(14, 9), 'harbour');
  assert.equal(S.WINGS[14].taunt, 'No ship leaves this harbour with an overdue book. Including yours.');
});
