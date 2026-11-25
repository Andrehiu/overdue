// Act II water enemies (v1.16.0 part B): Ink Eel and Paper Boat. Pure rules (no DOM), unit-tested in test/water-enemies.test.js.
// main.js owns the world (enemies, pages, notices); this module owns the timers and the water geometry.

export const WATER_TYPES = ['eel', 'boat'];
export const isWaterType = (t) => t === 'eel' || t === 'boat';
/** A room without water swaps a water enemy for a dry one of about the same cost, so the budget stays honest. */
export const DRY_SWAP = { eel: 'patron', boat: 'notice' };

// ---- Ink Eel: swims under water, then rise (tell) -> up (spits, can be hit) -> dive (can't be hit) ----
export const EEL = { under: [2.1, 3.2], rise: 0.6, up: 1.0, dive: 0.4, fireAt: 0.3, fanPages: 3, fanSpread: 0.26, pageSpeed: 150 };
export const EEL_PHASES = ['under', 'rise', 'up', 'dive'];

/** Start state (random first dive length so a group doesn't surface in unison). */
export function eelInit(e, rng = Math.random) {
  e.ph = 'under'; e.phT = EEL.under[0] + (EEL.under[1] - EEL.under[0]) * rng() * 0.6; e.fired = false; e.under = true;
}
/** Can a book / orbit / cat / ink hurt it? Only while it is up. */
export const eelHittable = (e) => e.ph === 'up';
/**
 * Advance the surface cycle. Returns { fire: true } on the frame it spits (once per surfacing). Sets `e.under` = untargetable
 * (under, rise and dive). `dt` is game seconds; a very long dt just moves through the phases in order.
 */
export function eelStep(e, dt, rng = Math.random) {
  if (!e.ph) eelInit(e, rng);
  let fire = false;
  e.phT -= dt;
  if (e.ph === 'under' && e.phT <= 0) { e.ph = 'rise'; e.phT = EEL.rise; e.fired = false; }
  else if (e.ph === 'rise' && e.phT <= 0) { e.ph = 'up'; e.phT = EEL.up; }
  else if (e.ph === 'up') {
    if (!e.fired && EEL.up - e.phT >= EEL.fireAt) { e.fired = true; fire = true; }
    if (e.phT <= 0) { e.ph = 'dive'; e.phT = EEL.dive; }
  } else if (e.ph === 'dive' && e.phT <= 0) {
    e.ph = 'under'; e.phT = EEL.under[0] + (EEL.under[1] - EEL.under[0]) * rng();
  }
  e.under = e.ph !== 'up';
  return { fire };
}

// ---- Paper Boat: drifts, drops an Overdue Notice every ~4 s ----
export const BOAT = { first: [1.8, 3.2], every: 4, jitter: 0.25, hp: 2, maxNotices: 3 };
export function boatInit(e, rng = Math.random) { e.dropT = BOAT.first[0] + (BOAT.first[1] - BOAT.first[0]) * rng(); }
/** Returns { drop: true } when a notice should be dropped; the timer restarts at ~4 s (+-25%). */
export function boatStep(e, dt, rng = Math.random) {
  if (e.dropT === undefined) boatInit(e, rng);
  e.dropT -= dt;
  if (e.dropT > 0) return { drop: false };
  e.dropT = BOAT.every * (1 - BOAT.jitter + 2 * BOAT.jitter * rng());
  return { drop: true };
}

// ---- water geometry (grid: Uint8Array water[cy*cols+cx], cell size px) ----
export const inWater = (water, cols, rows, cell, x, y) => {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  return cx >= 0 && cy >= 0 && cx < cols && cy < rows && water[cy * cols + cx] === 1;
};
/** True when a disc of radius r centred at (x,y) has its centre and four edge points all over water. */
export function discInWater(water, cols, rows, cell, x, y, r) {
  return inWater(water, cols, rows, cell, x, y) && inWater(water, cols, rows, cell, x - r, y) && inWater(water, cols, rows, cell, x + r, y)
    && inWater(water, cols, rows, cell, x, y - r) && inWater(water, cols, rows, cell, x, y + r);
}
/**
 * Move (x,y) by (dx,dy) but only into water: tries the full step, then x only, then y only; else stays.
 * Returns { x, y, blocked } (blocked = the full step was refused).
 */
export function moveInWater(water, cols, rows, cell, x, y, dx, dy, r = 0) {
  const ok = (nx, ny) => (r > 0 ? discInWater(water, cols, rows, cell, nx, ny, r) : inWater(water, cols, rows, cell, nx, ny));
  if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy, blocked: false };
  if (dx && ok(x + dx, y)) return { x: x + dx, y, blocked: true };
  if (dy && ok(x, y + dy)) return { x, y: y + dy, blocked: true };
  return { x, y, blocked: true };
}
/** A random water cell centre at least `minDist` px from (px,py); falls back to the farthest one. null if no water. */
export function waterSpawn(water, cols, rows, cell, px, py, rng = Math.random, minDist = 260, edge = 1) {
  const all = [];
  for (let cy = edge; cy < rows - edge; cy++) for (let cx = edge; cx < cols - edge; cx++) if (water[cy * cols + cx] === 1) {
    // keep spawn cells with water on all four sides, so a disc fits
    if (water[cy * cols + cx - 1] === 1 && water[cy * cols + cx + 1] === 1 && water[(cy - 1) * cols + cx] === 1 && water[(cy + 1) * cols + cx] === 1) all.push([cx, cy]);
  }
  if (!all.length) return null;
  const pt = ([cx, cy]) => ({ x: cx * cell + cell / 2, y: cy * cell + cell / 2 });
  const far = all.filter((c) => Math.hypot(pt(c).x - px, pt(c).y - py) >= minDist);
  if (far.length) return pt(far[Math.floor(rng() * far.length)]);
  let best = all[0], bd = -1;
  for (const c of all) { const d = Math.hypot(pt(c).x - px, pt(c).y - py); if (d > bd) { bd = d; best = c; } }
  return pt(best);
}
/** The dry (walkway) cell centre nearest to (x,y): `walk` marks shelves + water, so a free cell is walk === 0. null if none. */
export function nearestWalkway(walk, cols, rows, cell, x, y) {
  let best = null, bd = Infinity;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (walk[cy * cols + cx]) continue;
    const px = cx * cell + cell / 2, py = cy * cell + cell / 2, d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  return best;
}
/** Does this room have enough water for water enemies? */
export const hasWater = (arena) => !!(arena && arena.water && arena.water.some(Boolean));
