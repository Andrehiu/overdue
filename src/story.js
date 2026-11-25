// Story mode: handmade library wings (7 rooms each in Act I, 9 in Act II), unlocked in order. Pure module (no DOM) so it is unit-tested.
//
// Structure (Archero-style): one run = one wing = 7 rooms. You pick a perk after every room.
// Room 4 is an elite room, room 7 a Rogue Author. Perks reset each run; Renovations (meta.js) don't.
//
// Difficulty rises on BOTH axes:
//   - room to room inside a wing (more enemies, tougher, faster, more elites, faster pages);
//   - wing to wing at the same room (every multiplier steps up, new enemy mixes, bosses learn patterns).
import { baseBudget, composeWave } from './waves.js';
import { hashString } from './util.js';

// Act I wings are 7 rooms (elite 4, boss 7). Act II wings (11+) are 9 rooms (elite 5, boss 9), v1.16.1.
// ROOMS_PER_WING / ELITE_ROOM / BOSS_ROOM are the Act I values; use roomsIn / eliteRoom / bossRoom(wing) for anything per wing.
export const ROOMS_PER_WING = 7;
export const ELITE_ROOM = 4;
export const BOSS_ROOM = 7;
export const ACT2_ROOMS = 9;
export const ACT2_ELITE_ROOM = 5;
export const ACT2_BOSS_ROOM = 9;
export const roomsIn = (wing) => (actOf(wing) === 2 ? ACT2_ROOMS : ROOMS_PER_WING);
export const eliteRoom = (wing) => (actOf(wing) === 2 ? ACT2_ELITE_ROOM : ELITE_ROOM);
export const bossRoom = (wing) => roomsIn(wing);
/** v1.16.1: Act II spawn budget +15% (longer wings, more to fight in every room), on top of each wing's own budgetBoost. */
export const ACT2_BUDGET_MULT = 1.15;

// Wings used to be 10 rooms. The new rooms sit on the old difficulty curve at these positions, so the
// opening and the boss are exactly as hard as before and only the middle is compressed.
export const CURVE = [1, 2, 4, 5, 7, 8, 10];
// Act II's 9 rooms: elite (room 5) sits at the old elite position 5, the boss (room 9) at 10.
export const CURVE_ACT2 = [1, 2, 3, 4, 5, 6, 8, 9, 10];
export const curveRoom = (room, wing = 1) => { const c = actOf(wing) === 2 ? CURVE_ACT2 : CURVE; return c[Math.min(c.length, Math.max(1, room)) - 1]; };

// Survive rooms: 30 s on the clock while enemies keep coming. Handmade per wing, never room 1, the elite
// room or the boss room; at most one per wing (v1.13.0, plain early rooms for new players). Fines are the plain room's.
export const SURVIVE_SECONDS = 30;
export const SURVIVE_BUDGET_MULT = 1.05;   // total spawn budget vs the plain room: never easier
export const SURVIVE_END = SURVIVE_SECONDS - 10;     // no spawn after this, so the last enemies still have time to be fought
// Budget shares and the time slice of the 30 s each chunk fills (thin start, heavy finish).
export const SURVIVE_CHUNKS = [{ share: 0.2, from: 0.8, to: 6 }, { share: 0.3, from: 6.5, to: 12 }, { share: 0.5, from: 12.5, to: SURVIVE_END }];
const SURVIVE_ROOMS = { 1: [3], 2: [], 3: [5], 4: [6], 5: [6], 6: [], 7: [5], 8: [3], 9: [], 10: [6], 11: [7], 12: [3] };
/** 'clear' (kill everything) or 'survive' (stay alive SURVIVE_SECONDS). Deterministic per wing + room. */
export const roomGoal = (wing, room) => ((SURVIVE_ROOMS[wing] || []).includes(room) ? 'survive' : 'clear');

// weights: enemy mix · unlockShift: enemy types arrive earlier · density: extra shelves per half
// shapes: the room layouts this wing uses (see arena.js) · gapMult: < 1 means less breathing room between spawn groups · eliteBonus: extra elite chance
export const WINGS = [
  { act: 1, id: 'frontdesk', shapes: ['scatter', 'reading'], icon: '🛎️', name: 'Front Desk', blurb: 'Where every shift begins. Dust bunnies and overdue notices.',
    intro: "Clock in. The returns bin is growling.", taunt: "Your fines have fines now, dear.", cleared: "Front Desk quiet. The bell rings for no one.",
    weights: { golem: 0.6 }, floorHue: 25, rug: '#4a1622' },
  { act: 1, id: 'children', shapes: ['pillars', 'scatter'], icon: '🧸', name: "Children's Wing", blurb: 'Small readers, big messes. Bunnies everywhere.',
    intro: "Story time is over. The bunnies didn't hear.", taunt: "I'm drawing outside the lines. And on YOU.", cleared: "Nap time, finally. Every last bunny.",
    weights: { bunny: 2.4, patron: 0.6 }, floorHue: 38, rug: '#1f3d5a' },
  { act: 1, id: 'periodicals', shapes: ['aisles', 'scatter'], icon: '📰', name: 'Periodicals', blurb: 'Paper storms: swarms of overdue notices.',
    intro: "Yesterday's news wants a word. Several thousand words.", taunt: "Breaking news: you're done.", cleared: "Periodicals filed. Even the crossword is solved.",
    weights: { notice: 2.6 }, gapMult: 0.9, floorHue: 18, rug: '#2c3a1d' },
  { act: 1, id: 'reference', shapes: ['reading', 'pillars'], icon: '📖', name: 'Reference Section', blurb: 'Loud patrons shout from behind the encyclopedias.',
    intro: "Loud patrons, louder opinions. Bring a SHHH.", taunt: "Ahem. As I said in footnote 4,182...", cleared: "Reference closed. Citations: needed no longer.",
    weights: { patron: 1.7 }, unlockShift: 1, floorHue: 30, rug: '#3b1f4a' },
  { act: 1, id: 'stacks', shapes: ['aisles', 'maze'], icon: '📚', name: 'The Stacks', blurb: 'Tight aisles. Bookworms burrow between the shelves.',
    intro: "Aisles so long the bookworms brought snacks.", taunt: "I've read every book in here. Twice. Through the spine.", cleared: "The Stacks stand still. Mind the worm holes.",
    weights: { worm: 2.2 }, unlockShift: 1, density: 2, floorHue: 22, rug: '#4a3216' },
  { act: 1, id: 'archive', shapes: ['maze', 'bridge'], icon: '🗄️', name: 'Archive', blurb: 'Late Fee Golems guard the old ledgers. Rich in fines.',
    intro: "The ledgers remember every unpaid fine. Every one.", taunt: "Your balance is overdue. Settle up.", cleared: "Archive audited. The books are balanced.",
    weights: { golem: 2.4 }, unlockShift: 3, floorHue: 210, rug: '#24324a' },
  { act: 1, id: 'studyhall', shapes: ['pillars', 'aisles'], icon: '✏️', name: 'Study Hall', blurb: "Everyone's here, and nobody is quiet.",
    intro: "Finals week. Nobody is quiet. Nobody.", taunt: "Sleep is for people who returned their books.", cleared: "Study Hall silent. Pencils down.",
    unlockShift: 3, gapMult: 0.85, floorHue: 28, rug: '#4a1f1f' },
  { act: 1, id: 'vault', shapes: ['reading', 'maze'], icon: '💎', name: 'Rare Books Vault', blurb: 'Elite collectors who fight back. Fines galore.',
    intro: "Behind glass, first editions with teeth.", taunt: "Mint condition. Unlike you, shortly.", cleared: "The Vault is sealed. Priceless, and quiet.",
    weights: { golem: 1.1 }, unlockShift: 4, eliteBonus: 0.04, floorHue: 270, rug: '#3a2050' },
  { act: 1, id: 'maproom', shapes: ['pillars'], icon: '🗺️', name: 'Map Room', blurb: 'Wide open floor and nowhere to hide from the crowd.',
    intro: "Wide open floor. Nowhere to hide. Nowhere.", taunt: "You are here. Not for long.", cleared: "Map Room charted. You are, in fact, here.",
    unlockShift: 5, density: -1, gapMult: 0.8, floorHue: 160, rug: '#173d38' },
  { act: 1, id: 'restricted', shapes: ['maze', 'bridge', 'aisles'], icon: '🔒', name: 'The Restricted Section', blurb: 'The last door. Everything that was banned is awake.',
    intro: "The last door. Everything banned is awake.", taunt: "Every story ends. Yours ends overdue.", cleared: "The library sleeps. Shift complete. SHHH.",
    unlockShift: 5, eliteBonus: 0.07, gapMult: 0.85, floorHue: 0, rug: '#3d0d14' },
  // ---- Act II: The Sunken Stacks (v1.16.0). Wings 11-20 arrive in batches; this is the first.
  // `enemyTypes` is the hook for Act II's own enemies (Ink Eel, Paper Boat: part B, see waves.js optIn): extra weights merged into `weights`.
  { act: 2, id: 'flooded', shapes: ['causeway', 'islands', 'pillars'], icon: '🌊', name: 'The Flooded Stacks', blurb: 'The basement took on water. Stay on the stone.',
    intro: "Mind the water. The shelves were here first.", taunt: "Sink or swim. Mostly sink.", cleared: "The Flooded Stacks drain slowly. Squelch.",
    weights: { patron: 1.2, golem: 0.9 }, enemyTypes: { eel: 0.8, boat: 0.8 }, unlockShift: 5, eliteBonus: 0.07, budgetBoost: 1.17, gapMult: 0.85, floorHue: 196, rug: '#173a44' },
  { act: 2, id: 'cistern', shapes: ['islands', 'causeway', 'reading'], icon: '🕳️', name: 'The Cistern', blurb: 'Deep water, narrow stone, and something under the surface.',
    intro: "The cistern echoes. Something answers.", taunt: "Down here, overdue means drowned.", cleared: "The Cistern is quiet. The water is not.",
    weights: { patron: 1.5, golem: 1.5, worm: 1.2 }, enemyTypes: { eel: 1, boat: 1 }, unlockShift: 6, eliteBonus: 0.1, budgetBoost: 1.32, gapMult: 0.85, floorHue: 190, rug: '#12343c' },
];

/** Which act a wing belongs to (1 or 2; later acts add more). */
export const actOf = (wing) => (WINGS[wing - 1] || WINGS[0]).act || 1;
export const WINGS_PER_ACT = 10;

export const roomKind = (wing, room) => (room === bossRoom(wing) ? 'boss' : room === eliteRoom(wing) ? 'elite' : 'normal');

/**
 * Every number that makes a room hard. Endless mode uses the same base curve for `room`, so wing 1
 * plays like the first ten endless waves; each later wing multiplies on top.
 */
// v1.14.0: enemy HP per wing used to compound 1 + 0.22w with the budget (wing 8 needed ~6x the damage per second of wing 1).
// The first two steps stay as they were; later wings climb more gently so the late game is reachable. Never decreases.
export const HP_EARLY_STEP = 0.22, HP_LATE_STEP = 0.05;
export const BUDGET_EARLY_STEP = 0.08, BUDGET_LATE_STEP = 0.05;
export const wingBudget = (w) => 1 + BUDGET_EARLY_STEP * Math.min(w, 2) + BUDGET_LATE_STEP * Math.max(0, w - 2);
export const wingHp = (w) => 1 + HP_EARLY_STEP * Math.min(w, 2) + HP_LATE_STEP * Math.max(0, w - 2);
export const BOSS_BUDGET_STEP = 0.08;
// v1.15.2: story enemies (and bosses) have 5% less HP in every wing. A flat factor, so the curve still only goes up. Endless doesn't use difficulty().
export const STORY_HP_MULT = 0.95;

export function difficulty(wing, room) {
  const w = wing - 1, r = curveRoom(room, wing);   // r: position on the old 10-room curve
  const def = WINGS[w] || WINGS[WINGS.length - 1];
  const kind = roomKind(wing, room);
  const goal = roomGoal(wing, room);
  const base = baseBudget(r);
  const budgetMult = wingBudget(w) * (def.budgetBoost || 1) * (def.act === 2 ? ACT2_BUDGET_MULT : 1);   // per-wing tuning dial (Act II): never below 1, so wings only get harder
  const budget = base * budgetMult * (kind === 'boss' ? 0.35 : kind === 'elite' ? 0.75 : 1) * (goal === 'survive' ? SURVIVE_BUDGET_MULT : 1);
  return {
    wing, room, kind, goal, pos: r,
    budget,
    hpMult: (1 + 0.08 * (r - 1)) * wingHp(w) * STORY_HP_MULT,
    speedMult: (1 + Math.min(0.35, r * 0.015)) * (1 + 0.02 * w),
    eliteChance: kind === 'elite' ? 1 : Math.min(0.5, 0.025 * w + 0.008 * (r - 1) + Math.max(...WINGS.slice(0, w + 1).map((x) => x.eliteBonus || 0))),
    hazardSpeed: 1 + 0.03 * w + 0.01 * (r - 1),
    // Spawn pressure never relaxes: a wing keeps the tightest pacing of any wing before it.
    gapMult: Math.max(0.65, Math.min(...WINGS.slice(0, w + 1).map((x) => x.gapMult || 1)) * (1 - 0.015 * w)),
    eliteShootEvery: Math.max(1.5, 3.2 - 0.15 * w),
    deathBurst: w >= 3 ? 2 + w : 0,          // from wing 4, elites burst into pages when they go down
    bossTier: Math.floor(w / 3),             // 0..3: bosses learn a new pattern every 3 wings
    bossHp: kind === 'boss' ? Math.round(330 * wingHp(w) * STORY_HP_MULT * (1 + BOSS_BUDGET_STEP * w)) : 0,
    shelvesPerHalf: Math.max(1, Math.min(7, 2 + Math.floor((r + 1) / 2) + (def.density || 0))),
  };
}

/**
 * One number for "how hard is this room", used by the tests to prove the curve only goes up.
 * Elites count as ~2.2 enemies (more HP, and they shoot); bosses add their HP.
 */
export function threat(d) {
  return (d.budget * d.hpMult * (1 + 1.2 * d.eliteChance * (d.eliteHpMult || 1)) + d.bossHp / 4) * d.speedMult * d.hazardSpeed;
}

/** The spawn list for a story room. Layout seeds are fixed per wing+room; spawns vary with the run seed. `d` = difficulty with a door applied. */
export function composeRoom(wing, room, rng, d = difficulty(wing, room)) {
  const def = WINGS[wing - 1];
  const opts = { boss: d.kind === 'boss', weights: { ...def.weights, ...def.enemyTypes }, unlockShift: def.unlockShift || 0, gapMult: d.gapMult, eliteChance: d.eliteChance };
  const pos = curveRoom(room, wing);
  if (d.goal !== 'survive') return composeWave(pos, rng, { ...opts, budget: d.budget });
  // Survive: a rising siege. The total budget is split into three chunks weighted toward the end (20% / 30% / 50%),
  // and each chunk's spawn times are fitted into its own slice of the timer, so the same enemies arrive in a
  // thin trickle first and a crush last. Every spawn lands before SURVIVE_END, never at the buzzer.
  const spawns = [];
  SURVIVE_CHUNKS.forEach(({ share, from, to }) => {
    const part = composeWave(pos, rng, { ...opts, budget: d.budget * share }).spawns;
    if (!part.length) return;
    const t0 = part[0].t, span = part[part.length - 1].t - t0;
    // Stretch or squeeze the chunk to fill its slice (a lone group sits in the middle of it).
    const k = span < 1 ? 1 : (to - from) / span, start = span < 1 ? (from + to - span) / 2 : from;
    for (const s of part) spawns.push({ ...s, t: +Math.min(SURVIVE_END, start + (s.t - t0) * k).toFixed(3) });
  });
  spawns.sort((a, b) => a.t - b.t);
  return { wave: pos, boss: false, spawns };
}

/** Seed for a room's shelf layout: the same every time you play it, like a handmade level. */
export const layoutSeed = (wing, room) => 7919 * wing + 104729 * room;

const forcedRoom = (wing, room) => room === eliteRoom(wing) || room === bossRoom(wing);

/**
 * Which layout shape a story room uses. Fixed per wing + room. Elite and boss rooms take the wing's
 * most open shape (pillars, else reading, else scatter); other rooms never repeat the previous room's shape.
 */
export function roomShape(wing, room) {
  const list = (WINGS[wing - 1] || WINGS[0]).shapes;
  if (forcedRoom(wing, room)) return ['pillars', 'reading'].find((x) => list.includes(x)) || 'scatter';   // Act II elite / boss rooms: the most open shape too (never water-heavy)
  const start = hashString(`shape:${layoutSeed(wing, room)}`) % list.length;
  const prev = room > 1 ? roomShape(wing, room - 1) : null;
  const next = forcedRoom(wing, room + 1) ? roomShape(wing, room + 1) : null;
  const order = list.map((_, i) => list[(start + i) % list.length]);
  return order.find((x) => x !== prev && x !== next) || order.find((x) => x !== prev) || order[0];
}

/** Fines (🪙) for clearing a room. First clears of a wing pay a one-time bonus on top. */
export function roomReward(wing, room) {
  // Seven rooms pay about what ten did: normal rooms x1.6, elite x1.25, boss x0.9 (a wing's total stays within 10% of the old one).
  const kind = roomKind(wing, room);
  return kind === 'boss' ? Math.round(0.9 * (25 + wing * 8)) : kind === 'elite' ? Math.round(1.25 * (10 + wing * 3)) : Math.round(1.6 * (3 + wing));
}
export const firstClearBonus = (wing) => 30 + 10 * wing;
