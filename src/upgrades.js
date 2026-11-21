// Perks offered between waves. Pure data + a seeded roller (no DOM), so it is unit-tested.
//
// Kinds:
//   perk    — normal, stackable up to `max`
//   cursed  — a trade-off: a big upside with a real cost (max 1, rarer)
//   combo   — a "Collected Works" card that unlocks once you own BOTH perks in `requires`;
//             when one is unlocked it is always offered until you take it.

export function baseStats() {
  return {
    maxHp: 5, speed: 210, fireRate: 4, damage: 1, projectiles: 1, spread: 0.2,
    bounces: 0, pierce: 0, homing: 0, critChance: 0.05, dashCd: 0.9,
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
  };
}

const perk = (o) => ({ kind: 'perk', weight: 7, ...o });
const cursed = (o) => ({ kind: 'cursed', max: 1, weight: 3, ...o });
const combo = (o) => ({ kind: 'combo', max: 1, weight: 0, ...o });

export const UPGRADES = [
  // ---- core (rebalanced: no single card should carry a run) ----
  perk({ id: 'hardcover', icon: '📕', name: 'Hardcover Edition', desc: '+50% book damage', max: 5, weight: 9, apply: (s) => { s.damage += 0.5; } }),
  perk({ id: 'speedreader', icon: '⚡', name: 'Speed Reader', desc: '+20% throw rate', max: 5, weight: 9, apply: (s) => { s.fireRate *= 1.2; } }),
  perk({ id: 'trilogy', icon: '📚', name: 'Trilogy Box Set', desc: '+1 book per throw', max: 3, weight: 6, apply: (s) => { s.projectiles += 1; s.spread = Math.max(0.14, s.spread * 0.9); } }),
  perk({ id: 'bookmark', icon: '🔖', name: 'Bouncy Bookmark', desc: 'Books ricochet off shelves & walls (+1 bounce)', max: 3, apply: (s) => { s.bounces += 1; } }),
  perk({ id: 'plottwist', icon: '🌀', name: 'Plot Twist', desc: 'Books pierce through +1 enemy', max: 3, apply: (s) => { s.pierce += 1; } }),
  perk({ id: 'dewey', icon: '🧭', name: 'Dewey Decimal Guidance', desc: 'Books home in on nearby enemies', max: 3, weight: 6, apply: (s) => { s.homing += 2.4; } }),
  perk({ id: 'coffee', icon: '☕', name: 'Double Espresso', desc: '+12% move speed, −15% dash cooldown', max: 4, weight: 8, apply: (s) => { s.speed *= 1.12; s.dashCd *= 0.85; } }),
  perk({ id: 'extendedloan', icon: '❤️', name: 'Extended Loan', desc: '+1 max heart and fully heal', max: 4, apply: (s, p) => { s.maxHp += 1; if (p) p.hp = s.maxHp; } }),
  perk({ id: 'quietplease', icon: '🤫', name: 'Quiet Please', desc: 'SHHH! recharges 25% faster and reaches 20% further', max: 3, weight: 6, apply: (s) => { s.shhhCd *= 0.75; s.shhhRadius *= 1.2; } }),
  perk({ id: 'footnotes', icon: '✳️', name: 'Footnotes', desc: '+12% chance to crit for 2.5× damage', max: 4, apply: (s) => { s.critChance += 0.12; } }),
  perk({ id: 'audiobook', icon: '🎧', name: 'Audiobook Orbit', desc: '+1 book orbits you, smacking enemies', max: 4, weight: 5, apply: (s) => { s.orbiters += 1; } }),
  perk({ id: 'graceperiod', icon: '🕊️', name: 'Grace Period', desc: 'Heal 1 heart; +0.3s invulnerability after a hit', max: 3, weight: 6, apply: (s, p) => { s.iframes += 0.3; if (p) p.hp = Math.min(s.maxHp, p.hp + 1); } }),

  // ---- shelf play: the shelves are part of your arsenal ----
  perk({ id: 'spinebreaker', icon: '💥', name: 'Spine Breaker', desc: 'Books that hit a shelf or wall burst, hurting everything nearby', max: 3, weight: 7, apply: (s) => { s.shelfBurst = s.shelfBurst ? s.shelfBurst + 15 : 55; } }),
  perk({ id: 'readingnook', icon: '🛋️', name: 'Reading Nook', desc: '+40% throw rate while standing next to a shelf', max: 3, weight: 6, apply: (s) => { s.nook += 0.4; } }),
  perk({ id: 'interlibrary', icon: '🔁', name: 'Interlibrary Loan', desc: 'Books leaving the library come back through the opposite wall', max: 2, weight: 5, apply: (s) => { s.wraps += 1; } }),

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
];

export const byId = (id) => UPGRADES.find((u) => u.id === id);

/** Combo cards whose two required perks are owned and which aren't taken yet. */
export function unlockedCombos(owned = {}) {
  return UPGRADES.filter((u) => u.kind === 'combo' && !owned[u.id] && u.requires.every((r) => owned[r]));
}

/**
 * Draw `n` distinct perks. An unlocked combo always takes the first slot;
 * the rest are weighted by rarity. `ctx.lights` = whether dynamic lighting is on.
 */
export function rollUpgrades(rng, owned = {}, n = 3, ctx = {}) {
  const out = [];
  const combos = unlockedCombos(owned);
  if (combos.length) out.push(rng.pick(combos));
  const pool = UPGRADES.filter((u) => u.kind !== 'combo' && (owned[u.id] || 0) < u.max && !(u.needsLights && ctx.lights === false));
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool);
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
