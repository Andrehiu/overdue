// Unit tests for the game's pure, DOM-free modules (ES modules loaded via dynamic import).
import test from 'node:test';
import assert from 'node:assert/strict';

const load = (m) => import(`../src/${m}.js`);

test('Rng is deterministic per seed and int() is inclusive', async () => {
  const { Rng } = await load('util');
  const a = new Rng(42), b = new Rng(42), c = new Rng(43);
  const sa = Array.from({ length: 20 }, () => a.next());
  const sb = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, Array.from({ length: 20 }, () => c.next()));
  const r = new Rng(1), seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = r.int(1, 3); assert.ok(v >= 1 && v <= 3); seen.add(v); }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('angleDiff wraps into (-PI, PI]', async () => {
  const { angleDiff } = await load('util');
  assert.ok(Math.abs(angleDiff(0.1, -0.1) + 0.2) < 1e-9);
  assert.ok(Math.abs(angleDiff(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});

test('pushCircleOutOfRect resolves overlap, including centre-inside case', async () => {
  const { pushCircleOutOfRect } = await load('util');
  const rect = { x: 0, y: 0, w: 30, h: 30 };
  const o = { x: 35, y: 15 };
  assert.deepEqual(pushCircleOutOfRect(o, 10, rect), { nx: 1, ny: 0 });
  assert.equal(o.x, 40);
  const inside = { x: 2, y: 15 };
  assert.deepEqual(pushCircleOutOfRect(inside, 5, rect), { nx: -1, ny: 0 });
  assert.equal(inside.x, -5);
  assert.equal(pushCircleOutOfRect({ x: 100, y: 100 }, 5, rect), null);
});

test('arenas are deterministic, symmetric, connected and keep the spawn zone clear', async () => {
  const { generateArena, isConnected, COLS, ROWS, SAFE, idx } = await load('arena');
  for (let wave = 1; wave <= 30; wave++) {
    for (const seed of [1, 7, 123456, 987654321]) {
      const a = generateArena(seed, wave);
      assert.deepEqual(a.shelves, generateArena(seed, wave).shelves, 'deterministic');
      assert.ok(isConnected(a.solid), `connected seed=${seed} wave=${wave}`);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        assert.equal(a.solid[idx(x, y)], a.solid[idx(COLS - 1 - x, y)], 'mirror symmetric');
        if (x >= SAFE.x0 && x <= SAFE.x1 && y >= SAFE.y0 && y <= SAFE.y1) assert.equal(a.solid[idx(x, y)], 0, 'safe zone clear');
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) assert.equal(a.solid[idx(x, y)], 0, 'edges clear for spawns');
      }
    }
  }
  assert.ok(generateArena(5, 10).shelves.length > generateArena(5, 1).shelves.length, 'later waves are busier');
});

test('flow field routes around a wall and never steps into solids', async () => {
  const { computeFlowField, lineOfSight } = await load('flowfield');
  // 7x5 grid with a vertical wall at x=3 except a gap at y=4
  const cols = 7, rows = 5, solid = new Uint8Array(cols * rows);
  for (let y = 0; y < 4; y++) solid[y * cols + 3] = 1;
  const f = computeFlowField(solid, cols, rows, 6, 0);
  assert.equal(f.dist[0 * cols + 6], 0);
  // Walk from (0,0) following the field: must reach target via the gap
  let x = 0, y = 0, steps = 0;
  while (!(x === 6 && y === 0) && steps++ < 50) {
    const i = y * cols + x;
    x += Math.sign(f.dirX[i]);
    y += Math.sign(f.dirY[i]);
    assert.equal(solid[y * cols + x], 0, `stepped into wall at ${x},${y}`);
  }
  assert.ok(x === 6 && y === 0, 'reached target');
  assert.ok(f.dist[0] > 6, 'path is longer than the straight line');
  assert.equal(lineOfSight(solid, cols, rows, 10, 5, 5, 65, 5), false);
  assert.equal(lineOfSight(solid, cols, rows, 10, 5, 45, 65, 45), true);
});

test('waves respect budget, unlock order and boss cadence', async () => {
  const { composeWave, waveBudget, ENEMY_TYPES, isBossWave } = await load('waves');
  const { Rng } = await load('util');
  for (let w = 1; w <= 25; w++) {
    const wave = composeWave(w, new Rng(w * 31));
    const cost = wave.spawns.filter((s) => s.type !== 'boss').reduce((s, x) => s + ENEMY_TYPES[x.type].cost, 0);
    assert.ok(cost <= waveBudget(w) + 1e-9, `budget wave ${w}`);
    assert.ok(cost >= waveBudget(w) - 1, `budget mostly spent wave ${w}`);
    for (const s of wave.spawns) if (s.type !== 'boss') assert.ok(ENEMY_TYPES[s.type].unlock <= w, `${s.type} locked at ${w}`);
    assert.equal(wave.spawns.some((s) => s.type === 'boss'), isBossWave(w));
    for (let i = 1; i < wave.spawns.length; i++) assert.ok(wave.spawns[i].t >= wave.spawns[i - 1].t, 'sorted');
  }
  assert.deepEqual(composeWave(8, new Rng(5)), composeWave(8, new Rng(5)));
});

test('rollUpgrades returns distinct, non-maxed perks that mutate stats', async () => {
  const { rollUpgrades, UPGRADES, baseStats } = await load('upgrades');
  const { Rng } = await load('util');
  const rng = new Rng(9);
  const picks = rollUpgrades(rng, {}, 3);
  assert.equal(new Set(picks.map((p) => p.id)).size, 3);
  const owned = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  delete owned.hardcover;
  assert.deepEqual(rollUpgrades(rng, owned, 3).map((u) => u.id), ['hardcover']);
  const s = baseStats(), p = { hp: 1 };
  UPGRADES.find((u) => u.id === 'extendedloan').apply(s, p);
  assert.equal(s.maxHp, 6); assert.equal(p.hp, 6);
});

test('regression: flow field reaches every free cell on generated arenas', async () => {
  const { generateArena, COLS, ROWS } = await load('arena');
  const { computeFlowField } = await load('flowfield');
  for (let wave = 1; wave <= 12; wave++) {
    const a = generateArena(2024, wave);
    for (const [tx, ty] of [[16, 9], [0, 0], [31, 17], [5, 12]]) {
      const f = computeFlowField(a.solid, COLS, ROWS, tx, ty);
      for (let i = 0; i < a.solid.length; i++) if (!a.solid[i]) assert.ok(Number.isFinite(f.dist[i]), `cell ${i} unreachable (wave ${wave})`);
    }
  }
});

test('portrait arenas (phones) are connected, symmetric and keep the spawn zone clear', async () => {
  const A = await load('arena');
  A.setOrientation(true);
  try {
    assert.equal(A.W, 540); assert.equal(A.H, 960);
    for (let wave = 1; wave <= 20; wave++) for (const seed of [3, 99, 4242]) {
      const a = A.generateArena(seed, wave);
      assert.ok(A.isConnected(a.solid), `connected seed=${seed} wave=${wave}`);
      for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.solid[A.idx(x, y)], 0);
      for (let y = 0; y < A.ROWS; y++) for (let x = 0; x < A.COLS; x++) assert.equal(a.solid[A.idx(x, y)], a.solid[A.idx(A.COLS - 1 - x, y)]);
    }
  } finally { A.setOrientation(false); }
});

test('catalogue has books and authors for every title', async () => {
  const { CATALOGUE } = await load('catalogue');
  assert.ok(CATALOGUE.books.length >= 10);
  const authors = new Set(CATALOGUE.authors.map((a) => a.name));
  for (const b of CATALOGUE.books) {
    assert.ok(b.title && b.title.length <= 80, `title: ${b.title}`);
    assert.ok(authors.has(b.author), `unknown author: ${b.author}`);
  }
});

test('combo cards unlock from their two perks and always take the first slot', async () => {
  const { rollUpgrades, UPGRADES, byId, unlockedCombos } = await load('upgrades');
  const { Rng } = await load('util');
  for (const c of UPGRADES.filter((u) => u.kind === 'combo')) {
    assert.equal(c.requires.length, 2, c.id);
    for (const r of c.requires) assert.ok(byId(r) && byId(r).kind !== 'combo', `${c.id} requires unknown ${r}`);
    assert.deepEqual(unlockedCombos({ [c.requires[0]]: 1 }).map((u) => u.id).includes(c.id), false, 'needs both');
  }
  const owned = { bookmark: 1, dewey: 1 };
  for (let seed = 1; seed < 30; seed++) {
    const picks = rollUpgrades(new Rng(seed), owned, 3);
    assert.equal(picks[0].id, 'cyoa');
    assert.equal(new Set(picks.map((p) => p.id)).size, 3);
    assert.ok(picks.slice(1).every((p) => p.kind !== 'combo'));
  }
  assert.ok(!rollUpgrades(new Rng(1), { ...owned, cyoa: 1 }, 3).some((p) => p.id === 'cyoa'), 'taken combos disappear');
});

test('cursed books are one-time, and Lights Out needs lighting on', async () => {
  const { rollUpgrades, UPGRADES } = await load('upgrades');
  const { Rng } = await load('util');
  for (const u of UPGRADES.filter((x) => x.kind === 'cursed')) assert.equal(u.max, 1);
  let seenWithLights = false;
  for (let seed = 1; seed < 400; seed++) {
    assert.ok(!rollUpgrades(new Rng(seed), {}, 3, { lights: false }).some((p) => p.id === 'lightsout'));
    if (rollUpgrades(new Rng(seed), {}, 3, { lights: true }).some((p) => p.id === 'lightsout')) seenWithLights = true;
  }
  assert.ok(seenWithLights);
});

test('rebalance: no single core perk more than doubles output at level 1', async () => {
  const { byId, baseStats } = await load('upgrades');
  const s = baseStats();
  byId('hardcover').apply(s); assert.equal(s.damage, 1.5);
  byId('trilogy').apply(s); assert.equal(s.projectiles, 2);
  const c = baseStats();
  byId('bannedbook').apply(c, { hp: 5 }); assert.equal(c.damage, 2); assert.equal(c.maxHp, 4);
});

test('every stackable perk tops out at 3/3 and leads to exactly one Masterwork', async () => {
  const { UPGRADES, masterworkFor, unlockedMasterworks, rollUpgrades, baseStats } = await load('upgrades');
  const { Rng } = await load('util');
  const perks = UPGRADES.filter((u) => u.kind === 'perk');
  for (const p of perks) {
    assert.equal(p.max, 3, p.id);
    const mw = masterworkFor(p.id);
    assert.ok(mw, `${p.id} has no Masterwork`);
    assert.equal(UPGRADES.filter((u) => u.kind === 'master' && u.requires[0] === p.id).length, 1);
    assert.ok(!unlockedMasterworks({ [p.id]: 2 }).includes(mw), 'locked below 3/3');
    assert.ok(unlockedMasterworks({ [p.id]: 3 }).includes(mw), 'unlocked at 3/3');
    assert.equal(rollUpgrades(new Rng(7), { [p.id]: 3 }, 3)[0].id, mw.id, 'offered first');
    assert.ok(!rollUpgrades(new Rng(7), { [p.id]: 3, [mw.id]: 1 }, 3).some((u) => u.id === mw.id), 'gone once taken');
    // Applying the whole chain never produces NaN stats
    const s = baseStats(), pl = { hp: 5 };
    for (let i = 0; i < 3; i++) p.apply(s, pl);
    mw.apply(s, pl);
    for (const [k, v] of Object.entries(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${mw.id} broke ${k}`);
  }
});

test('perk cards preview changes in plain player terms', async () => {
  const { byId, baseStats, previewChange, pips, UPGRADES } = await load('upgrades');
  const s = baseStats();
  assert.deepEqual(previewChange(byId('extendedloan'), s, { hp: 4 }), ['Max hearts 5 → 6', 'Hearts 4/5 → 6/6']);
  assert.equal(s.maxHp, 5, 'preview must not mutate real stats');
  assert.deepEqual(previewChange(byId('dewey'), s, { hp: 5 }), ['Homing none → gentle']);
  byId('dewey').apply(s);
  assert.deepEqual(previewChange(byId('dewey'), s, { hp: 5 }), ['Homing gentle → strong']);
  assert.deepEqual(previewChange(byId('hardcover'), s, { hp: 5 }), ['Damage ×1 → ×1.5']);
  assert.deepEqual(previewChange(byId('graceperiod'), s, { hp: 3 }), ['Safe time after a hit 0.8s → 1.1s', 'Hearts 3 → 4']);
  assert.equal(pips(2, 3), '●●○');
  // No internal units anywhere in any preview
  const st = baseStats();
  for (const u of UPGRADES) for (const line of previewChange(u, st, { hp: 3 })) assert.ok(!/px|rad\b|rad\/s/.test(line), `${u.id}: ${line}`);
});

test('cards say just the gain, hint at combos, and Banish keeps perks out of the pool', async () => {
  const { byId, baseStats, gainText, comboHints, rollUpgrades } = await load('upgrades');
  const { Rng } = await load('util');
  const s = baseStats();
  assert.deepEqual(gainText(byId('extendedloan'), s, { hp: 3 }), ['+1 max heart', 'heals 2']);
  assert.deepEqual(gainText(byId('extendedloan'), s, { hp: 5 }), ['+1 max heart']);
  assert.deepEqual(gainText(byId('hardcover'), s, { hp: 5 }), ['+50% damage']);
  assert.deepEqual(gainText(byId('loudreader'), s, { hp: 5 }), ['SHHH! recharges 3× faster', 'Enemies 15% faster']);
  // Hints only when you already hold the partner perk
  assert.deepEqual(comboHints(byId('bookmark'), {}), []);
  assert.deepEqual(comboHints(byId('bookmark'), { dewey: 1 }).map((h) => h.combo.id), ['cyoa']);
  assert.deepEqual(comboHints(byId('bookmark'), { dewey: 1, cyoa: 1 }), [], 'no hint once taken');
  const banned = new Set(['hardcover', 'speedreader']);
  for (let seed = 1; seed < 200; seed++) assert.ok(!rollUpgrades(new Rng(seed), {}, 3, { banned }).some((u) => banned.has(u.id)));
});

test('home-screen app: manifest icons exist and the Pages deploy ships them', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(icon.src, root)), `missing ${icon.src}`);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const ref of ['manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/favicon-32.png']) assert.ok(html.includes(ref) && existsSync(new URL(ref, root)), ref);
  const pages = readFileSync(new URL('.github/workflows/pages.yml', root), 'utf8');
  assert.ok(pages.includes('icons') && pages.includes('manifest.webmanifest') && pages.includes('version.json'), 'Pages deploy copies icons, manifest and version.json');
});

test('arena shape fits the screen: phones, iPads, laptops, desktops', async () => {
  const A = await load('arena');
  const cases = [[390 / 844, 18, 32], [1920 / 1080, 32, 18], [1180 / 820, 28, 20], [2.4, 32, 18], [0.3, 18, 32]];
  for (const [aspect, c, r] of cases) assert.deepEqual(A.gridForAspect(aspect), [c, r], `aspect ${aspect}`);
  try {
    for (const aspect of [0.46, 0.69, 0.75, 1.0, 1.33, 1.42, 1.6, 1.78, 2.2]) {
      const [cols, rows] = A.gridForAspect(aspect);
      assert.equal(cols % 2, 0, 'even columns for mirror symmetry');
      A.setGrid(cols, rows);
      for (let wave = 1; wave <= 12; wave++) {
        const a = A.generateArena(77, wave);
        assert.ok(A.isConnected(a.solid), `connected ${cols}x${rows} wave ${wave}`);
        for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.solid[A.idx(x, y)], 0);
      }
    }
  } finally { A.setOrientation(false); }
});

test('version label shows version, commit and date; dev builds say so', async () => {
  const { versionLabel } = await load('version');
  assert.equal(versionLabel({ version: '1.1.0', commit: 'afd3fcb', built: '2026-11-21T03:00:00Z' }), 'v1.1.0 · afd3fcb · 21 Nov 2026');
  assert.equal(versionLabel({ version: 'dev', commit: 'local', built: '' }), 'dev build (not deployed)');
});
