// v1.15.0 part B: Margin Notes, Last Chapter, Library Cat, Crossfire, plus the "What's new" card and NEW badges. Pure rules, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, byId, baseStats, gainText, rollUpgrades, partnerBias, PARTNER_BIAS, normalizeTips, NEW_IN_1_15, masterworkFor, unlockedCombos } from '../src/upgrades.js';
import { WHATS_NEW, cmpVersion, whatsNewAction, whatsNewFlag, badgeFlag, badgedCards } from '../src/newplayer.js';
import { Rng } from '../src/util.js';
import { PLAYER, isEnemyHue } from '../src/palette.js';

const take = (id, n) => { const s = baseStats(); for (let i = 0; i < n; i++) byId(id).apply(s, null); return s; };

test('Margin Notes: 2 diagonal books, then 1 behind, then 2 more diagonal; Compass Rose is its Masterwork', () => {
  assert.deepEqual([1, 2, 3].map((n) => take('margin', n).marginLvl), [1, 2, 3]);
  const s = baseStats();
  assert.deepEqual([1, 2, 3].map((n) => { byId('margin').apply(s, null); return gainText(byId('margin'), s, null).length; }), [1, 1, 1]);
  const lvl = (n) => take('margin', n), g = (n) => gainText(byId('margin'), lvl(n - 1), null)[0];
  assert.equal(g(1), '+2 books thrown diagonally');
  assert.equal(g(2), '+1 book thrown behind you');
  assert.equal(g(3), '+2 more diagonal books');
  assert.equal(masterworkFor('margin').id, 'm_compass');
  assert.equal(byId('margin').weight, 5);
});

test('Last Chapter: +15 / 25 / 35% per missing heart, Cliffhanger is the Masterwork', () => {
  assert.deepEqual([1, 2, 3].map((n) => +take('lastchapter', n).lastChapter.toFixed(2)), [0.15, 0.25, 0.35]);
  assert.match(gainText(byId('lastchapter'), baseStats(), null)[0], /^\+15% damage per missing heart/);
  assert.equal(masterworkFor('lastchapter').id, 'm_cliffhanger');
  assert.ok(take('lastchapter', 1).cliffhanger === false);
  const s = baseStats(); byId('m_cliffhanger').apply(s); assert.ok(s.cliffhanger);
});

test('Library Cat: three levels, Stray Colony adds a second cat', () => {
  assert.deepEqual([1, 2, 3].map((n) => take('librarycat', n).catLvl), [1, 2, 3]);
  assert.match(gainText(byId('librarycat'), baseStats(), null)[0], /2× damage every 1\.6 seconds/);
  assert.equal(masterworkFor('librarycat').id, 'm_colony');
  const s = baseStats(); byId('m_colony').apply(s); assert.ok(s.colony);
  assert.ok(!isEnemyHue(PLAYER.cat) && !isEnemyHue(PLAYER.catCollar), 'cat colours stay out of the enemy hues');
});

test('Crossfire unlocks from Margin Notes + Spine Breaker', () => {
  const c = byId('crossfire');
  assert.deepEqual(c.requires, ['margin', 'spinebreaker']);
  assert.ok(unlockedCombos({ margin: 1, spinebreaker: 1 }).includes(c));
  assert.ok(!unlockedCombos({ margin: 1 }).includes(c));
  const s = baseStats(); c.apply(s); assert.ok(s.crossfire);
});

test('card text speaks plainly: no internal units', () => {
  for (const id of ['margin', 'lastchapter', 'librarycat']) for (let n = 0; n < 3; n++) {
    const txt = gainText(byId(id), take(id, n), null).join(' ');
    assert.ok(txt && !/\b(px|rad)\b/.test(txt), `${id} L${n + 1}: ${txt}`);
  }
});

test('pool bias: a perk that completes a combo with one you own is a little more likely', () => {
  assert.equal(partnerBias(byId('margin'), { spinebreaker: 1 }), PARTNER_BIAS);
  assert.equal(partnerBias(byId('margin'), { hardcover: 1 }), 1);
  assert.equal(partnerBias(byId('margin'), { spinebreaker: 1, crossfire: 1 }), 1, 'taken combo: no bias');
  const count = (owned) => { const rng = new Rng(7); let n = 0; for (let i = 0; i < 3000; i++) if (rollUpgrades(rng, owned, 3, { noSpecial: true }).some((u) => u.id === 'margin')) n++; return n; };
  assert.ok(count({ spinebreaker: 1 }) > count({ hardcover: 1 }) * 1.05, 'bias shows in rolls');
  assert.ok(count({ hardcover: 1 }) > 0, 'unbiased perks still appear');
});

test('every id added in 1.15.0 is in the NEW list and exists (once the status perks land)', () => {
  assert.equal(new Set(NEW_IN_1_15).size, NEW_IN_1_15.length);
  for (const id of ['margin', 'lastchapter', 'librarycat', 'm_compass', 'm_cliffhanger', 'm_colony', 'crossfire']) assert.ok(NEW_IN_1_15.includes(id) && byId(id), id);
});

test('tips store keeps its shape: flags are plain ids in `seen`', () => {
  assert.deepEqual(normalizeTips({ seen: ['a', 'a', 'b', 'badge-margin', 'whatsnew-1.15.0'] }), { seen: ['a', 'b', 'badge-margin', 'whatsnew-1.15.0'] });
  assert.deepEqual(normalizeTips(null), { seen: [] });
});

test("What's new: once for a returning player, never for a fresh install, never on small releases", () => {
  const ret = { seen: [], played: true }, fresh = { seen: [], played: false }, done = { seen: [whatsNewFlag()], played: true };
  assert.equal(whatsNewAction(ret, '1.15.0'), 'show');
  assert.equal(whatsNewAction(fresh, '1.15.0'), 'stamp', 'fresh install: recorded, not shown');
  assert.equal(whatsNewAction(done, '1.15.0'), null, 'only once');
  assert.equal(whatsNewAction(done, '1.15.1'), null, 'a small release after it shows nothing');
  assert.equal(whatsNewAction(ret, '1.14.1'), null, 'older build: no card yet');
  assert.equal(whatsNewAction(ret, '1.15.1'), 'show', 'a 1.14 player jumping to 1.15.1 still sees it once');
  assert.equal(whatsNewAction(ret, 'dev'), 'show');
  assert.ok(WHATS_NEW.lines.length >= 2 && WHATS_NEW.lines.length <= 3 && WHATS_NEW.title.includes('7 new perks and 5 new combos'));
  assert.equal(cmpVersion('1.9.0', '1.15.0'), -1);
});

test('NEW badge: only on release-new ids that were not badged before', () => {
  assert.deepEqual(badgedCards(['margin', 'hardcover', 'crossfire'], NEW_IN_1_15, []), ['margin', 'crossfire']);
  assert.deepEqual(badgedCards(['margin', 'hardcover'], NEW_IN_1_15, [badgeFlag('margin')]), []);
});
