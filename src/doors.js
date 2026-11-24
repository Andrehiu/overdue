// Story doors: after most rooms you pick the next room from 2 doors. Pure module (no DOM) so it is unit-tested.
//
// A door may make the next room harder (more elites) or change its reward, never easier.
// Offers come from their own seeded RNG (run seed + wing + room), so Renew / Banish / perk rolls never change them.
import { Rng, hashString } from './util.js';
import { ROOMS_PER_WING, ELITE_ROOM, roomReward } from './story.js';
import { UPGRADES, comboHints, masterworkFor } from './upgrades.js';

// id · icon · name · line (plain words, shown on the card) · banner (room banner subtitle)
// eliteAdd: extra elite share · budgetMult: spawn budget multiplier · biteWing: from this wing elites also get +50% HP and fire 30% faster · fineMult: fines multiplier · fineMin: floor for the reduced fines
export const DOORS = {
  rare:    { id: 'rare', icon: '💰', name: 'Rare Books', line: 'More enemies, more elites · ×2 fines + a better pick', banner: '💰 Rare Books: double fines, better pick', eliteAdd: 0.35, budgetMult: 1.15, biteWing: 4, eliteHpMult: 1.3, eliteFireMult: 1.15, fineMult: 2 },
  rest:    { id: 'rest', icon: '☕', name: 'Break Room', line: 'Heal 1 ♥ · fewer fines', banner: '☕ Break Room: +1 ♥, fewer fines', fineMult: 0.5, fineMin: 3, heal: 1 },
  mystery: { id: 'mystery', icon: '🎲', name: 'Mystery Shelf', line: 'Same room · 50/50: bonus perk or a cursed book', banner: '🎲 Mystery Shelf: 50/50 bonus perk or cursed book' },
  stacks:  { id: 'stacks', icon: '🚪', name: 'The Stacks', line: 'A normal room · normal fines', banner: '🚪 The Stacks: a normal room' },
  // Fixed doors in front of the elite room and the Rogue Author: same screen every room, no choice.
  elite:   { id: 'elite', icon: '★', name: 'Elite room', line: 'They fight back', banner: '★ Elite room: they fight back', fixed: true },
  author:  { id: 'author', icon: '📕', name: 'Rogue Author', line: 'The wing’s last stand', banner: 'A rogue author approaches…', fixed: true },
};

export const POOL = ['rare', 'rest', 'mystery'];     // Break Room becomes The Stacks at full health
const FIXED_AFTER = { [ELITE_ROOM - 1]: 'elite', [ROOMS_PER_WING - 1]: 'author' };

/** Door ids offered after clearing `clearedRoom` (1–2 ids; [] when there is no door screen). */
export function doorOffer(seed, wing, clearedRoom, { atFullHp = false } = {}) {
  if (clearedRoom >= ROOMS_PER_WING || clearedRoom < 1) return [];
  if (FIXED_AFTER[clearedRoom]) return [FIXED_AFTER[clearedRoom]];
  const rng = new Rng(hashString(`door:${seed}:${wing}:${clearedRoom}`));
  const picks = POOL.slice();
  picks.splice(rng.int(0, picks.length - 1), 1);   // drop one type, keep two different ones
  if (rng.chance(0.5)) picks.reverse();            // which card is on the left
  return picks.map((id) => (id === 'rest' && atFullHp ? 'stacks' : id));
}

/** The door to walk through without a choice screen: the single offered door (fixed Elite / Author doors), else null. */
export function soleDoor(offer) { return offer && offer.length === 1 ? offer[0] : null; }

/** The next room's difficulty with the door applied. Doors only ever make a room harder: never easier. */
export function applyDoor(diff, doorId) {
  const d = DOORS[doorId];
  if (!d || !d.eliteAdd || diff.kind !== 'normal') return diff;
  const out = { ...diff, eliteChance: Math.min(1, diff.eliteChance + d.eliteAdd), budget: diff.budget * (d.budgetMult || 1) };
  if (d.biteWing && diff.wing >= d.biteWing) {   // from wing 4: tougher elites that fire pages faster
    out.eliteHpMult = d.eliteHpMult;
    out.eliteShootEvery = diff.eliteShootEvery / d.eliteFireMult;
  }
  return out;
}

/** Fines for clearing `room` of `wing` after entering through `doorId`. */
export function doorReward(wing, room, doorId) {
  const base = roomReward(wing, room), d = DOORS[doorId];
  if (!d || !d.fineMult) return base;
  const scaled = d.fineMult < 1 ? Math.ceil(base * d.fineMult) : Math.round(base * d.fineMult);
  return Math.max(d.fineMin || 0, scaled);
}

/**
 * What a Mystery Shelf gives when its room is cleared: 50% a cursed book you don't own and haven't banished,
 * otherwise (or when none are left) a bonus perk pick. Own seeded RNG, like the offers.
 */
export function mysteryPrize(seed, wing, room, owned = {}, { banned = new Set(), lights = true } = {}) {
  const rng = new Rng(hashString(`mystery:${seed}:${wing}:${room}`));
  const pool = UPGRADES.filter((u) => u.kind === 'cursed' && !(owned[u.id] > 0) && !banned.has(u.id) && !(u.needsLights && lights === false));
  if (pool.length && rng.chance(0.5)) return { kind: 'cursed', id: rng.pick(pool).id };
  return { kind: 'perk' };
}

/**
 * The guaranteed card of a Rare Books pick (v1.14.1), or null. Best first:
 *  1. a perk you don't own that completes a Collected Works with a perk you do own;
 *  2. a perk you own (below max) that leads to a Masterwork, the one closest to max;
 *  3. any perk you own below max, the one closest to max.
 * Banned perks and Lights-Out-style cards that can't be used are skipped. Ties are broken by `rng`.
 */
export function rarePick(rng, owned = {}, { banned = new Set(), lights = true } = {}) {
  const ok = (u) => u.kind === 'perk' && !banned.has(u.id) && !(u.needsLights && lights === false);
  const perks = UPGRADES.filter(ok);
  const completes = perks.filter((u) => comboHints(u, owned).length > 0);
  if (completes.length) return rng.pick(completes);
  const below = perks.filter((u) => (owned[u.id] || 0) > 0 && owned[u.id] < u.max);
  const closest = (list) => { const top = Math.max(...list.map((u) => owned[u.id])); return rng.pick(list.filter((u) => owned[u.id] === top)); };
  const toMaster = below.filter((u) => masterworkFor(u.id));
  if (toMaster.length) return closest(toMaster);
  if (below.length) return closest(below);
  return null;
}
