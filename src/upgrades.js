// Perks offered between waves. Pure data + a seeded roller (no DOM), so it is unit-tested.
//
// Kinds:
//   perk    — normal, stackable up to `max`
//   cursed  — a trade-off: a big upside with a real cost (max 1, rarer)
//   combo   — a "Collected Works" card that unlocks once you own BOTH perks in `requires`
//   master  — a "Masterwork": one per perk, unlocked by taking that perk to 3/3. Outsized power.
// Unlocked combos and Masterworks ("specials") always take the first card slot until taken.

import { POP_RADIUS, POP_MULT } from './status.js';

export function baseStats() {
  return {
    maxHp: 5, speed: 210, fireRate: 4, damage: 1, projectiles: 1, spread: 0.2,
    bounces: 0, pierce: 0, homing: 0, homingRange: 0, critChance: 0.05, dashCd: 0.9,
    shhhCd: 8, shhhRadius: 140, orbiters: 0, iframes: 0.8, projSpeed: 520,
    // behaviour perks (0/false = off)
    shelfBurst: 0,        // Spine Breaker: burst radius when a book hits a shelf or wall
    nook: 0,              // Reading Nook: extra throw rate while next to a shelf
    wraps: 0,             // Interlibrary Loan: times a book can come back through the opposite edge
    retarget: false,      // Choose Your Own Adventure: ricochets turn toward the nearest enemy
    splitOnPierce: false, // Unreliable Narrator: piercing books split in two
    shhhVolley: 0,        // Silent Reading: books flung outward by SHHH!
    dashDamage: 0,        // All-Nighter: damage multiplier dealt to enemies you dash through
    critBurst: 0,         // Annotated Edition: crits splash in this radius
    bounceBurst: false,   // Collapsing Stacks: every ricochet also bursts
    // curses
    scoreMult: 1, lanternScale: 1, enemySpeedMult: 1, fineMult: 1, shhhStun: 1,   // fineMult: story fines per room (Lights Out); shhhStun: SHHH! stun length multiplier (Loud Reader)
    // masterworks
    tomeEvery: 0, zone: false, sagaEvery: 0, bounceAccel: 0, bookLife: 1.3, dashCharges: 1,
    regenPerWave: 0, shhhGlobal: false, critMult: 2.5, orbitPulse: false, amnesty: false,
    burstMult: 1, nookDamage: 0, wrapHoming: false,
    // v1.15.0 part B: Margin Notes, Last Chapter, Library Cat, Crossfire
    marginLvl: 0, compass: false,          // Margin Notes level 0-3; Compass Rose: every 3rd throw fires 8 ways
    lastChapter: 0, cliffhanger: false,    // Last Chapter: damage bonus per missing heart (max 3 count); Cliffhanger: +50% throw rate at 1 heart
    catLvl: 0, colony: false,              // Library Cat level 0-3; Stray Colony: a second cat, pounces stun
    crossfire: false,                      // Margin Notes + Spine Breaker: side and rear books burst bigger on shelves
    // status perks (v1.15.0 part A; src/status.js)
    ink: 0, inkDur: 0, chill: 0, staticChance: 0, staticLvl: 0, staticJumps: 0, staticDmg: 0.6, popLvl: 0, popRadius: 0, popMult: 0,
    indelible: false, deepFreeze: false, finale: false, brittle: false, conductive: false, superconductor: false, inkBombs: false,
  };
}

const perk = (o) => ({ kind: 'perk', weight: 7, ...o });
const cursed = (o) => ({ kind: 'cursed', max: 1, weight: 3, ...o });
const combo = (o) => ({ kind: 'combo', max: 1, weight: 0, ...o });
const master = (perkId, o) => ({ kind: 'master', max: 1, weight: 0, requires: [perkId], ...o });

export const UPGRADES = [
  // ---- core (rebalanced: no single card should carry a run) ----
  perk({ id: 'hardcover', icon: '📕', short: 'Hardcover', name: 'Hardcover Edition', desc: '+50% book damage', max: 3, weight: 9, apply: (s) => { s.damage += 0.5; } }),
  perk({ id: 'speedreader', icon: '⚡️', short: 'Speed Reader', name: 'Speed Reader', desc: '+30% of your starting throw rate', max: 3, weight: 9, apply: (s) => { s.fireRate += 1.2; } }),
  perk({ id: 'trilogy', icon: '📚', short: 'Trilogy', name: 'Trilogy Box Set', desc: '+1 book per throw', max: 3, weight: 6, apply: (s) => { s.projectiles += 1; s.spread = Math.max(0.14, s.spread * 0.9); } }),
  perk({ id: 'bookmark', icon: '🔖', short: 'Bookmark', name: 'Bouncy Bookmark', desc: 'Books ricochet off shelves & walls (+1 bounce)', max: 3, apply: (s) => { s.bounces += 1; } }),
  perk({ id: 'plottwist', icon: '🌀', short: 'Plot Twist', name: 'Plot Twist', desc: 'Books pierce through +1 enemy', max: 3, apply: (s) => { s.pierce += 1; } }),
  perk({ id: 'dewey', icon: '🧭', short: 'Dewey', name: 'Dewey Decimal Guidance', desc: 'Books home in on enemies. Each level turns harder and reaches further. Homing stops once a book comes back through a wall.', max: 3, weight: 6, apply: (s) => { s.homing += 2.4; s.homingRange = s.homingRange ? s.homingRange + 80 : 240; } }),
  perk({ id: 'coffee', icon: '☕', short: 'Espresso', name: 'Double Espresso', desc: '+12% move speed, −15% dash cooldown', max: 3, weight: 8, apply: (s) => { s.speed *= 1.12; s.dashCd *= 0.85; } }),
  perk({ id: 'extendedloan', icon: '❤️', short: 'Ext. Loan', name: 'Extended Loan', desc: '+1 max heart and fully heal', max: 3, apply: (s, p) => { s.maxHp += 1; if (p) p.hp = s.maxHp; } }),
  perk({ id: 'quietplease', icon: '🤫', short: 'Quiet Please', name: 'Quiet Please', desc: 'SHHH! recharges 25% faster and reaches 20% further', max: 3, weight: 6, apply: (s) => { s.shhhCd *= 0.75; s.shhhRadius *= 1.2; } }),
  perk({ id: 'footnotes', icon: '✳️', short: 'Footnotes', name: 'Footnotes', desc: '+15% chance to crit for 2.5× damage', max: 3, apply: (s) => { s.critChance += 0.15; } }),
  perk({ id: 'audiobook', icon: '🎧', short: 'Audiobook', name: 'Audiobook Orbit', desc: 'Books orbit you, smacking enemies (first pick: 2 books, then +1)', max: 3, weight: 5, apply: (s) => { s.orbiters = s.orbiters ? s.orbiters + 1 : 2; } }),
  perk({ id: 'graceperiod', icon: '🕊️', short: 'Grace Period', name: 'Grace Period', desc: 'Heal 1 heart; +0.3s invulnerability after a hit', max: 3, weight: 6, apply: (s, p) => { s.iframes += 0.3; if (p) p.hp = Math.min(s.maxHp, p.hp + 1); } }),

  // ---- shelf play: the shelves are part of your arsenal ----
  perk({ id: 'spinebreaker', icon: '💥', short: 'Spine Breaker', name: 'Spine Breaker', desc: 'Books that hit a shelf or wall burst, hurting everything nearby', max: 3, weight: 7, apply: (s) => { s.shelfBurst = s.shelfBurst ? s.shelfBurst + 15 : 55; } }),
  perk({ id: 'readingnook', icon: '🛋️', short: 'Nook', name: 'Reading Nook', desc: '+40% throw rate while standing next to a shelf', max: 3, weight: 6, apply: (s) => { s.nook += 0.4; } }),
  perk({ id: 'interlibrary', icon: '🔁', short: 'Loan', name: 'Interlibrary Loan', desc: 'Books leaving the library come back through the opposite wall', max: 3, weight: 5, apply: (s) => { s.wraps += 1; } }),

  // ---- v1.15.0 part B: angles, nerve, a cat ----
  perk({ id: 'margin', icon: '↗️', short: 'Margin Notes', name: 'Margin Notes', desc: 'Extra books fly off at an angle', max: 3, weight: 5, apply: (s) => { s.marginLvl += 1; } }),
  perk({ id: 'lastchapter', icon: '📉', short: 'Last Chapter', name: 'Last Chapter', desc: 'More damage for every heart you are missing', max: 3, weight: 5, apply: (s) => { s.lastChapter = s.lastChapter ? s.lastChapter + 0.1 : 0.2; } }),
  perk({ id: 'librarycat', icon: '🐈', short: 'Library Cat', name: 'Library Cat', desc: 'A cat pounces on enemies', max: 3, weight: 5, apply: (s) => { s.catLvl += 1; } }),
  // ---- status perks (v1.15.0): ink, cold and static; they meet each other in the combos below ----
  perk({ id: 'leakypen', icon: '🖊️', short: 'Leaky Pen', name: 'Leaky Pen', desc: 'Hits soak enemies in ink', max: 3, weight: 5, apply: (s) => { s.ink = !s.ink ? 0.8 : s.ink < 0.85 ? 0.85 : 1; s.inkDur = s.ink >= 1 ? 3 : 2; } }),
  perk({ id: 'coldstorage', icon: '❄️', short: 'Cold Storage', name: 'Cold Storage', desc: 'Hits slow enemies', max: 3, weight: 5, apply: (s) => { s.chill = !s.chill ? 0.3 : s.chill < 0.33 ? 0.35 : 0.4; } }),
  perk({ id: 'static', icon: '🔌', short: 'Static Cling', name: 'Static Cling', desc: 'Hits sometimes zap a nearby enemy', max: 3, weight: 5, apply: (s) => { s.staticChance = [0.45, 0.5, 0.55][Math.min(2, s.staticLvl)]; s.staticLvl++; s.staticJumps = s.staticLvl >= 3 ? 2 : 0; } }),
  perk({ id: 'popup', icon: '🎉', short: 'Pop-up Book', name: 'Pop-up Book', desc: 'Defeated enemies pop, hurting enemies nearby', max: 3, weight: 5, apply: (s) => { s.popLvl = Math.min(3, s.popLvl + 1); s.popRadius = POP_RADIUS[s.popLvl]; s.popMult = POP_MULT[s.popLvl]; } }),

  // ---- cursed books: big upside, real cost ----
  cursed({ id: 'bannedbook', icon: '💀', short: 'Banned Book', name: 'Banned Book', desc: '+100% book damage, books pierce 1 enemy. −1 max heart.', apply: (s, p) => { s.damage += 1; s.pierce += 1; s.maxHp = Math.max(1, s.maxHp - 1); if (p) p.hp = Math.min(p.hp, s.maxHp); } }),
  cursed({ id: 'loudreader', icon: '📢', short: 'Loud Reader', name: 'Loud Reader', desc: 'SHHH! recharges 3× faster, is 50% bigger and stuns longer. Enemies move 15% faster.', apply: (s) => { s.shhhCd /= 3; s.shhhRadius *= 1.5; s.shhhStun *= 1.5; s.enemySpeedMult *= 1.15; } }),
  cursed({ id: 'lightsout', icon: '🕯️', short: 'Lights Out', name: 'Lights Out', desc: '+50% fines and score. Your lantern shrinks to half.', needsLights: true, apply: (s) => { s.scoreMult *= 1.5; s.fineMult *= 1.5; s.lanternScale *= 0.5; } }),

  // ---- Collected Works: own both perks to unlock ----
  combo({ id: 'cyoa', icon: '🗺️', short: 'Adventure', name: 'Choose Your Own Adventure', requires: ['bookmark', 'dewey'], desc: 'Every ricochet turns toward the nearest enemy. +1 bounce.', apply: (s) => { s.retarget = true; s.bounces += 1; } }),
  combo({ id: 'unreliable', icon: '🎭', short: 'Narrator', name: 'Unreliable Narrator', requires: ['plottwist', 'trilogy'], desc: 'A book that pierces an enemy splits into two.', apply: (s) => { s.splitOnPierce = true; } }),
  combo({ id: 'silentreading', icon: '📖', short: 'Silent Read', name: 'Silent Reading', requires: ['quietplease', 'audiobook'], desc: 'SHHH! flings a ring of piercing books outward.', apply: (s) => { s.shhhVolley = 10; } }),
  combo({ id: 'allnighter', icon: '🌙', short: 'All-Nighter', name: 'All-Nighter', requires: ['coffee', 'graceperiod'], desc: 'Dashing through enemies hits them for 3× damage. −20% dash cooldown.', apply: (s) => { s.dashDamage = 3; s.dashCd *= 0.8; } }),
  combo({ id: 'annotated', icon: '🖋️', short: 'Annotated', name: 'Annotated Edition', requires: ['footnotes', 'hardcover'], desc: 'Critical hits burst, hurting everything nearby.', apply: (s) => { s.critBurst = 60; } }),
  combo({ id: 'collapsing', icon: '🏚️', short: 'Collapsing', name: 'Collapsing Stacks', requires: ['spinebreaker', 'bookmark'], desc: 'Every ricochet also bursts. Bounce your way through a crowd.', apply: (s) => { s.bounceBurst = true; s.bounces += 1; } }),

  combo({ id: 'crossfire', icon: '✖️', short: 'Crossfire', name: 'Crossfire', requires: ['margin', 'spinebreaker'], desc: 'Margin Notes books burst 50% bigger on shelves.', apply: (s) => { s.crossfire = true; } }),
  combo({ id: 'brittle', icon: '💔', short: 'Brittle', name: 'Brittle Pages', requires: ['leakypen', 'coldstorage'], desc: 'Inked and slowed enemies shatter at 20% health. Bosses take 25% more damage instead.', apply: (s) => { s.brittle = true; } }),
  combo({ id: 'conductive', icon: '🔋', short: 'Conductive', name: 'Conductive Ink', requires: ['static', 'leakypen'], desc: 'Zaps seek out inked enemies and spread ink.', apply: (s) => { s.conductive = true; } }),
  combo({ id: 'superconductor', icon: '🥶', short: 'Superconduct', name: 'Superconductor', requires: ['coldstorage', 'static'], desc: 'Zaps freeze slowed enemies for 0.5s. Bosses are immune.', apply: (s) => { s.superconductor = true; } }),
  combo({ id: 'inkbombs', icon: '💣', short: 'Ink Bombs', name: 'Ink Bombs', requires: ['popup', 'leakypen'], desc: 'Pops spread ink onto everything they hit.', apply: (s) => { s.inkBombs = true; } }),

  // ---- Masterworks: take a perk to 3/3 to unlock its outsized finale ----
  master('hardcover', { id: 'm_tome', icon: '📜', short: 'Tome', name: 'Leather-Bound Tome', desc: 'Every 5th throw is a giant tome: 5× damage, pierces everything.', apply: (s) => { s.tomeEvery = 5; } }),
  master('speedreader', { id: 'm_zone', icon: '🔥', short: 'In the Zone', name: 'In the Zone', desc: 'After 2s of nonstop throwing, your throw rate doubles.', apply: (s) => { s.zone = true; } }),
  master('trilogy', { id: 'm_saga', icon: '🏛️', short: 'Saga', name: 'Complete Saga', desc: 'Every 3rd throw adds a fan of 7 books.', apply: (s) => { s.sagaEvery = 3; } }),
  master('bookmark', { id: 'm_infinite', icon: '♾️', short: 'Infinite', name: 'Infinite Bookmark', desc: '+3 bounces, and books speed up 15% with every bounce.', apply: (s) => { s.bounces += 3; s.bounceAccel = 0.15; } }),
  master('plottwist', { id: 'm_twist', icon: '🎬', short: 'Twist End', name: 'Twist Ending', desc: 'Books pierce through everything.', apply: (s) => { s.pierce = 99; } }),
  master('dewey', { id: 'm_congress', icon: '🔭', short: 'Congress', name: 'Library of Congress', desc: 'Near-perfect homing, and books fly twice as far.', apply: (s) => { s.homing = Math.max(s.homing, 14); s.homingRange = Math.max(s.homingRange, 420); s.bookLife *= 2; } }),
  master('coffee', { id: 'm_caffeine', icon: '🥤', short: 'Caffeine', name: 'Caffeine Overdose', desc: 'Two dash charges.', apply: (s) => { s.dashCharges = 2; } }),
  master('extendedloan', { id: 'm_lifetime', icon: '💳', short: 'Lifetime', name: 'Lifetime Membership', desc: 'Heal 1 heart every time you clear a wave.', apply: (s) => { s.regenPerWave = 1; } }),
  master('quietplease', { id: 'm_silence', icon: '🔇', short: 'Silence', name: 'Absolute Silence', desc: 'SHHH! freezes every enemy in the library for 2.5s.', apply: (s) => { s.shhhGlobal = true; } }),
  master('footnotes', { id: 'm_biblio', icon: '📑', short: 'Biblio', name: 'Bibliography', desc: 'Critical hits deal 5× damage instead of 2.5×.', apply: (s) => { s.critMult = 5; } }),
  master('audiobook', { id: 'm_surround', icon: '🔊', short: 'Surround', name: 'Surround Sound', desc: 'Double the orbit. Each book blocks a page, then rests 2.5s.', apply: (s) => { s.orbiters *= 2; s.orbitPulse = true; } }),
  master('graceperiod', { id: 'm_amnesty', icon: '🛡️', short: 'Amnesty', name: 'Amnesty', desc: 'Once per wave, a hit that would kill you is forgiven.', apply: (s) => { s.amnesty = true; } }),
  master('spinebreaker', { id: 'm_demolition', icon: '🧨', short: 'Demolition', name: 'Demolition Crew', desc: 'Shelf bursts are twice as big and hit 3× harder.', apply: (s) => { s.shelfBurst *= 2; s.burstMult = 3; } }),
  master('readingnook', { id: 'm_fortress', icon: '🏰', short: 'Fortress', name: 'Fortress of Solitude', desc: 'Next to a shelf you also deal double damage.', apply: (s) => { s.nookDamage = 1; } }),
  master('interlibrary', { id: 'm_interdim', icon: '🌌', short: 'Interdim.', name: 'Interdimensional Loan', desc: 'Looped books home in once and hit twice as hard.', apply: (s) => { s.wrapHoming = true; } }),
  master('margin', { id: 'm_compass', icon: '🌐', short: 'Compass Rose', name: 'Compass Rose', desc: 'Every 3rd throw fires books in 8 directions.', apply: (s) => { s.compass = true; } }),
  master('lastchapter', { id: 'm_cliffhanger', icon: '🎞️', short: 'Cliffhanger', name: 'Cliffhanger', desc: 'At 1 heart, you throw 50% faster.', apply: (s) => { s.cliffhanger = true; } }),
  master('librarycat', { id: 'm_colony', icon: '🐾', short: 'Stray Colony', name: 'Stray Colony', desc: 'A second cat joins, and pounces stun.', apply: (s) => { s.colony = true; } }),
  master('leakypen', { id: 'm_indelible', icon: '✒️', short: 'Indelible', name: 'Indelible', desc: 'Inked enemies that die splash ink on everything nearby.', apply: (s) => { s.indelible = true; } }),
  master('coldstorage', { id: 'm_deepfreeze', icon: '🧊', short: 'Deep Freeze', name: 'Deep Freeze', desc: 'Every 5th hit on a slowed enemy freezes it for 1s. Bosses are immune.', apply: (s) => { s.deepFreeze = true; } }),
  master('static', { id: 'm_powergrid', icon: '🏭', short: 'Power Grid', name: 'Power Grid', desc: 'Zaps jump 3 times at 75% damage.', apply: (s) => { s.staticJumps = 3; s.staticDmg = 0.75; } }),
  master('popup', { id: 'm_finale', icon: '🎆', short: 'Finale', name: 'Grand Finale', desc: 'Pops can set off more pops (one extra round).', apply: (s) => { s.finale = true; } }),
];

/** Every id added in 1.15.0 (new perks, Masterworks, combos): these get the NEW badge. One array, so a release only edits here. */
export const NEW_IN_1_15 = ['leakypen', 'coldstorage', 'static', 'popup', 'margin', 'lastchapter', 'librarycat',
  'm_indelible', 'm_deepfreeze', 'm_powergrid', 'm_finale', 'm_compass', 'm_cliffhanger', 'm_colony',
  'brittle', 'conductive', 'superconductor', 'inkbombs', 'crossfire'];

// What a card changes, in player words: multipliers, plain-word tiers, counts and seconds
// (no internal units like px or rad/s).
const BASE = baseStats();
const times = (k) => (v) => `×${+(v / BASE[k]).toFixed(2)}`;
const secs = (v) => `${+v.toFixed(1)}s`;
const tier = (cuts, words) => (v) => words[cuts.findIndex((c) => v <= c) === -1 ? words.length - 1 : cuts.findIndex((c) => v <= c)];
const PREVIEW = [
  ['maxHp', 'Max hearts', (v) => v],
  ['damage', 'Damage', times('damage')],
  ['fireRate', 'Throw speed', times('fireRate')],
  ['projectiles', 'Books per throw', (v) => v],
  ['bounces', 'Bounces', (v) => v],
  ['pierce', 'Enemies pierced', (v) => (v >= 99 ? 'all' : v)],
  ['homing', 'Homing', tier([0, 2.4, 4.8, 7.2], ['none', 'gentle', 'strong', 'relentless', 'perfect'])],
  ['critChance', 'Crit chance', (v) => `${Math.round(v * 100)}%`],
  ['critMult', 'Crit damage', (v) => `×${v}`],
  ['speed', 'Move speed', times('speed')],
  ['dashCd', 'Dash recharge', secs],
  ['dashCharges', 'Dash charges', (v) => v],
  ['shhhCd', 'SHHH! recharge', secs],
  ['shhhRadius', 'SHHH! size', times('shhhRadius')],
  ['orbiters', 'Orbiting books', (v) => v],
  ['iframes', 'Safe time after a hit', secs],
  ['shelfBurst', 'Burst size', tier([0, 55, 70, 85], ['none', 'small', 'medium', 'large', 'huge'])],
  ['nook', 'Throw speed near shelves', (v) => `+${Math.round(v * 100)}%`],
  ['wraps', 'Trips through the walls', (v) => v],
  ['scoreMult', 'Score', (v) => `×${v}`],
];
export function previewChange(u, stats, player) {
  const s = { ...stats }, p = player ? { ...player } : null;
  u.apply(s, p);
  const lines = [];
  for (const [k, label, fmt] of PREVIEW) {
    if (s[k] === stats[k]) continue;
    const from = fmt(stats[k]), to = fmt(s[k]);
    if (from !== to) lines.push(`${label} ${from} → ${to}`);
  }
  if (p && player && p.hp !== player.hp && s.maxHp === stats.maxHp) lines.push(`Hearts ${player.hp} → ${p.hp}`);
  if (p && player && s.maxHp !== stats.maxHp) lines.push(`Hearts ${player.hp}/${stats.maxHp} → ${p.hp}/${s.maxHp}`);
  return lines;
}

// "Just the gain": one short line per change, in player words (option B on the perk card).
const pct = (x) => `${Math.round(x * 100)}%`;
const GAIN = [
  ['maxHp', (a, b) => (b > a ? `+${b - a} max heart${b - a > 1 ? 's' : ''}` : `−${a - b} max heart`)],
  ['damage', (a, b) => `${b > a ? '+' : '−'}${pct(Math.abs(b - a) / BASE.damage)} damage`],
  ['fireRate', (a, b) => `+${pct(b / a - 1)} throw speed`],
  ['projectiles', (a, b) => `+${b - a} book per throw`],
  ['bounces', (a, b) => `+${b - a} bounce${b - a > 1 ? 's' : ''}`],
  ['pierce', (a, b) => (b >= 99 ? 'Books pierce everything' : `Pierce +${b - a} enemy`)],
  ['homing', (a, b) => (a === 0 ? 'Books home in on enemies. Homing stops once a book comes back through a wall' : b > 10 ? 'Perfect homing' : 'Stronger homing, longer reach')],
  ['critChance', (a, b) => `+${pct(b - a)} crit chance`],
  ['critMult', (a, b) => `Crits hit ×${b}`],
  ['speed', (a, b) => `+${pct(b / a - 1)} move speed`],
  ['dashCd', (a, b) => `−${pct(1 - b / a)} dash cooldown`],
  ['dashCharges', (a, b) => `+${b - a} dash charge`],
  ['shhhCd', (a, b) => (a / b >= 2 ? `SHHH! recharges ${+(a / b).toFixed(1)}× faster` : `−${pct(1 - b / a)} SHHH! cooldown`)],
  ['shhhRadius', (a, b) => `+${pct(b / a - 1)} SHHH! size`],
  ['orbiters', (a, b) => (a > 0 && b === a * 2 ? 'Doubles your orbiting books' : `+${b - a} orbiting book${b - a > 1 ? 's' : ''}`)],
  ['iframes', (a, b) => `+${+(b - a).toFixed(1)}s safety after a hit`],
  ['shelfBurst', (a, b) => (a === 0 ? 'Books burst when they hit shelves' : 'Bigger shelf bursts')],
  ['nook', (a, b) => `+${pct(b - a)} throw speed next to shelves`],
  ['wraps', (a, b) => (a === 0 ? 'Books come back through the walls' : `+${b - a} trip through the walls`)],
  ['marginLvl', (a, b) => (b === 1 ? '+2 books thrown diagonally' : b === 2 ? '+1 book thrown behind you' : '+2 more diagonal books')],
  ['lastChapter', (a, b) => `+${pct(b)} damage per missing heart (up to 3)`],
  ['catLvl', (a, b) => (b === 1 ? 'A cat pounces on enemies for 2× damage every 1.6 seconds' : b === 2 ? 'Pounces 30% more often and hit 50% harder' : 'Pounces hit everything nearby')],
  ['ink', (a, b) => (a === 0 ? `Hits soak enemies in ink: +${pct(b)} damage over 2s` : `Ink deals +${pct(b)} of a hit over ${b >= 1 ? 3 : 2}s`)],
  ['chill', (a, b) => (a === 0 ? `Hits slow enemies ${pct(b)}` : `Slows enemies ${pct(b)}`)],
  ['staticChance', (a, b) => (a === 0 ? `${pct(b)} of hits zap a nearby enemy` : `${pct(b)} of hits zap`)],
  ['staticJumps', (a, b) => `Zaps jump ${b} times`],
  ['popRadius', (a, b) => (a === 0 ? 'Defeated enemies pop, hurting enemies nearby' : 'Bigger pops')],
  ['popMult', (a, b) => (a === 0 ? '' : 'Pops hit twice as hard')],
  ['scoreMult', (a, b) => `+${pct(b / a - 1)} score`],
  ['fineMult', (a, b) => `+${pct(b / a - 1)} fines`],
  ['shhhStun', (a, b) => `+${pct(b / a - 1)} SHHH! stun time`],
  ['enemySpeedMult', (a, b) => `Enemies ${pct(b / a - 1)} faster`],
  ['lanternScale', (a, b) => 'Your lantern shrinks to half'],
];
export function gainText(u, stats, player) {
  const s = { ...stats }, p = player ? { ...player } : null;
  u.apply(s, p);
  const out = [];
  for (const [k, fmt] of GAIN) if (s[k] !== stats[k]) { const t = fmt(stats[k], s[k]); if (t) out.push(t); }
  const healed = p && player ? p.hp - player.hp - Math.max(0, s.maxHp - stats.maxHp) : 0;
  if (p && player && p.hp > player.hp && s.maxHp === stats.maxHp) out.push(`Heals ${p.hp - player.hp}`);
  else if (healed > 0) out.push(`heals ${healed}`);
  return out;
}

/** Combos this card would complete, given what you already own. */
export function comboHints(u, owned = {}) {
  if (u.kind !== 'perk') return [];
  return UPGRADES.filter((c) => c.kind === 'combo' && !owned[c.id] && c.requires.includes(u.id) && !owned[u.id])
    .map((c) => ({ combo: c, partner: byId(c.requires.find((r) => r !== u.id)), ready: c.requires.every((r) => r === u.id || owned[r]) }))
    .filter((h) => h.ready);
}

/**
 * Every combo this perk belongs to that you haven't taken yet, with its partner and whether you own the
 * partner already (then taking this card unlocks the combo).
 */
export function comboPartners(u, owned = {}) {
  if (u.kind !== 'perk') return [];
  return UPGRADES.filter((c) => c.kind === 'combo' && !owned[c.id] && c.requires.includes(u.id))
    .map((c) => { const partner = byId(c.requires.find((r) => r !== u.id)); return { combo: c, partner, partnerOwned: !!owned[partner.id] }; })
    .sort((a, b) => b.partnerOwned - a.partnerOwned);
}

/** Combos you're half-way to: one of the two perks owned, combo not taken. For the pause screen. */
export function combosInReach(owned = {}) {
  return UPGRADES.filter((c) => c.kind === 'combo' && !owned[c.id])
    .map((c) => ({ combo: c, have: c.requires.filter((r) => owned[r]).map(byId), need: c.requires.filter((r) => !owned[r]).map(byId) }))
    .filter((x) => x.have.length > 0)
    .sort((a, b) => a.need.length - b.need.length);
}

/**
 * "Your build" chips: one per owned upgrade (master, combo, perk, cursed). `linked` = this perk forms a
 * not-yet-owned combo with a perk in `offered` (the cards on screen), so the strip can point at it.
 */
export function buildChips(owned = {}, offered = []) {
  const order = { master: 0, combo: 1, perk: 2, cursed: 3 };
  const offeredPerks = offered.filter((o) => o.kind === 'perk');
  return Object.entries(owned).map(([id, lvl]) => ({ u: byId(id), lvl })).filter((o) => o.u)
    .sort((a, b) => order[a.u.kind] - order[b.u.kind])
    .map(({ u, lvl }) => ({
      id: u.id, icon: u.icon, short: u.short, name: u.name, kind: u.kind, lvl, max: u.max,
      linked: u.kind === 'perk' && offeredPerks.some((o) => o.id !== u.id
        && comboPartners(o, owned).some((x) => x.partner.id === u.id)),
    }));
}

/** Level pips for a card: ●●○ */
export const pips = (lvl, max) => '●'.repeat(lvl) + '○'.repeat(Math.max(0, max - lvl));

export const byId = (id) => UPGRADES.find((u) => u.id === id);

/** Combo cards whose two required perks are owned and which aren't taken yet. */
export function unlockedCombos(owned = {}) {
  return UPGRADES.filter((u) => u.kind === 'combo' && !owned[u.id] && u.requires.every((r) => owned[r]));
}

/** Masterworks whose perk is at max level and which aren't taken yet. */
export function unlockedMasterworks(owned = {}) {
  return UPGRADES.filter((u) => u.kind === 'master' && !owned[u.id] && (owned[u.requires[0]] || 0) >= byId(u.requires[0]).max);
}

/** The Masterwork a perk leads to (or undefined). */
export const masterworkFor = (perkId) => UPGRADES.find((u) => u.kind === 'master' && u.requires[0] === perkId);

/** Slightly favour a perk that completes a combo with one you already own, so pairs land in a 15-20 pick run. */
export const PARTNER_BIAS = 1.3;
export function partnerBias(u, owned = {}) {
  if (u.kind !== 'perk') return 1;
  const hit = UPGRADES.some((c) => c.kind === 'combo' && !owned[c.id] && c.requires.includes(u.id)
    && c.requires.some((r) => r !== u.id && owned[r]));
  return hit ? PARTNER_BIAS : 1;
}

/**
 * Draw `n` distinct perks. An unlocked combo always takes the first slot;
 * the rest are weighted by rarity. `ctx.lights` = whether dynamic lighting is on.
 */
export function rollUpgrades(rng, owned = {}, n = 3, ctx = {}) {
  const out = [];
  const banned = ctx.banned || new Set(), exclude = ctx.exclude || new Set();
  const specials = [...unlockedMasterworks(owned), ...unlockedCombos(owned)].filter((u) => !exclude.has(u.id));
  if (specials.length && !ctx.noSpecial) out.push(rng.pick(specials));
  const pool = UPGRADES.filter((u) => u.kind !== 'combo' && u.kind !== 'master' && (owned[u.id] || 0) < u.max
    && !(u.needsLights && ctx.lights === false) && !banned.has(u.id) && !exclude.has(u.id));
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool.map((u) => ({ u, w: u.weight * partnerBias(u, owned) })), 'w').u;
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

// ---- v1.11.0: teach perks as players progress (pure helpers; main.js only renders them) ----

/** Why a Masterwork / Collected Work card is on offer ("because 📕 Hardcover hit 3/3"). '' for normal cards. */
export function specialReason(u, owned = {}) {
  const tag = (x) => `${x.icon} ${x.short}`;
  if (u.kind === 'master') return `because ${tag(byId(u.requires[0]))} hit ${byId(u.requires[0]).max}/${byId(u.requires[0]).max}`;
  if (u.kind === 'combo') return `because you own ${u.requires.map((r) => tag(byId(r))).join(' + ')}`;
  return '';
}

/**
 * Level text for a perk card. `from` pips are shown only when you already own the perk ("●●○ → ●●●").
 * `mw`: 'near' = this pick makes 2/3 (name and effect stay hidden), 'finale' = this pick makes 3/3 (name shown).
 */
export function levelInfo(u, owned = {}) {
  if (u.kind === 'combo') return { pips: 'Collected Work', mw: null, mwText: '' };
  if (u.kind === 'master') return { pips: 'Masterwork', mw: null, mwText: '' };
  if (!(u.max > 1)) return { pips: 'One-time', mw: null, mwText: '' };
  const cur = owned[u.id] || 0, next = cur + 1;
  const text = cur > 0 ? `${pips(cur, u.max)} → ${pips(next, u.max)}` : pips(next, u.max);
  const m = u.kind === 'perk' ? masterworkFor(u.id) : null;
  if (m && next === u.max) return { pips: text, mw: 'finale', mwText: `Unlocks ${m.name}` };
  if (m && next === u.max - 1) return { pips: text, mw: 'near', mwText: 'Next level unlocks a Masterwork 🔒' };
  return { pips: text, mw: null, mwText: '' };
}

export const TIPS = {
  'perk-stack': 'Perks stack to ●●●. Max one to unlock its Masterwork (a max-level bonus).',
  'special-unlocked': 'Unlocked cards always take the first slot until you pick them.',
  'combo-pair': 'Two perks that pair unlock a Collected Work (a perk combo).',
  'masterwork-near': "One more level and this perk's Masterwork joins the deck.",
  codex: '📚 Added to your Library Codex (title screen)',
};
const TIP_ORDER = ['perk-stack', 'special-unlocked', 'combo-pair', 'masterwork-near'];

/** Saved tips: `{ seen: [ids] }`. Missing or damaged saves read as "nothing seen yet". */
export function normalizeTips(raw) {
  const seen = raw && Array.isArray(raw.seen) ? raw.seen.filter((id) => typeof id === 'string') : [];
  return { seen: [...new Set(seen)] };
}

/** The one tip to show above these cards (or null): the first applicable one the player hasn't seen yet. */
export function perkTip(cards, owned = {}, seen = []) {
  const has = {
    'perk-stack': true,
    'special-unlocked': cards.some((u) => u.kind === 'master' || u.kind === 'combo'),
    'combo-pair': cards.some((u) => comboPartners(u, owned).some((x) => x.partnerOwned)),
    'masterwork-near': cards.some((u) => levelInfo(u, owned).mw === 'near'),
  };
  const id = TIP_ORDER.find((t) => has[t] && !seen.includes(t));
  return id ? { id, text: TIPS[id] } : null;
}
