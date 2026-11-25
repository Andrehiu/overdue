// New-player help (v1.13.0): which menus a player has earned, and the scripted first room. Pure module (no DOM), unit-tested.
//
// Everything is derived from saves that already exist (progress, codex, Hall of Fame, personal best, tips), so a
// returning player sees every menu at once. The only new saved data is a few flag ids in the tips store (additive).

export const GUIDE_FLAG = 'guided-room';           // the guided first room was finished or skipped
export const UNLOCK_FLAG = { endless: 'unlock-endless', shop: 'unlock-shop', codex: 'unlock-codex', leaderboard: 'unlock-hof' };

/** The four menus that start hidden: the title button's data-act, the toast text when it appears. */
export const MENUS = [
  { id: 'endless', act: 'play', label: 'Endless', line: 'survive as long as you can' },
  { id: 'shop', act: 'shop', label: 'Renovations', line: 'permanent upgrades' },
  { id: 'codex', act: 'codex', label: 'Library Codex', line: 'your collection' },
  { id: 'leaderboard', act: 'leaderboard', label: 'Hall of Fame', line: 'high scores' },
];
export const unlockToast = (id) => { const m = MENUS.find((x) => x.id === id); return `🔓 ${m.label} unlocked: ${m.line}`; };

/** Has this player finished (or quit) any run? True for every returning player. */
export function hasPlayed({ progress = {}, bestScore = 0, hallCount = 0, seen = [] } = {}) {
  return seen.includes('firstrun') || (progress.lifetime || 0) > 0 || Object.keys(progress.best || {}).length > 0 || bestScore > 0 || hallCount > 0;
}

/**
 * Which hidden menus are unlocked. `s` = { progress, codexCount (seen + found), hallCount, bestScore, seen (tips ids) }.
 * Endless: after the first story run ends · Renovations: once any fines were banked · Codex: any entry · Hall of Fame: after the first endless run.
 */
export function unlockedMenus(s = {}) {
  const progress = s.progress || {}, seen = s.seen || [];
  return {
    endless: hasPlayed(s),
    shop: (progress.lifetime || 0) > 0 || (progress.fines || 0) > 0 || Object.keys(progress.reno || {}).length > 0,
    codex: (s.codexCount || 0) > 0,
    leaderboard: (s.hallCount || 0) > 0 || (s.bestScore || 0) > 0 || seen.includes('endless-run'),
  };
}

/** Menu ids that are unlocked but not yet announced (no flag in the tips store). */
export const newUnlocks = (unlocked, seen = []) => MENUS.filter((m) => unlocked[m.id] && !seen.includes(UNLOCK_FLAG[m.id])).map((m) => m.id);

/** The very first story run only: wing 1, never seen the guided room, and nothing played before. */
export const shouldGuide = (s = {}, mode, wing) => mode === 'story' && wing === 1 && !(s.seen || []).includes(GUIDE_FLAG) && !hasPlayed(s);

// ---- The guided room: three short beats, each waits for the previous one to be cleared ----
// speed/hp tune the enemies of that beat (slow dust bunnies, one fast charger, a small crowd); `dt` is when each appears.
export const GUIDE_BEATS = [
  { id: 'move', hl: null, speed: 0.5, hp: 2, spawns: [0.4, 1.6, 2.8].map((dt) => ({ type: 'bunny', dt })) },
  { id: 'dash', hl: 'dash', speed: 2.3, hp: 6, spawns: [{ type: 'bunny', dt: 0.6 }] },
  { id: 'shhh', hl: 'shhh', speed: 0.9, hp: 3, spawns: [0.3, 0.6, 0.9, 1.2, 1.5].map((dt) => ({ type: 'bunny', dt })) },
];

/** The one-line prompt for a beat. `aimOff` = touch with auto-aim off. `used` = the player already did the thing. */
export function guidePrompt(beat, { aimOff = false, used = false } = {}) {
  const b = GUIDE_BEATS[beat];
  if (!b) return '';
  if (b.id === 'move') return aimOff ? 'Drag to move. Drag a second finger to aim.' : 'Drag anywhere to move. Books throw themselves.';
  if (b.id === 'dash') return used ? 'Nice dodge! Keep throwing.' : 'Tap DASH to dodge';
  return used ? 'Nice! Finish them off.' : 'Tap SHHH to push them back';
}

// ---- v1.15.0: "What's new" card for big releases, and NEW badges on new perk cards ----
// Flags are plain ids in the tips store's `seen` list (additive, like the unlock flags above): `whatsnew-<release>` once the card was
// handled, `badge-<perk id>` once that perk's NEW badge was shown. Old saves load unchanged; "Show tips again" resets both.

/** The one-time card for a big release. Add a new entry only for big releases; small ones never show a card. */
export const WHATS_NEW = {
  release: '1.16.0',
  title: 'New in 1.16: Act II, The Sunken Stacks',
  lines: ['Clear The Restricted Section to open wings 11 and 12.', 'Flooded rooms: stay on the stone, mind the eels and paper boats.', 'Act II wings have 9 rooms, with a Rogue Author in room 9.'],
  button: 'Got it',
};
export const whatsNewFlag = (card = WHATS_NEW) => `whatsnew-${card.release}`;
export const badgeFlag = (id) => `badge-${id}`;

/** Compare "1.15.0"-style versions. Anything that isn't a plain x.y.z (a "dev" build) counts as newest. */
export function cmpVersion(a, b) {
  const v = (x) => (/^\d+\.\d+\.\d+$/.test(String(x)) ? String(x).split('.').map(Number) : null);
  const pa = v(a), pb = v(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/**
 * What to do with the "What's new" card on the title screen: 'show' (a returning player who hasn't seen it),
 * 'stamp' (a brand-new player: record it silently, show nothing) or null (already handled, or this build is older than the card).
 * `seen` = the saved tips ids, `played` = hasPlayed(...), `build` = the running version.
 */
export function whatsNewAction({ seen = [], played = false } = {}, build, card = WHATS_NEW) {
  if (cmpVersion(build, card.release) < 0 || seen.includes(whatsNewFlag(card))) return null;
  return played ? 'show' : 'stamp';
}

/** Which of the cards on offer get a NEW badge: ids in `newIds` whose badge hasn't been shown yet. */
export const badgedCards = (offeredIds, newIds, seen = []) => offeredIds.filter((id) => newIds.includes(id) && !seen.includes(badgeFlag(id)));
