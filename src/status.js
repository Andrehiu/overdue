// Status effects (v1.15.0 part A): ink, chill, static + Pop-up Book maths. Pure module (no DOM), unit-tested.
//
// Rules that every status perk obeys (owner decisions):
//  - ONE freeze/stun rule: bosses are immune to freeze and stun from these perks (they take +25% damage while
//    chilled instead). Everything else gets a 3 s cooldown after a freeze.
//  - ONE chain rule: damage from ink, zaps or pops never creates more ink, pops or zaps (across frames, because the
//    source travels with the damage). Bursts are capped at 6 per frame; extras are dropped, not queued.
//  - Per-hit chances scale by 4 / weaponHitsPerSec (clamped 0.5-2), so fast weapons don't proc more often.

export const INK_TICK = 0.5;          // ink damage lands every 0.5 s (merged damage numbers)
export const CHILL_TIME = 1.5;        // a chill lasts this long after the last hit
export const FREEZE_COOLDOWN = 3;     // seconds an elite / normal enemy can't be frozen again
export const BOSS_CHILL_BONUS = 1.25; // bosses take this much more damage while chilled
export const BRITTLE_BOSS_BONUS = 0.25; // Brittle Pages: extra boss damage (added to the chill bonus) while inked AND chilled
export const BRITTLE_HP = 0.2;        // Brittle Pages: inked + slowed enemies shatter at this share of health
export const BURSTS_PER_FRAME = 6;
export const ZAP_REACH = 150;
export const ZAP_POOL = 12;           // at most this many zap arcs on screen
export const ZAP_LIFE = 0.12;
export const DEEP_FREEZE_EVERY = 5, DEEP_FREEZE_TIME = 1, SUPER_FREEZE_TIME = 0.5;
export const POP_CHAIN_HITS = 6;      // one pop chain (a pop + its Grand Finale round) hurts at most this many enemies
export const SPLASH_RADIUS = 70, SPLASH_STRENGTH = 0.5;

/** Damage sources that are "status damage": silent, and they never start another status effect or burst. */
export const STATUS_SOURCES = new Set(['ink', 'zap', 'pop', 'cleanup']);
export const isStatusSource = (src) => STATUS_SOURCES.has(src);
/** Hits from these sources may apply ink / chill / zaps (book hits only). */
export const PROC_SOURCES = new Set(['throw', 'crit', 'orbit']);
export const canProc = (src) => PROC_SOURCES.has(src);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Chance per hit after the fast-weapon scaling: base × clamp(4 / hitsPerSec, 0.5, 2), never above 100%. */
export function procChance(base, hitsPerSec) {
  return Math.min(1, base * clamp(4 / Math.max(0.1, hitsPerSec), 0.5, 2));
}

/** Bosses are immune to freeze and stun from these perks. */
export const canFreeze = (e, now) => e.type !== 'boss' && now >= (e.freezeReady || 0);
/** Freeze `e` for `secs`. Returns whether it worked (false: boss, or still on cooldown). */
export function freeze(e, secs, now) {
  if (!canFreeze(e, now)) return false;
  e.stun = Math.max(e.stun || 0, secs);
  e.frozenT = Math.max(e.frozenT || 0, secs);
  e.freezeReady = now + secs + FREEZE_COOLDOWN;
  return true;
}

/** Speed multiplier from chill; bosses get half the slow. */
export const chillFactor = (e) => ((e.chillT || 0) > 0 ? 1 - (e.type === 'boss' ? 0.5 : 1) * (e.chill || 0) : 1);

/** Apply chill (strongest wins, timer refreshes). */
export function applyChill(e, strength) {
  e.chill = (e.chillT || 0) > 0 ? Math.max(e.chill || 0, strength) : strength;
  e.chillT = CHILL_TIME;
}

/**
 * Soak `e` in ink worth `frac` × `hit` damage spread over `dur` s. Refreshes the timer, doesn't stack:
 * the stronger ink stays. `gen` 0 = a book's ink (can splash with Indelible), 1 = splashed / pop ink (never splashes).
 */
export function applyInk(e, hit, frac, dur, gen = 0) {
  const dps = (frac * hit) / dur;
  if ((e.inkT || 0) > 0 && (e.inkDps || 0) >= dps) { e.inkT = Math.max(e.inkT, dur); return; }
  e.inkDps = dps; e.inkT = dur; e.inkGen = gen;
  if (!(e.inkTick > 0)) e.inkTick = INK_TICK;
}

/** Tick ink timers; returns the damage due this frame (0 most frames: it lands every INK_TICK). */
export function tickInk(e, dt) {
  if (!(e.inkT > 0)) return 0;
  e.inkT -= dt; e.inkTick = (e.inkTick || INK_TICK) - dt;
  if (e.inkTick > 0) return 0;
  e.inkTick += INK_TICK;
  return e.inkDps * INK_TICK;
}

/** Brittle Pages: inked + slowed normal enemies at <= 20% health shatter. Bosses never shatter. */
export const shouldShatter = (e) => e.type !== 'boss' && e.inkT > 0 && e.chillT > 0 && e.hp <= e.maxHp * BRITTLE_HP;

/** Damage multiplier for a hit on `e` from status rules (boss chill bonus, Brittle Pages boss bonus). */
export function statusDamageMult(e, brittle) {
  if (e.type !== 'boss' || !(e.chillT > 0)) return 1;
  return BOSS_CHILL_BONUS + (brittle && e.inkT > 0 ? BRITTLE_BOSS_BONUS : 0);
}

/** Per-frame burst budget: take() is true for the first 6 bursts in a frame, false after (dropped, not queued). */
export function makeBurstBudget(max = BURSTS_PER_FRAME) {
  let n = 0;
  return { reset() { n = 0; }, take() { if (n >= max) return false; n++; return true; }, get used() { return n; } };
}

/** Deep Freeze: count a hit on a slowed enemy; true on every 5th. */
export function deepFreezeHit(e) {
  e.chillHits = (e.chillHits || 0) + 1;
  if (e.chillHits >= DEEP_FREEZE_EVERY) { e.chillHits = 0; return true; }
  return false;
}

/**
 * Zap targets: starting from `from`, up to `n` hops, each to the nearest not-yet-hit enemy within `reach`.
 * `prefer(e)` (Conductive Ink): inked enemies are chosen before others. Pure: caller applies the damage.
 */
export function zapChain(from, enemies, n, reach = ZAP_REACH, prefer = null) {
  const out = [], hit = new Set([from]);
  let cur = from;
  for (let i = 0; i < n; i++) {
    let best = null, bd = Infinity, bestP = false;
    for (const e of enemies) {
      if (e.dead || hit.has(e)) continue;
      const d = Math.hypot(e.x - cur.x, e.y - cur.y);
      if (d > reach + e.r) continue;
      const p = prefer ? !!prefer(e) : false;
      if ((p && !bestP) || (p === bestP && d < bd)) { best = e; bd = d; bestP = p; }
    }
    if (!best) break;
    hit.add(best); out.push(best); cur = best;
  }
  return out;
}

/** Pop-up Book levels: radius 45 / 60 / 60, damage ×1 / ×1 / ×2. */
export const POP_RADIUS = [0, 45, 60, 60], POP_MULT = [0, 1, 1, 2];

/** Rolling per-second counters for the balance bot (cheap: a few numbers). */
export function makeMetrics() {
  return { bursts: 0, burstsThisSec: 0, burstHist: [], statusKillsSec: 0, statusKillHist: [], maxStatusKills1s: 0, maxPopChain: 0, kills: 0, inkKills: 0,
    bossSec: 0, bossFrozenSec: 0, eliteSec: 0, eliteFrozenSec: 0, sec: 0, secT: 0 };
}
export function tickMetrics(m, dt) {
  m.secT += dt;
  if (m.secT < 1) return;
  m.secT -= 1; m.sec++;
  m.burstHist.push(m.burstsThisSec); m.burstsThisSec = 0;
  m.statusKillHist.push(m.statusKillsSec); m.maxStatusKills1s = Math.max(m.maxStatusKills1s, m.statusKillsSec); m.statusKillsSec = 0;
  if (m.burstHist.length > 4000) { m.burstHist.shift(); m.statusKillHist.shift(); }
}
export const percentile = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
