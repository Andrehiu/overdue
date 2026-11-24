// Rooms +20% (v1.14.0): story grids are bigger, endless keeps the legacy grid, every shape stays valid at the new sizes.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (m) => import(`../src/${m}.js`);
// iPhone 13 / 15 Pro Max / widest phone / iPad mini / iPad / iPad Pro / laptop / 2:1 phone
const ASPECTS = [844 / 390, 932 / 430, 2.2, 1133 / 744, 4 / 3, 1.43, 16 / 9, 2.0];

test('story grids are ~20% longer per side, even columns, follow the screen shape; endless keeps the legacy grid', async () => {
  const A = await load('arena');
  for (const a of ASPECTS) {
    const [lc, lr] = A.gridForAspect(a), [sc, sr] = A.gridForAspect(a, true);
    assert.deepEqual(A.gridForAspect(a, false), [lc, lr], 'endless grid unchanged');
    assert.equal(sc % 2, 0, 'even columns for mirror symmetry');
    assert.ok(sr / lr >= 1.1 && sr / lr <= 1.3, `rows ${lr} -> ${sr} at aspect ${a.toFixed(2)}`);
    assert.ok(sc > lc, `columns ${lc} -> ${sc}`);
    assert.ok(Math.abs(sc / sr / Math.min(Math.max(a, 4 / 3), 2.2) - 1) <= 0.03, `fills the screen shape: ${sc}x${sr} at ${a.toFixed(2)}`);
  }
  assert.deepEqual(A.gridForAspect(1920 / 1080), [32, 18]);   // legacy values pinned
  assert.deepEqual(A.gridForAspect(2.0), [34, 17]);
});

test('every room shape of every story room is valid at the new sizes (connected, wide, spawn clear, flow field reaches all, doors)', async () => {
  const A = await load('arena');
  const { computeFlowField } = await load('flowfield');
  const { WINGS, ROOMS_PER_WING, difficulty, layoutSeed, roomShape } = await load('story');
  try {
    for (const asp of ASPECTS) {
      const [cols, rows] = A.gridForAspect(asp, true);
      A.setGrid(cols, rows);
      const k = A.areaK();
      assert.ok(k >= 1.2, `area scale ${k.toFixed(2)} at ${cols}x${rows}`);
      for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) {
        const label = `${cols}x${rows} wing ${w} room ${r}`;
        const d = difficulty(w, r), shape = roomShape(w, r);
        const a = A.generateArena(layoutSeed(w, r), r, Math.round(d.shelvesPerHalf * k), shape);
        assert.ok(a.shelves.length > 0, `${label}: has shelves`);
        assert.ok(A.isConnected(a.solid), `${label}: connected`);
        assert.ok(A.isWide(a.solid), `${label}: shelf gaps >= 60 px`);
        for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.solid[A.idx(x, y)], 0, `${label}: spawn clear`);
        const f = computeFlowField(a.solid, cols, rows, cols >> 1, rows >> 1);
        for (let i = 0; i < a.solid.length; i++) if (!a.solid[i]) assert.ok(Number.isFinite(f.dist[i]), `${label}: flow field reaches cell ${i}`);
        const edge = A.edgeCells(a.solid);
        assert.ok(edge.length >= 12, `${label}: ${edge.length} entry points`);
      }
    }
  } finally { A.setOrientation(false); }
});

test('bigger rooms carry proportionally more shelf (story only: the scaled density is not lower than the old one)', async () => {
  const A = await load('arena');
  const { difficulty, layoutSeed, roomShape } = await load('story');
  const cover = (cols, rows, scale) => {
    A.setGrid(cols, rows);
    let tot = 0, n = 0;
    for (let w = 1; w <= 10; w++) for (let r = 1; r <= 7; r++) {
      const a = A.generateArena(layoutSeed(w, r), r, Math.round(difficulty(w, r).shelvesPerHalf * (scale ? A.areaK() : 1)), roomShape(w, r));
      tot += a.solid.reduce((s, v) => s + v, 0) / a.solid.length; n++;
    }
    return tot / n;
  };
  try {
    const [oc, or] = A.gridForAspect(844 / 390), [nc, nr] = A.gridForAspect(844 / 390, true);
    const old = cover(oc, or, false), nu = cover(nc, nr, true);
    assert.ok(nu >= old * 0.85, `shelf coverage old ${old.toFixed(3)} vs new ${nu.toFixed(3)}`);
  } finally { A.setOrientation(false); }
});
