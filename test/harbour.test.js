// The Harbourmaster (v1.17.0): the harbour room and the boss's timers. Pure rules, deterministic with a seeded Rng.
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (m) => import(`../src/${m}.js`);

test('harbour room: two 2-deep channels along the top and bottom walls, a walkable connected middle, entries and spawns on stone', async () => {
  const A = await load('arena'), S = await load('story');
  for (const [c, r] of [[32, 18], [40, 22], [44, 22], [48, 22], [40, 24]]) {
    A.setGrid(c, r);
    const a = A.generateArena(S.layoutSeed(15, 9), 9, 4, 'harbour');
    assert.equal(a.shape, 'harbour');
    for (let x = 0; x < c; x++) for (let k = 0; k < 2; k++) { assert.equal(a.water[A.idx(x, k)], 1); assert.equal(a.water[A.idx(x, r - 1 - k)], 1); }
    for (let x = 0; x < c; x++) for (let y = 2; y < r - 2; y++) assert.equal(a.water[A.idx(x, y)], 0, 'middle is dry');
    assert.ok(A.isConnected(a.walk) && A.isWide(a.walk) && A.isWideLinked(a.walk), `${c}x${r} connected, wide`);
    for (const [x, y] of A.edgeCells(a.walk)) assert.equal(a.walk[A.idx(x, y)], 0, 'entry on stone');
    assert.ok(A.edgeCells(a.walk).length >= 12);
    for (const s of a.shelves) assert.ok(s.y >= 4 && s.y + s.h <= r - 4, 'pillars keep 2 stone cells from a channel');
    assert.equal(a.walk[A.idx(c >> 1, r >> 1)], 0);
  }
});

test('water rooms no longer join through a single cell (wing 11 room 2 pinch)', async () => {
  const A = await load('arena'), S = await load('story');
  A.setGrid(40, 22);
  for (const w of [11, 12, 13, 14, 15]) for (let r = 1; r <= 9; r++) {
    const sh = S.roomShape(w, r); if (sh === 'harbour') continue;
    const a = A.generateArena(S.layoutSeed(w, r), r, Math.round(S.difficulty(w, r).shelvesPerHalf * A.areaK()), sh);
    if (a.walk) assert.ok(A.isWideLinked(a.walk), `wing ${w} room ${r}`);
  }
});

test('walls: 1-2 gaps, each at least 3 player widths, one gap always within reach of the player', async () => {
  const H = await load('harbour'), { Rng } = await load('util');
  const rng = new Rng(7), W = 1200, pw = 24;
  for (let i = 0; i < 500; i++) {
    const px = 40 + rng.next() * (W - 80), plan = H.planWall(rng, px, W, pw);
    assert.ok(plan.gaps.length >= 1 && plan.gaps.length <= 2);
    for (const g of plan.gaps) assert.ok(g.w >= 3 * pw);
    assert.ok(plan.gaps.some((g) => Math.abs(g.c - px) <= H.HM.wall.reach + g.w / 2), 'a gap within reach');
    const xs = H.wallPages(plan, W);
    for (const x of xs) for (const g of plan.gaps) assert.ok(Math.abs(x - g.c) >= g.w / 2);
    assert.ok(xs.length > 20);
  }
});

function run(phase, secs, { boats = 0, px = 600 } = {}) {
  const H = require_h, rng = new require_rng(3), h = H.newHarbour(1200, 660, 30), log = [];
  let t = 0;
  while (t < secs) { for (const e of H.harbourStep(h, 1 / 60, { phase, W: 1200, H: 660, cell: 30, r: 59, player: { x: px, y: 330, r: 11 }, boats, rng })) log.push({ ...e, t }); t += 1 / 60; }
  return { h, log };
}
let require_h, require_rng;
test.before(async () => { require_h = await load('harbour'); require_rng = (await load('util')).Rng; });

test('phase 1: a wall about every 2.2 s, each with a 0.5 s tell first; no boats, anchors or rams', () => {
  const { log } = run(1, 20);
  const tells = log.filter((e) => e.type === 'wallTell'), fires = log.filter((e) => e.type === 'wallFire');
  assert.ok(tells.length >= 7 && tells.length <= 10, `${tells.length} walls in 20 s`);
  fires.forEach((f, i) => assert.ok(Math.abs(f.t - tells[i].t - 0.5) < 0.03, 'fires 0.5 s after its tell'));
  for (let i = 1; i < tells.length; i++) assert.ok(Math.abs(tells[i].t - tells[i - 1].t - 2.2) < 0.1);
  assert.ok(!log.some((e) => ['boats', 'anchor', 'ramWindup'].includes(e.type)));
});

test('phase 2: broadside every ~2.6 s, 3 boats every ~8 s (cap 5 in total), an anchor every ~5 s that lands 0.9 s later', () => {
  const { log } = run(2, 41);
  const boats = log.filter((e) => e.type === 'boats'), anchors = log.filter((e) => e.type === 'anchor'), lands = log.filter((e) => e.type === 'anchorLand');
  assert.ok(boats.length >= 4 && boats.every((b) => b.list.length === 3), `${boats.length} drops`);
  assert.ok(Math.abs(boats[1].t - boats[0].t - 8) < 0.1);
  assert.ok(anchors.length >= 7 && Math.abs(anchors[2].t - anchors[1].t - 5) < 0.1);
  lands.forEach((l, i) => assert.ok(Math.abs(l.t - anchors[i].t - 0.9) < 0.03));
  assert.ok(boats.every((b) => b.list.every((x) => x.y === 30 || x.y === 630)), 'boats go into the channels');
  const capped = run(2, 20, { boats: 4 }).log.filter((e) => e.type === 'boats');
  assert.ok(capped.every((b) => b.list.length === 1), 'with 4 afloat only 1 more');
  assert.equal(run(2, 20, { boats: 5 }).log.filter((e) => e.type === 'boats').length, 0);
});

test('phase 3: leaves the channel, rams with a broadside from both sides, returns to a channel; anchors every ~3.5 s', () => {
  const { h, log } = run(3, 30);
  const wind = log.filter((e) => e.type === 'ramWindup'), go = log.filter((e) => e.type === 'ramGo'), end = log.filter((e) => e.type === 'ramEnd');
  assert.ok(wind.length >= 3 && go.length >= 3 && end.length >= 3);
  go.forEach((g, i) => assert.ok(Math.abs(g.t - wind[i].t - require_h.HM.ram.windup) < 0.03));
  const sides = log.filter((e) => e.type === 'ramSide'); assert.ok(sides.length >= 2 * go.length && sides.length % 2 === 0);
  assert.ok(!log.some((e) => e.type === 'wallTell'));
  const anchors = log.filter((e) => e.type === 'anchor'); assert.ok(Math.abs(anchors[2].t - anchors[1].t - 3.5) < 0.1);
  assert.ok(['sail', 'back', 'windup', 'ram'].includes(h.mode));
});

test('sailing: laps along a channel, changes channel after a lap; contact is small in a channel, full while ramming, none while changing channel', () => {
  const H = require_h, rng = new require_rng(1), h = H.newHarbour(1200, 660, 30), lanes = new Set(); let swapped = false;
  for (let t = 0; t < 60; t += 1 / 60) {
    H.harbourStep(h, 1 / 60, { phase: 1, W: 1200, H: 660, cell: 30, r: 59, player: { x: 600, y: 330, r: 11 }, boats: 0, rng });
    lanes.add(h.lane); if (h.mode === 'swap') { swapped = true; assert.equal(H.contactRadius(h, 59), 0); }
    assert.ok(h.x >= 0 && h.x <= 1200);
  }
  assert.ok(swapped && lanes.size === 2);
  h.mode = 'sail'; assert.ok(H.contactRadius(h, 59) < 59); h.mode = 'ram'; assert.equal(H.contactRadius(h, 59), 59);
});
