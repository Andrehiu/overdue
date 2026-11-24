// New-player help (v1.13.0): menu unlock rules from saves, the guided-room flag, the Survive room table. Pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

const np = () => import('../src/newplayer.js');
const story = () => import('../src/story.js');
const fresh = { progress: { fines: 0, lifetime: 0, best: {}, reno: {} }, codexCount: 0, hallCount: 0, bestScore: 0, seen: [] };

test('a brand-new player has no optional menu unlocked', async () => {
  const { unlockedMenus } = await np();
  assert.deepEqual(unlockedMenus(fresh), { endless: false, shop: false, codex: false, leaderboard: false });
});

test('each menu unlocks from the save that earns it', async () => {
  const { unlockedMenus } = await np();
  assert.equal(unlockedMenus({ ...fresh, seen: ['firstrun'] }).endless, true, 'a finished run unlocks Endless');
  assert.equal(unlockedMenus({ ...fresh, progress: { ...fresh.progress, best: { 1: 1 } } }).endless, true, 'a banked story run unlocks Endless');
  assert.equal(unlockedMenus({ ...fresh, progress: { ...fresh.progress, lifetime: 12 } }).shop, true, 'banked fines unlock Renovations');
  assert.equal(unlockedMenus({ ...fresh, progress: { ...fresh.progress, reno: { speed: 1 } } }).shop, true);
  assert.equal(unlockedMenus({ ...fresh, codexCount: 1 }).codex, true, 'any Codex entry unlocks the Codex');
  assert.equal(unlockedMenus({ ...fresh, seen: ['endless-run'] }).leaderboard, true, 'the first endless run unlocks the Hall of Fame');
  assert.equal(unlockedMenus({ ...fresh, hallCount: 2 }).leaderboard, true);
  assert.equal(unlockedMenus({ ...fresh, bestScore: 900 }).leaderboard, true);
  // and not the others by accident
  const onlyRun = unlockedMenus({ ...fresh, seen: ['firstrun'] });
  assert.equal(onlyRun.codex || onlyRun.leaderboard || onlyRun.shop, false);
});

test('a returning player with old saves sees every menu at once, with no new flags needed', async () => {
  const { unlockedMenus, newUnlocks, MENUS } = await np();
  const old = { progress: { fines: 40, lifetime: 300, best: { 1: 7, 2: 3 }, reno: { speed: 2 } }, codexCount: 9, hallCount: 3, bestScore: 4200, seen: [] };
  const u = unlockedMenus(old);
  assert.ok(MENUS.every((m) => u[m.id]));
  assert.equal(newUnlocks(u, []).length, MENUS.length, 'all four still count as "new" until flagged');
});

test('unlock announcements fire once per menu: flagged ids are not reported again', async () => {
  const { newUnlocks, UNLOCK_FLAG, unlockToast } = await np();
  const u = { endless: true, shop: true, codex: false, leaderboard: false };
  assert.deepEqual(newUnlocks(u, []), ['endless', 'shop']);
  assert.deepEqual(newUnlocks(u, [UNLOCK_FLAG.endless]), ['shop']);
  assert.deepEqual(newUnlocks(u, [UNLOCK_FLAG.endless, UNLOCK_FLAG.shop]), []);
  assert.equal(unlockToast('shop'), '🔓 Renovations unlocked: permanent upgrades');
});

test('flags live in the tips store: existing tip saves stay valid and the store keeps its shape', async () => {
  const { normalizeTips } = await import('../src/upgrades.js');
  const { GUIDE_FLAG, UNLOCK_FLAG } = await np();
  const t = normalizeTips({ seen: ['firstrun', GUIDE_FLAG, UNLOCK_FLAG.shop, 7, null] });
  assert.deepEqual(Object.keys(t), ['seen']);
  assert.deepEqual(t.seen, ['firstrun', GUIDE_FLAG, UNLOCK_FLAG.shop]);
});

test('the guided room: only the first story run of a brand-new player, never twice', async () => {
  const { shouldGuide, GUIDE_FLAG } = await np();
  assert.equal(shouldGuide(fresh, 'story', 1), true);
  assert.equal(shouldGuide(fresh, 'endless', 1), false, 'endless never');
  assert.equal(shouldGuide(fresh, 'story', 2), false, 'wing 1 only');
  assert.equal(shouldGuide({ ...fresh, seen: [GUIDE_FLAG] }, 'story', 1), false, 'flag set (finished or skipped)');
  assert.equal(shouldGuide({ ...fresh, progress: { ...fresh.progress, lifetime: 5 } }, 'story', 1), false, 'a returning player never sees it');
  assert.equal(shouldGuide({ ...fresh, progress: { ...fresh.progress, best: { 1: 1 } } }, 'story', 1), false);
  assert.equal(shouldGuide({ ...fresh, hallCount: 1 }, 'story', 1), false);
});

test('guided room beats: slow bunnies, one charger, a small crowd; prompts match the controls', async () => {
  const { GUIDE_BEATS, guidePrompt } = await np();
  assert.deepEqual(GUIDE_BEATS.map((b) => b.id), ['move', 'dash', 'shhh']);
  assert.ok(GUIDE_BEATS[0].spawns.length >= 2 && GUIDE_BEATS[0].speed < 1, 'a few slow dust bunnies');
  assert.equal(GUIDE_BEATS[1].spawns.length, 1);
  assert.ok(GUIDE_BEATS[1].speed > 1.5, 'one bunny charges');
  assert.ok(GUIDE_BEATS[2].spawns.length >= 4, 'a small crowd');
  assert.equal(GUIDE_BEATS[1].hl, 'dash'); assert.equal(GUIDE_BEATS[2].hl, 'shhh');
  assert.equal(guidePrompt(0), 'Drag anywhere to move. Books throw themselves.');
  assert.match(guidePrompt(0, { aimOff: true }), /second finger to aim/);
  assert.equal(guidePrompt(1), 'Tap DASH to dodge');
  assert.equal(guidePrompt(2), 'Tap SHHH to push them back');
  for (let i = 0; i < 3; i++) assert.ok(guidePrompt(i).length <= 60, 'one short line');
});

test('Survive rooms: at most one per wing, never room 1 / elite / boss, later room kept for wings 3, 5, 7, 10', async () => {
  const { roomGoal, WINGS, ROOMS_PER_WING } = await story();
  const table = {};
  for (let w = 1; w <= WINGS.length; w++) table[w] = Array.from({ length: ROOMS_PER_WING }, (_, i) => i + 1).filter((r) => roomGoal(w, r) === 'survive');
  for (const [w, rooms] of Object.entries(table)) assert.ok(rooms.length <= 1, `wing ${w}: ${rooms}`);
  assert.deepEqual(table, { 1: [3], 2: [], 3: [5], 4: [6], 5: [6], 6: [], 7: [5], 8: [3], 9: [], 10: [6] });
});
