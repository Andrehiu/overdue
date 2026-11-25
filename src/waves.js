// Budget-based wave composer. Pure + seeded => every run with the same seed plays the same waves.

export const ENEMY_TYPES = {
  bunny: { cost: 1, unlock: 1, weight: 4, maxGroup: 5 },
  notice: { cost: 1.5, unlock: 2, weight: 3, maxGroup: 4 },
  patron: { cost: 3, unlock: 3, weight: 2, maxGroup: 2 },
  worm: { cost: 6, unlock: 4, weight: 1.5, maxGroup: 1 },
  golem: { cost: 5, unlock: 6, weight: 1.2, maxGroup: 2 },
  // Act II water enemies (v1.16.0 part B): opt-in only. A wing must list them in `weights` (story.js `enemyTypes`); endless and Act I never roll them.
  eel: { cost: 4, unlock: 1, weight: 1, maxGroup: 2, optIn: true },
  boat: { cost: 2.5, unlock: 1, weight: 1, maxGroup: 2, optIn: true },
};

export const isBossWave = (w) => w > 0 && w % 5 === 0;

/** Threat budget before the boss-wave discount. */
export const baseBudget = (w) => 5 + w * 3.5 + Math.pow(w, 1.35) * 0.5;

export function waveBudget(w) {
  const b = baseBudget(w);
  return isBossWave(w) ? b * 0.35 : b;
}

/**
 * Returns {wave, boss, spawns:[{type, t, elite?}]} sorted by spawn time t (seconds).
 * `opts` (story mode; endless passes nothing and plays exactly as before):
 *   boss        override whether a boss joins (default: every 5th wave)
 *   budget      override the threat budget
 *   weights     {type: multiplier} to theme a wing (0 removes a type)
 *   unlockShift unlock enemy types this many waves earlier
 *   gapMult     scales the time between spawn groups (<1 = more pressure)
 *   eliteChance chance each enemy (not worms) spawns as an elite
 */
export function composeWave(wave, rng, opts = {}) {
  const boss = opts.boss ?? isBossWave(wave);
  let budget = opts.budget ?? waveBudget(wave);
  const spawns = [];
  const gap = Math.max(0.45, (2.3 - wave * 0.09) * (opts.gapMult ?? 1));
  const shift = opts.unlockShift || 0;
  const unlocked = Object.entries(ENEMY_TYPES)
    .filter(([type, d]) => d.unlock - shift <= wave && (opts.weights?.[type] ?? (d.optIn ? 0 : 1)) > 0)
    .map(([type, d]) => ({ type, ...d, weight: d.weight * (opts.weights?.[type] ?? 1) }));
  let t = 0.8;
  for (let guard = 0; guard < 500; guard++) {
    const options = unlocked.filter((d) => d.cost <= budget + 1e-9);
    if (!options.length) break;
    const def = rng.weighted(options);
    const maxCount = Math.max(1, Math.min(def.maxGroup, Math.floor(budget / def.cost)));
    const count = rng.int(1, maxCount);
    for (let i = 0; i < count; i++) {
      const s = { type: def.type, t: +(t + i * 0.2).toFixed(3) };
      if (opts.eliteChance && def.type !== 'worm' && rng.chance(opts.eliteChance)) s.elite = true;
      spawns.push(s);
      budget -= def.cost;
    }
    t += gap * (0.7 + rng.next() * 0.6);
  }
  if (boss) spawns.push({ type: 'boss', t: 1.2 });
  spawns.sort((a, b) => a.t - b.t);
  return { wave, boss, spawns };
}
