// Perks offered between waves. Pure data + a seeded roller (no DOM), so it is unit-tested.
//
// Kinds:
//   perk    — normal, stackable up to `max`
//   cursed  — a trade-off: a big upside with a real cost (max 1, rarer)
//   combo   — a "Collected Works" card that unlocks once you own BOTH perks in `requires`
//   master  — a "Masterwork": one per perk, unlocked by taking that perk to 3/3. Outsized power.
// Unlocked combos and Masterworks ("specials") always take the first card slot until taken.

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
    scoreMult: 1, lanternScale: 1, enemySpeedMult: 1,
    // masterworks
    tomeEvery: 0, zone: false, sagaEvery: 0, bounceAccel: 0, bookLife: 1.3, dashCharges: 1,
    regenPerWave: 0, shhhGlobal: false, critMult: 2.5, orbitPulse: false, amnesty: false,
    burstMult: 1, nookDamage: 0, wrapHoming: false,
  };
}

const perk = (o) => ({ kind: 'perk', weight: 7, ...o });
const cursed = (o) => ({ kind: 'cursed', max: 1, weight: 3, ...o });
const combo = (o) => ({ kind: 'combo', max: 1, weight: 0, ...o });
const master = (perkId, o) => ({ kind: 'master', max: 1, weight: 0, requires: [perkId], ...o });

export const UPGRADES = [
  // ---- core (rebalanced: no single card should carry a run) ----
  perk({ id: 'hardcover', icon: '📕', name: 'Hardcover Edition', desc: '+50% book damage', max: 3, weight: 9, apply: (s) => { s.damage += 0.5; } }),
  perk({ id: 'speedreader', icon: '⚡', name: 'Speed Reader', desc: '+20% throw rate', max: 3, weight: 9, apply: (s) => { s.fireRate *= 1.2; } }),
  perk({ id: 'trilogy', icon: '📚', name: 'Trilogy Box Set', desc: '+1 book per throw', max: 3, weight: 6, apply: (s) => { s.projectiles += 1; s.spread = Math.max(0.14, s.spread * 0.9); } }),
  perk({ id: 'bookmark', icon: '🔖', name: 'Bouncy Bookmark', desc: 'Books ricochet off shelves & walls (+1 bounce)', max: 3, apply: (s) => { s.bounces += 1; } }),
  perk({ id: 'plottwist', icon: '🌀', name: 'Plot Twist', desc: 'Books pierce through +1 enemy', max: 3, apply: (s) => { s.pierce += 1; } }),
  perk({ id: 'dewey', icon: '🧭', name: 'Dewey Decimal Guidance', desc: 'Books home in on enemies. Each level turns harder and reaches further.', max: 3, weight: 6, apply: (s) => { s.homing += 2.4; s.homingRange = s.homingRange ? s.homingRange + 80 : 240; } }),
  perk({ id: 'coffee', icon: '☕', name: 'Double Espresso', desc: '+12% move speed, −15% dash cooldown', max: 3, weight: 8, apply: (s) => { s.speed *= 1.12; s.dashCd *= 0.85; } }),
  perk({ id: 'extendedloan', icon: '❤️', name: 'Extended Loan', desc: '+1 max heart and fully heal', max: 3, apply: (s, p) => { s.maxHp += 1; if (p) p.hp = s.maxHp; } }),
  perk({ id: 'quietplease', icon: '🤫', name: 'Quiet Please', desc: 'SHHH! recharges 25% faster and reaches 20% further', max: 3, weight: 6, apply: (s) => { s.shhhCd *= 0.75; s.shhhRadius *= 1.2; } }),
  perk({ id: 'footnotes', icon: '✳️', name: 'Footnotes', desc: '+12% chance to crit for 2.5× damage', max: 3, apply: (s) => { s.critChance += 0.12; } }),
  perk({ id: 'audiobook', icon: '🎧', name: 'Audiobook Orbit', desc: '+1 book orbits you, smacking enemies', max: 3, weight: 5, apply: (s) => { s.orbiters += 1; } }),
  perk({ id: 'graceperiod', icon: '🕊️', name: 'Grace Period', desc: 'Heal 1 heart; +0.3s invulnerability after a hit', max: 3, weight: 6, apply: (s, p) => { s.iframes += 0.3; if (p) p.hp = Math.min(s.maxHp, p.hp + 1); } }),

  // ---- shelf play: the shelves are part of your arsenal ----
  perk({ id: 'spinebreaker', icon: '💥', name: 'Spine Breaker', desc: 'Books that hit a shelf or wall burst, hurting everything nearby', max: 3, weight: 7, apply: (s) => { s.shelfBurst = s.shelfBurst ? s.shelfBurst + 15 : 55; } }),
  perk({ id: 'readingnook', icon: '🛋️', name: 'Reading Nook', desc: '+40% throw rate while standing next to a shelf', max: 3, weight: 6, apply: (s) => { s.nook += 0.4; } }),
  perk({ id: 'interlibrary', icon: '🔁', name: 'Interlibrary Loan', desc: 'Books leaving the library come back through the opposite wall', max: 3, weight: 5, apply: (s) => { s.wraps += 1; } }),

  // ---- cursed books: big upside, real cost ----
  cursed({ id: 'bannedbook', icon: '💀', name: 'Banned Book', desc: '+100% book damage. −1 max heart.', apply: (s, p) => { s.damage += 1; s.maxHp = Math.max(1, s.maxHp - 1); if (p) p.hp = Math.min(p.hp, s.maxHp); } }),
  cursed({ id: 'loudreader', icon: '📢', name: 'Loud Reader', desc: 'SHHH! recharges 3× faster. Enemies move 15% faster.', apply: (s) => { s.shhhCd /= 3; s.enemySpeedMult *= 1.15; } }),
  cursed({ id: 'lightsout', icon: '🕯️', name: 'Lights Out', desc: '+50% score. Your lantern shrinks to half.', needsLights: true, apply: (s) => { s.scoreMult *= 1.5; s.lanternScale *= 0.5; } }),

  // ---- Collected Works: own both perks to unlock ----
  combo({ id: 'cyoa', icon: '🗺️', name: 'Choose Your Own Adventure', requires: ['bookmark', 'dewey'], desc: 'Every ricochet turns toward the nearest enemy. +1 bounce.', apply: (s) => { s.retarget = true; s.bounces += 1; } }),
  combo({ id: 'unreliable', icon: '🎭', name: 'Unreliable Narrator', requires: ['plottwist', 'trilogy'], desc: 'A book that pierces an enemy splits into two.', apply: (s) => { s.splitOnPierce = true; } }),
  combo({ id: 'silentreading', icon: '📖', name: 'Silent Reading', requires: ['quietplease', 'audiobook'], desc: 'SHHH! flings a ring of piercing books outward.', apply: (s) => { s.shhhVolley = 10; } }),
  combo({ id: 'allnighter', icon: '🌙', name: 'All-Nighter', requires: ['coffee', 'graceperiod'], desc: 'Dashing through enemies hits them for 3× damage. −20% dash cooldown.', apply: (s) => { s.dashDamage = 3; s.dashCd *= 0.8; } }),
  combo({ id: 'annotated', icon: '🖋️', name: 'Annotated Edition', requires: ['footnotes', 'hardcover'], desc: 'Critical hits splash ink on everything nearby.', apply: (s) => { s.critBurst = 60; } }),
  combo({ id: 'collapsing', icon: '🏚️', name: 'Collapsing Stacks', requires: ['spinebreaker', 'bookmark'], desc: 'Every ricochet also bursts. Bounce your way through a crowd.', apply: (s) => { s.bounceBurst = true; s.bounces += 1; } }),

  // ---- Masterworks: take a perk to 3/3 to unlock its outsized finale ----
  master('hardcover', { id: 'm_tome', icon: '📜', name: 'Leather-Bound Tome', desc: 'Every 5th throw is a giant tome: 5× damage, pierces everything.', apply: (s) => { s.tomeEvery = 5; } }),
  master('speedreader', { id: 'm_zone', icon: '🔥', name: 'In the Zone', desc: 'After 2s of nonstop throwing, your throw rate doubles.', apply: (s) => { s.zone = true; } }),
  master('trilogy', { id: 'm_saga', icon: '🏛️', name: 'Complete Saga', desc: 'Every 3rd throw adds a fan of 7 books.', apply: (s) => { s.sagaEvery = 3; } }),
  master('bookmark', { id: 'm_infinite', icon: '♾️', name: 'Infinite Bookmark', desc: '+3 bounces, and books speed up 15% with every bounce.', apply: (s) => { s.bounces += 3; s.bounceAccel = 0.15; } }),
  master('plottwist', { id: 'm_twist', icon: '🎬', name: 'Twist Ending', desc: 'Books pierce through everything.', apply: (s) => { s.pierce = 99; } }),
  master('dewey', { id: 'm_congress', icon: '🏛', name: 'Library of Congress', desc: 'Near-perfect homing, and books fly twice as far.', apply: (s) => { s.homing = Math.max(s.homing, 14); s.homingRange = Math.max(s.homingRange, 420); s.bookLife *= 2; } }),
  master('coffee', { id: 'm_caffeine', icon: '⚡', name: 'Caffeine Overdose', desc: 'Two dash charges.', apply: (s) => { s.dashCharges = 2; } }),
  master('extendedloan', { id: 'm_lifetime', icon: '💳', name: 'Lifetime Membership', desc: 'Heal 1 heart every time you clear a wave.', apply: (s) => { s.regenPerWave = 1; } }),
  master('quietplease', { id: 'm_silence', icon: '🔇', name: 'Absolute Silence', desc: 'SHHH! freezes every enemy in the library for 2.5s.', apply: (s) => { s.shhhGlobal = true; } }),
  master('footnotes', { id: 'm_biblio', icon: '📑', name: 'Bibliography', desc: 'Critical hits deal 5× damage instead of 2.5×.', apply: (s) => { s.critMult = 5; } }),
  master('audiobook', { id: 'm_surround', icon: '🔊', name: 'Surround Sound', desc: 'Double your orbiting books; their orbit pulses outward.', apply: (s) => { s.orbiters *= 2; s.orbitPulse = true; } }),
  master('graceperiod', { id: 'm_amnesty', icon: '🛡️', name: 'Amnesty', desc: 'Once per wave, a hit that would kill you is forgiven.', apply: (s) => { s.amnesty = true; } }),
  master('spinebreaker', { id: 'm_demolition', icon: '🧨', name: 'Demolition Crew', desc: 'Shelf bursts are twice as big and hit 3× harder.', apply: (s) => { s.shelfBurst *= 2; s.burstMult = 3; } }),
  master('readingnook', { id: 'm_fortress', icon: '🏰', name: 'Fortress of Solitude', desc: 'Next to a shelf you also deal double damage.', apply: (s) => { s.nookDamage = 1; } }),
  master('interlibrary', { id: 'm_interdim', icon: '🌌', name: 'Interdimensional Loan', desc: 'Books that come back through a wall home in and hit twice as hard.', apply: (s) => { s.wrapHoming = true; } }),
];

// What a card changes, as "label: before → after" lines (shown on perk cards).
const PREVIEW = [
  ['maxHp', 'Max hearts', (v) => v],
  ['damage', 'Damage', (v) => `${Math.round(v * 100)}%`],
  ['fireRate', 'Throws/sec', (v) => v.toFixed(1)],
  ['projectiles', 'Books per throw', (v) => v],
  ['bounces', 'Bounces', (v) => v],
  ['pierce', 'Pierce', (v) => (v >= 99 ? '∞' : v)],
  ['homing', 'Homing turn', (v) => `${v.toFixed(1)} rad/s`],
  ['homingRange', 'Homing reach', (v) => `${v}px`],
  ['critChance', 'Crit chance', (v) => `${Math.round(v * 100)}%`],
  ['critMult', 'Crit damage', (v) => `${v}×`],
  ['speed', 'Move speed', (v) => Math.round(v)],
  ['dashCd', 'Dash cooldown', (v) => `${v.toFixed(2)}s`],
  ['dashCharges', 'Dash charges', (v) => v],
  ['shhhCd', 'SHHH! cooldown', (v) => `${v.toFixed(1)}s`],
  ['shhhRadius', 'SHHH! reach', (v) => `${Math.round(v)}px`],
  ['orbiters', 'Orbiting books', (v) => v],
  ['iframes', 'Invulnerability', (v) => `${v.toFixed(1)}s`],
  ['shelfBurst', 'Burst radius', (v) => `${v}px`],
  ['nook', 'Nook throw bonus', (v) => `+${Math.round(v * 100)}%`],
  ['wraps', 'Wall wraps', (v) => v],
  ['scoreMult', 'Score', (v) => `${Math.round(v * 100)}%`],
];
export function previewChange(u, stats, player) {
  const s = { ...stats }, p = player ? { ...player } : null;
  u.apply(s, p);
  const lines = [];
  for (const [k, label, fmt] of PREVIEW) if (s[k] !== stats[k]) lines.push(`${label} ${fmt(stats[k])} → ${fmt(s[k])}`);
  if (p && player && p.hp !== player.hp && s.maxHp === stats.maxHp) lines.push(`Hearts ${player.hp} → ${p.hp}`);
  if (p && player && s.maxHp !== stats.maxHp) lines.push(`Hearts now ${player.hp}/${stats.maxHp} → ${p.hp}/${s.maxHp}`);
  return lines;
}

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

/**
 * Draw `n` distinct perks. An unlocked combo always takes the first slot;
 * the rest are weighted by rarity. `ctx.lights` = whether dynamic lighting is on.
 */
export function rollUpgrades(rng, owned = {}, n = 3, ctx = {}) {
  const out = [];
  const specials = [...unlockedMasterworks(owned), ...unlockedCombos(owned)];
  if (specials.length) out.push(rng.pick(specials));
  const pool = UPGRADES.filter((u) => u.kind !== 'combo' && u.kind !== 'master' && (owned[u.id] || 0) < u.max && !(u.needsLights && ctx.lights === false));
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool);
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
