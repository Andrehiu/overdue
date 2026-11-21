// Late fees: permanent progression between runs. Pure module (no DOM) so it is unit-tested.
//
// Every run earns fines (🪙): coins from Late Fee Golems, cleared rooms and waves, bosses, and a
// one-time bonus for each wing's first clear. Fines are banked when a run ends, win or lose, and buy
// Renovations: permanent upgrades that apply to every run, story and endless.
//
// Saved under its own key (PROGRESS_KEY) so no existing save is touched.
import { ROOMS_PER_WING, WINGS, firstClearBonus } from './story.js';

export const PROGRESS_KEY = 'overdue.progress.v1';

const geo = (base, growth) => (lvl) => Math.round(base * Math.pow(growth, lvl));
const list = (...costs) => (lvl) => costs[lvl];

// `apply(stats, lvl)` changes in-run stats; `run` keys are read by the run setup instead.
export const RENOVATIONS = [
  { id: 'spines', icon: '📕', name: 'Reinforced Spines', gain: '+10% book damage', max: 10, cost: geo(25, 1.32),
    apply: (s, n) => { s.damage += 0.1 * n; } },
  { id: 'armchair', icon: '🛋️', name: 'Comfy Armchair', gain: '+1 max heart', max: 3, cost: list(80, 220, 480),
    apply: (s, n) => { s.maxHp += n; } },
  { id: 'chute', icon: '📮', name: 'Book Return Chute', gain: '+8% throw speed', max: 5, cost: geo(35, 1.45),
    apply: (s, n) => { s.fireRate *= Math.pow(1.08, n); } },
  { id: 'shoes', icon: '👟', name: 'Quiet Shoes', gain: '+5% move speed', max: 5, cost: geo(30, 1.4),
    apply: (s, n) => { s.speed *= 1 + 0.05 * n; } },
  { id: 'catalogue', icon: '🗃️', name: 'Bigger Card Catalogue', gain: '4 perk choices instead of 3', max: 1, cost: list(300) },
  { id: 'headstart', icon: '🎒', name: 'Head Start', gain: 'Start every run with +1 random perk', max: 2, cost: list(120, 360) },
  { id: 'librarycard', icon: '🪪', name: 'Library Card', gain: '+1 Banish every run', max: 2, cost: list(60, 180) },
  { id: 'renewals', icon: '🔄', name: 'Renewal Desk', gain: '+1 Renew every run', max: 2, cost: list(90, 260) },
  { id: 'collector', icon: '🪙', name: 'Fine Collector', gain: '+20% fines earned', max: 5, cost: geo(50, 1.5) },
  { id: 'secondwind', icon: '💫', name: 'Second Wind', gain: 'Once per run, get back up with 2 hearts', max: 1, cost: list(450) },
];
export const renoById = (id) => RENOVATIONS.find((r) => r.id === id);

const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

/** A clean progress object from whatever was saved (missing, old or tampered data is repaired). */
export function normalizeProgress(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const reno = {};
  for (const r of RENOVATIONS) { const n = int(p.reno?.[r.id], 0, r.max); if (n) reno[r.id] = n; }
  const best = {}, cleared = [];
  for (let w = 1; w <= WINGS.length; w++) {
    const b = int(p.best?.[w], 0, ROOMS_PER_WING); if (b) best[w] = b;
    if (Array.isArray(p.cleared) && p.cleared.includes(w)) cleared.push(w);
  }
  const unlocked = Math.max(1, int(p.unlocked, 1, WINGS.length), Math.min(WINGS.length, (cleared.length ? Math.max(...cleared) : 0) + 1));
  return { v: 1, fines: int(p.fines, 0, 1e9), lifetime: int(p.lifetime, 0, 1e9), unlocked, best, cleared, reno };
}

export const level = (progress, id) => progress.reno[id] || 0;
export const nextCost = (progress, id) => { const r = renoById(id), n = level(progress, id); return n >= r.max ? null : r.cost(n); };
export const canBuy = (progress, id) => { const c = nextCost(progress, id); return c !== null && progress.fines >= c; };

/** Buy one level. Returns a new progress object (or the same one if it can't be bought). */
export function buy(progress, id) {
  if (!canBuy(progress, id)) return progress;
  const cost = nextCost(progress, id);
  return { ...progress, fines: progress.fines - cost, reno: { ...progress.reno, [id]: level(progress, id) + 1 } };
}

/** Apply every owned Renovation to a fresh baseStats() object. */
export function applyRenovations(stats, progress) {
  for (const r of RENOVATIONS) if (r.apply && level(progress, r.id)) r.apply(stats, level(progress, r.id));
  return stats;
}

/** Run-setup bonuses that aren't stats. */
export function runBonuses(progress) {
  return {
    cards: 3 + level(progress, 'catalogue'),
    startPerks: level(progress, 'headstart'),
    banishes: 1 + level(progress, 'librarycard'),
    renews: level(progress, 'renewals'),
    revives: level(progress, 'secondwind'),
    fineMult: 1 + 0.2 * level(progress, 'collector'),
  };
}

/**
 * Bank a finished run. `run` = { fines (before the collector bonus), mode, wing?, room?, cleared? }.
 * A wing's first clear adds its one-time bonus. Returns { progress, banked, firstClear, unlockedWing }.
 */
export function recordRun(progress, run) {
  const p = { ...progress, best: { ...progress.best }, cleared: [...progress.cleared] };
  let banked = Math.max(0, Math.round((run.fines || 0) * runBonuses(progress).fineMult));
  let firstClear = false, unlockedWing = null;
  if (run.mode === 'story' && run.wing >= 1 && run.wing <= WINGS.length) {
    p.best[run.wing] = Math.max(p.best[run.wing] || 0, Math.min(ROOMS_PER_WING, run.room || 0));
    if (run.cleared && !p.cleared.includes(run.wing)) {
      firstClear = true;
      banked += firstClearBonus(run.wing);
      p.cleared.push(run.wing);
      if (run.wing < WINGS.length && p.unlocked <= run.wing) { p.unlocked = run.wing + 1; unlockedWing = run.wing + 1; }
    }
  }
  p.fines += banked; p.lifetime += banked;
  return { progress: p, banked, firstClear, unlockedWing };
}
