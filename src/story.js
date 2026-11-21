// Story mode: ten handmade library wings, unlocked in order. Pure module (no DOM) so it is unit-tested.
//
// Structure (Archero-style): one run = one wing = 10 rooms. You pick a perk after every room.
// Room 5 is an elite room, room 10 a Rogue Author. Perks reset each run; Renovations (meta.js) don't.
//
// Difficulty rises on BOTH axes:
//   - room to room inside a wing (more enemies, tougher, faster, more elites, faster pages);
//   - wing to wing at the same room (every multiplier steps up, new enemy mixes, bosses learn patterns).
import { baseBudget, composeWave } from './waves.js';

export const ROOMS_PER_WING = 10;
export const ELITE_ROOM = 5;
export const BOSS_ROOM = 10;

// weights: enemy mix · unlockShift: enemy types arrive earlier · density: extra shelves per half
// gapMult: < 1 means less breathing room between spawn groups · eliteBonus: extra elite chance
export const WINGS = [
  { id: 'frontdesk', icon: '🛎️', name: 'Front Desk', blurb: 'Where every shift begins. Dust bunnies and overdue notices.',
    weights: { golem: 0.6 }, floorHue: 25, rug: '#4a1622' },
  { id: 'children', icon: '🧸', name: "Children's Wing", blurb: 'Small readers, big messes. Bunnies everywhere.',
    weights: { bunny: 2.4, patron: 0.6 }, floorHue: 38, rug: '#1f3d5a' },
  { id: 'periodicals', icon: '📰', name: 'Periodicals', blurb: 'Paper storms: swarms of overdue notices.',
    weights: { notice: 2.6 }, gapMult: 0.9, floorHue: 18, rug: '#2c3a1d' },
  { id: 'reference', icon: '📖', name: 'Reference Section', blurb: 'Loud patrons shout from behind the encyclopedias.',
    weights: { patron: 2.2 }, unlockShift: 1, floorHue: 30, rug: '#3b1f4a' },
  { id: 'stacks', icon: '📚', name: 'The Stacks', blurb: 'Tight aisles. Bookworms burrow between the shelves.',
    weights: { worm: 2.2 }, unlockShift: 1, density: 2, floorHue: 22, rug: '#4a3216' },
  { id: 'archive', icon: '🗄️', name: 'Archive', blurb: 'Late Fee Golems guard the old ledgers. Rich in fines.',
    weights: { golem: 2.4 }, unlockShift: 3, floorHue: 210, rug: '#24324a' },
  { id: 'studyhall', icon: '✏️', name: 'Study Hall', blurb: "Everyone's here, and nobody is quiet.",
    unlockShift: 3, gapMult: 0.85, floorHue: 28, rug: '#4a1f1f' },
  { id: 'vault', icon: '💎', name: 'Rare Books Vault', blurb: 'Elite collectors who fight back. Fines galore.',
    weights: { golem: 1.6 }, unlockShift: 4, eliteBonus: 0.08, floorHue: 270, rug: '#3a2050' },
  { id: 'maproom', icon: '🗺️', name: 'Map Room', blurb: 'Wide open floor and nowhere to hide from the crowd.',
    unlockShift: 5, density: -2, gapMult: 0.8, floorHue: 160, rug: '#173d38' },
  { id: 'restricted', icon: '🔒', name: 'The Restricted Section', blurb: 'The last door. Everything that was banned is awake.',
    unlockShift: 5, eliteBonus: 0.1, gapMult: 0.85, floorHue: 0, rug: '#3d0d14' },
];

export const roomKind = (room) => (room === BOSS_ROOM ? 'boss' : room === ELITE_ROOM ? 'elite' : 'normal');

/**
 * Every number that makes a room hard. Endless mode uses the same base curve for `room`, so wing 1
 * plays like the first ten endless waves; each later wing multiplies on top.
 */
export function difficulty(wing, room) {
  const w = wing - 1, r = room;
  const def = WINGS[w] || WINGS[WINGS.length - 1];
  const kind = roomKind(r);
  const base = baseBudget(r);
  const budgetMult = 1 + 0.08 * w;
  const budget = base * budgetMult * (kind === 'boss' ? 0.35 : kind === 'elite' ? 0.6 : 1);
  return {
    wing, room, kind,
    budget,
    hpMult: (1 + 0.08 * (r - 1)) * (1 + 0.22 * w),
    speedMult: (1 + Math.min(0.35, r * 0.015)) * (1 + 0.03 * w),
    eliteChance: kind === 'elite' ? 1 : Math.min(0.5, 0.035 * w + 0.008 * (r - 1) + Math.max(...WINGS.slice(0, w + 1).map((x) => x.eliteBonus || 0))),
    hazardSpeed: 1 + 0.04 * w + 0.01 * (r - 1),
    // Spawn pressure never relaxes: a wing keeps the tightest pacing of any wing before it.
    gapMult: Math.max(0.65, Math.min(...WINGS.slice(0, w + 1).map((x) => x.gapMult || 1)) * (1 - 0.025 * w)),
    eliteShootEvery: Math.max(1.5, 3.2 - 0.15 * w),
    deathBurst: w >= 3 ? 4 + w : 0,          // from wing 4, elites burst into pages when they go down
    bossTier: Math.floor(w / 3),             // 0..3: bosses learn a new pattern every 3 wings
    bossHp: kind === 'boss' ? Math.round(330 * (1 + 0.22 * w) * (1 + 0.12 * w)) : 0,
    shelvesPerHalf: Math.max(1, Math.min(7, 2 + Math.floor((r + 1) / 2) + (def.density || 0))),
  };
}

/**
 * One number for "how hard is this room", used by the tests to prove the curve only goes up.
 * Elites count as ~2.2 enemies (more HP, and they shoot); bosses add their HP.
 */
export function threat(d) {
  return (d.budget * d.hpMult * (1 + 1.2 * d.eliteChance) + d.bossHp / 4) * d.speedMult * d.hazardSpeed;
}

/** The spawn list for a story room. Layout seeds are fixed per wing+room; spawns vary with the run seed. `d` = difficulty with a door applied. */
export function composeRoom(wing, room, rng, d = difficulty(wing, room)) {
  const def = WINGS[wing - 1];
  return composeWave(room, rng, {
    boss: d.kind === 'boss', budget: d.budget, weights: def.weights, unlockShift: def.unlockShift || 0,
    gapMult: d.gapMult, eliteChance: d.eliteChance,
  });
}

/** Seed for a room's shelf layout: the same every time you play it, like a handmade level. */
export const layoutSeed = (wing, room) => 7919 * wing + 104729 * room;

/** Fines (🪙) for clearing a room. First clears of a wing pay a one-time bonus on top. */
export function roomReward(wing, room) {
  const kind = roomKind(room);
  return kind === 'boss' ? 25 + wing * 8 : kind === 'elite' ? 10 + wing * 3 : 3 + wing;
}
export const firstClearBonus = (wing) => 30 + 10 * wing;
