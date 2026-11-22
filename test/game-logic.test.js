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
  // v1.8.0: original parody authors only, no real people, animals or characters
  assert.equal(CATALOGUE.authors.length, 10);
  const banned = ['Doge Shibe', 'Grumpy', 'Rick Astley', 'Astley', 'Boromir', 'Nyan', 'Success Kid', 'Distracted Boyfriend', 'Dog With Coffee', 'Harambe', 'Stonks Guy'];
  const all = [...CATALOGUE.authors.map((a) => a.name), ...CATALOGUE.books.map((b) => b.title + ' ' + b.author)].join('\n');
  for (const w of banned) assert.ok(!all.includes(w), `old name still present: ${w}`);
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
  const cases = [[1920 / 1080, 32, 18], [1180 / 820, 28, 20], [2.4, 32, 18]];
  for (const [aspect, c, r] of cases) assert.deepEqual(A.gridForAspect(aspect), [c, r], `aspect ${aspect}`);
  for (let a = 0.3; a <= 3; a += 0.01) { const [c, r] = A.gridForAspect(a); assert.ok(r <= c, `landscape only: aspect ${a.toFixed(2)} gave ${c}x${r}`); }
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

test('everything the player throws stays out of the red/pink reserved for enemies', async () => {
  const { PLAYER, ENEMY, isEnemyHue, hueOf } = await load('palette');
  for (const [k, c] of Object.entries(PLAYER)) assert.ok(!isEnemyHue(c), `${k} ${c} (hue ${hueOf(c).toFixed(0)}) looks like an enemy colour`);
  assert.ok(isEnemyHue(ENEMY.page));
  assert.ok(isEnemyHue('#ff69b4') && isEnemyHue('#e84393'), 'pinks count as enemy colours');
  // main.js must not hard-code projectile colours outside the palette
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(!/spawnBook\([^)]*color: '#/.test(main), 'spawnBook colours come from palette.js');
  assert.ok(!/bookColor|bookHue/.test(main), 'no per-title book colours');
});

test('combo partners and combos in reach explain what pairs with what', async () => {
  const { byId, comboPartners, combosInReach, UPGRADES } = await load('upgrades');
  // Every core perk that belongs to a combo names its partner
  const p = comboPartners(byId('hardcover'), {});
  assert.deepEqual(p.map((x) => [x.combo.id, x.partner.id, x.partnerOwned]), [['annotated', 'footnotes', false]]);
  assert.ok(comboPartners(byId('hardcover'), { footnotes: 1 })[0].partnerOwned, 'owning the partner makes it a "completes" hint');
  assert.deepEqual(comboPartners(byId('hardcover'), { annotated: 1 }), [], 'taken combos are not hinted');
  assert.deepEqual(comboPartners(byId('bannedbook'), {}), [], 'curses have no combos');
  // Half-way combos, closest first
  assert.deepEqual(combosInReach({}), []);
  const reach = combosInReach({ bookmark: 1, dewey: 1, footnotes: 1 });
  assert.equal(reach[0].combo.id, 'cyoa'); assert.equal(reach[0].need.length, 0);
  assert.deepEqual(reach.slice(1).map((x) => x.combo.id).sort(), ['annotated', 'collapsing']);
  for (const x of reach) assert.equal(x.have.length + x.need.length, 2);
  // Every combo recipe is two real perks
  for (const c of UPGRADES.filter((u) => u.kind === 'combo')) assert.ok(c.requires.every((r) => byId(r)?.kind === 'perk'));
});

test('perk art: each perk adds one trait, they stack, and normal books stay plain', async () => {
  const { bookLook } = await load('palette');
  assert.ok(bookLook({}).plain);
  assert.ok(!bookLook({}).pointed, 'plain books still spin');
  assert.ok(Math.abs(bookLook({ hardcover: 3 }).size - 1.45) < 1e-9, 'Hardcover grows the book 15% per level');
  for (const [id, trait] of [['bookmark', 'ribbon'], ['speedreader', 'streak'], ['dewey', 'trail'], ['plottwist', 'glint'], ['spinebreaker', 'crack']]) {
    const L = bookLook({ [id]: 1 });
    assert.ok(L[trait] && !L.plain, `${id} shows ${trait}`);
  }
  assert.ok(bookLook({ dewey: 3 }).trail > bookLook({ dewey: 1 }).trail, 'Dewey trail grows per level');
  const all = bookLook({ hardcover: 3, bookmark: 1, speedreader: 2, dewey: 1, plottwist: 1, spinebreaker: 1 });
  assert.ok(all.ribbon && all.streak && all.trail && all.glint && all.crack && all.pointed, 'traits stack');
});

// ---- v1.3.1: wider aisles + corner assist ("I keep getting stuck") ----

/** Free cells between two shelves: the larger of the horizontal and vertical gaps (negative = overlap). */
const shelfGap = (a, b) => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));

test('aisles are at least 2 cells (60 px) wide in every room, on every screen shape, and never empty', async () => {
  const A = await load('arena');
  const { WINGS, ROOMS_PER_WING, difficulty, layoutSeed, roomShape } = await load('story');
  const shapes = [[32, 18], [18, 32], [28, 20], [20, 28], ...[0.5, 1, 1.4, 2].map((a) => A.gridForAspect(a))];
  const check = (a, label) => {
    assert.ok(a.shelves.length > 0, `${label}: has shelves`);
    assert.ok(A.isConnected(a.solid), `${label}: connected`);
    for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.solid[A.idx(x, y)], 0, `${label}: spawn zone clear`);
    assert.ok(A.isWide(a.solid), `${label}: every free cell is in a free 2x2 block`);
    if (a.shape !== 'scatter') return; // shaped rooms may have touching walls; the 2x2 rule above is what they must keep
    for (const s of a.shelves) { // walls
      assert.ok(s.x >= A.AISLE && s.y >= A.AISLE && A.COLS - (s.x + s.w) >= A.AISLE && A.ROWS - (s.y + s.h) >= A.AISLE, `${label}: wall aisle`);
    }
    for (let i = 0; i < a.shelves.length; i++) for (let j = i + 1; j < a.shelves.length; j++) {
      assert.ok(shelfGap(a.shelves[i], a.shelves[j]) >= A.AISLE, `${label}: shelves ${i}/${j} too close`);
    }
  };
  try {
    for (const [cols, rows] of shapes) {
      A.setGrid(cols, rows);
      for (let seed = 1; seed <= 20; seed++) for (let wave = 1; wave <= 30; wave++) check(A.generateArena(seed, wave), `${cols}x${rows} endless seed ${seed} wave ${wave}`);
      for (let w = 1; w <= WINGS.length; w++) for (let r = 1; r <= ROOMS_PER_WING; r++) {
        check(A.generateArena(layoutSeed(w, r), r, difficulty(w, r).shelvesPerHalf, roomShape(w, r)), `${cols}x${rows} story wing ${w} room ${r}`);
      }
    }
  } finally { A.setOrientation(false); }
});

test('cornerAssist slides the player around a clipped shelf corner, but not off a head-on face', async () => {
  const { cornerAssist } = await load('util');
  const rect = { x: 100, y: 100, w: 60, h: 30 };
  const r = 9;
  // Moving right, the circle's bottom edge dips 5 px into the rect's top: slide up by 5 to clear the corner.
  let o = { x: 92, y: 100 - r + 5 };
  const before = { x: 90, y: o.y };
  assert.equal(cornerAssist(o, before, r, rect), true);
  assert.equal(o.y, 100 - r); assert.equal(o.x, 92);
  // Clipping the bottom corner slides down.
  o = { x: 92, y: 130 + r - 5 };
  assert.equal(cornerAssist(o, { x: 90, y: o.y }, r, rect), true);
  assert.equal(o.y, 130 + r);
  // Moving left onto the right-hand face, clipping the top corner.
  o = { x: 168, y: 100 - r + 6 };
  assert.equal(cornerAssist(o, { x: 170, y: o.y }, r, rect), true);
  assert.equal(o.y, 100 - r);
  // Moving down and clipping the left edge slides left.
  o = { x: 100 - r + 4, y: 92 };
  assert.equal(cornerAssist(o, { x: o.x, y: 90 }, r, rect), true);
  assert.equal(o.x, 100 - r);
  // maxStep makes a long snag slide over several steps.
  o = { x: 92, y: 100 - r + 6 };
  cornerAssist(o, { x: 90, y: o.y }, r, rect, 8, 2);
  assert.equal(o.y, 100 - r + 4);
  // Head-on at the middle of the face: no sideways movement.
  o = { x: 92, y: 115 }; const ho = { x: 92, y: 115 };
  assert.equal(cornerAssist(o, { x: 90, y: 115 }, r, rect), false);
  assert.deepEqual(o, ho);
  // Overlapping the corner by more than 8 px is a real hit, not a clip.
  o = { x: 92, y: 100 - r + 9 };
  assert.equal(cornerAssist(o, { x: 90, y: o.y }, r, rect), false);
  // Mostly-diagonal movement and no movement are left alone.
  o = { x: 92, y: 100 - r + 5 };
  assert.equal(cornerAssist(o, { x: 90.5, y: o.y - 1.5 }, r, rect), false);
  assert.equal(cornerAssist(o, { x: o.x, y: o.y }, r, rect), false);
  // Moving away from a rect does nothing.
  o = { x: 88, y: 100 - r + 5 };
  assert.equal(cornerAssist(o, { x: 90, y: o.y }, r, rect), false);
});

test('cornerAssist + wall collision lets a circle walk past a corner it clips', async () => {
  const { cornerAssist, pushCircleOutOfRect } = await load('util');
  const rect = { x: 100, y: 100, w: 60, h: 30 }, r = 9;
  const p = { x: 60, y: 100 - r + 6 }; // 6 px of the circle sticks into the shelf's row
  for (let i = 0; i < 240; i++) {
    const before = { x: p.x, y: p.y };
    p.x += 1.75;
    cornerAssist(p, before, r, rect, 8, 3);
    pushCircleOutOfRect(p, r, rect);
  }
  assert.ok(p.x > 200, `got past the shelf (x=${p.x})`);
});

test('every perk has a short name for the build strip, and buildChips links combo partners', async () => {
  const { UPGRADES, byId, buildChips } = await load('upgrades');
  const shorts = UPGRADES.map((u) => u.short);
  for (const u of UPGRADES) assert.ok(u.short && u.short.length <= 13, `${u.id} short name "${u.short}"`);
  assert.equal(new Set(shorts).size, shorts.length, 'short names are unique');
  // sorted master, combo, perk, cursed; reports level
  const chips = buildChips({ bannedbook: 1, dewey: 2, cyoa: 1, m_tome: 1, hardcover: 3 });
  assert.deepEqual(chips.map((c) => c.kind), ['master', 'combo', 'perk', 'perk', 'cursed']);
  const dewey = chips.find((c) => c.id === 'dewey');
  assert.deepEqual([dewey.lvl, dewey.max, dewey.short, dewey.icon], [2, 3, 'Dewey', '🧭']);
  // linked: owned Dewey + offered Bouncy Bookmark completes CYOA
  const offered = [byId('bookmark'), byId('speedreader')];
  assert.equal(buildChips({ dewey: 1 }, offered)[0].linked, true);
  assert.equal(buildChips({ dewey: 1, speedreader: 1 }, offered).find((c) => c.id === 'speedreader').linked, false);
  assert.equal(buildChips({ dewey: 1 }, [byId('speedreader')])[0].linked, false);
  assert.equal(buildChips({ dewey: 1, bookmark: 1, cyoa: 1 }, offered).find((c) => c.id === 'dewey').linked, false, 'taken combo: no link');
  assert.equal(buildChips({ dewey: 1 })[0].linked, false);
});

test('scatter layouts are byte-identical to the pre-shapes generator (endless stays as it was)', async () => {
  const { createHash } = await import('node:crypto');
  const A = await load('arena');
  // sha256 over endless seeds 1-20 x waves 1-30, captured from the v1.4.0 generator.
  const expected = {
    '32x18': '38a12670b7f5bced59cca3c0d354c700c637cdf81a256934dbb488ba38ff314d',
    '28x20': '0a351cb2c6041bcd686f377a48f40542e1aa839af2f792e2505884481edf6c08',
    '28x21': 'f6f95a470ea3223f681f09476f5fbd6c52304149bfc898f5c13f955fffdb80a2',
  };
  try {
    for (const [cols, rows] of [[32, 18], [28, 20], A.gridForAspect(4 / 3)]) {
      A.setGrid(cols, rows);
      const plain = createHash('sha256'), named = createHash('sha256');
      for (let s = 1; s <= 20; s++) for (let w = 1; w <= 30; w++) {
        plain.update(Buffer.from(A.generateArena(s, w).solid));
        named.update(Buffer.from(A.generateArena(s, w, null, 'scatter').solid));
      }
      assert.equal(plain.digest('hex'), expected[`${cols}x${rows}`], `${cols}x${rows} endless layouts unchanged`);
      assert.equal(named.digest('hex'), expected[`${cols}x${rows}`], `${cols}x${rows} 'scatter' = default`);
    }
  } finally { A.setOrientation(false); }
});

test('every room shape keeps the rules: connected, clear spawn, no passage under 2 cells, open edges, denser = more shelf', async () => {
  const A = await load('arena');
  const { computeFlowField } = await load('flowfield');
  const grids = [[32, 18], [28, 20], A.gridForAspect(4 / 3), A.gridForAspect(1.6)];
  try {
    for (const [cols, rows] of grids) {
      A.setGrid(cols, rows);
      for (const shape of A.SHAPES) for (let seed = 1; seed <= 12; seed++) {
        let prevCells = 0;
        for (let d = 1; d <= 7; d++) {
          const label = `${cols}x${rows} ${shape} seed ${seed} density ${d}`;
          const a = A.generateArena(seed * 977, (seed % 10) + 1, d, shape);
          assert.deepEqual(a.solid, A.generateArena(seed * 977, (seed % 10) + 1, d, shape).solid, `${label}: deterministic`);
          assert.ok(a.shelves.length > 0, `${label}: not empty`);
          if (shape !== 'scatter') assert.equal(a.shape, shape, `${label}: no fallback`);
          assert.ok(A.isConnected(a.solid), `${label}: connected`);
          for (let y = A.SAFE.y0; y <= A.SAFE.y1; y++) for (let x = A.SAFE.x0; x <= A.SAFE.x1; x++) assert.equal(a.solid[A.idx(x, y)], 0, `${label}: spawn clear`);
          assert.ok(A.isWide(a.solid), `${label}: no passage narrower than 2 cells`);
          if (shape === 'scatter') for (let i = 0; i < a.shelves.length; i++) for (let j = i + 1; j < a.shelves.length; j++) assert.ok(shelfGap(a.shelves[i], a.shelves[j]) >= A.AISLE, `${label}: shelves ${i}/${j} too close`);
          // The flow field (what enemies follow) must reach every free cell from the player's spawn.
          const f = computeFlowField(a.solid, cols, rows, cols >> 1, rows >> 1);
          for (let i = 0; i < a.solid.length; i++) if (!a.solid[i]) assert.ok(Number.isFinite(f.dist[i]), `${label}: flow field reaches cell ${i}`);
          const edge = A.edgeCells(a.solid);
          const sides = new Set(edge.map(([x, y]) => (y === 0 ? 't' : y === rows - 1 ? 'b' : x === 0 ? 'l' : 'r')));
          assert.ok(edge.length >= 12 && sides.size >= 3, `${label}: edge entry points`);
          const cells = a.solid.reduce((s, v) => s + v, 0);
          if (shape !== 'scatter') assert.ok(cells >= prevCells, `${label}: denser never has fewer shelf cells`);
          prevCells = cells;
        }
      }
    }
  } finally { A.setOrientation(false); }
});

test('reading rooms have four openings and bridge walls are continuous but for 2-3 gaps', async () => {
  const A = await load('arena');
  try {
    for (const [cols, rows] of [[32, 18], [28, 20], A.gridForAspect(4 / 3)]) {
      A.setGrid(cols, rows);
      for (let seed = 1; seed <= 10; seed++) {
        const r = A.generateArena(seed * 31, 5, 3, 'reading');
        // Walk outwards from the rug centre along the four axes: each must cross the ring through a gap.
        const cx = cols >> 1, cy = rows >> 1;
        const solidAt = (x, y) => r.solid[A.idx(x, y)] === 1;
        let up = false, down = false, left = false, right = false;
        for (const x of [cx - 1, cx]) { up = up || !solidAt(x, A.SAFE.y0 - 2); down = down || !solidAt(x, A.SAFE.y1 + 2); }
        for (const y of [cy - 1, cy]) { left = left || !solidAt(A.SAFE.x0 - 2, y); right = right || !solidAt(A.SAFE.x1 + 2, y); }
        assert.ok(up && down && left && right, `${cols}x${rows} seed ${seed}: openings top/bottom/left/right`);
        // ...and the ring is otherwise closed: the corners are solid.
        assert.ok(solidAt(A.SAFE.x0 - 2, A.SAFE.y0 - 2) && solidAt(A.SAFE.x1 + 2, A.SAFE.y1 + 2), 'closed corners');
        const b = A.generateArena(seed * 31, 5, 3, 'bridge');
        const wallX = b.shelves.filter((s) => s.w === 1 && s.h >= 3 && s.x < cols / 2 && s.y + s.h <= rows).map((s) => s.x);
        const x = Math.min(...wallX);
        let gaps = 0, run = false;
        for (let y = 0; y < rows; y++) { const free = !b.solid[A.idx(x, y)]; if (free && !run) gaps++; run = free; }
        assert.ok(gaps >= 2 && gaps <= 3, `${cols}x${rows} seed ${seed}: bridge wall has ${gaps} gaps`);
      }
    }
  } finally { A.setOrientation(false); }
});

test('aimSource: auto-aim on/off × touch / gamepad / mouse (v1.10.0)', async () => {
  const { aimSource } = await import('../src/util.js');
  const base = { autoaim: true, bot: false, touchEnabled: false, touchAiming: false, padConnected: false, padStick: false, mouseSeen: true };
  for (const autoaim of [true, false]) {
    assert.equal(aimSource({ ...base, autoaim }), 'mouse');                                              // mouse unchanged
    assert.equal(aimSource({ ...base, autoaim, touchEnabled: true, touchAiming: true }), 'touch');       // deflected aim stick always aims
    assert.equal(aimSource({ ...base, autoaim, padConnected: true, padStick: true, mouseSeen: false }), 'pad');
  }
  assert.equal(aimSource({ ...base, touchEnabled: true }), 'auto');
  assert.equal(aimSource({ ...base, autoaim: false, touchEnabled: true }), 'none');
  assert.equal(aimSource({ ...base, padConnected: true, mouseSeen: false }), 'auto');
  assert.equal(aimSource({ ...base, autoaim: false, padConnected: true, mouseSeen: false }), 'none');
  assert.equal(aimSource({ ...base, autoaim: false, bot: true }), 'auto');                              // the balance bot always auto-aims
});

test('aimStick: drag vector from where the finger landed, with a deadzone (v1.10.2)', async () => {
  const { aimStick } = await import('../src/util.js');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(aimStick(500, 200, 500, 200, 10).deflected, false);          // finger down, not dragged
  assert.equal(aimStick(500, 200, 510, 200, 10).deflected, false);          // exactly on the deadzone edge: not yet
  assert.equal(aimStick(500, 200, 510.5, 200, 10).deflected, true);
  assert.ok(near(aimStick(500, 200, 440, 200, 10).angle, Math.PI) || near(aimStick(500, 200, 440, 200, 10).angle, -Math.PI)); // drag left
  assert.ok(near(aimStick(500, 200, 560, 200, 10).angle, 0));               // right
  assert.ok(near(aimStick(500, 200, 500, 140, 10).angle, -Math.PI / 2));    // up (canvas y grows downward)
  assert.ok(near(aimStick(500, 200, 500, 260, 10).angle, Math.PI / 2));     // down
  // independent of where the finger started: same drag, different origins, same angle
  assert.equal(aimStick(0, 0, -30, 40, 10).angle, aimStick(900, 300, 870, 340, 10).angle);
});
