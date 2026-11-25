// Auto-aim target choice (v1.15.3). Pure: main.js passes in what it knows (enemies, a line-of-sight test), so this is unit-tested.
// Rules: prefer enemies in line of sight; with none visible, the nearest one behind shelves (feeds Spine Breaker);
// stay on the current target (sticky) unless a better one is at least 30% closer; a visible target always beats a hidden one.

export const STICKY_CLOSER = 0.7;   // a challenger must be within 70% of the sticky target's distance (>= 30% closer)

/**
 * @param {{x:number,y:number}} from   the player
 * @param {Array<{x:number,y:number}>} enemies
 * @param {number} range               max distance
 * @param {(e:object)=>boolean} visible  clear line from the player to this enemy?
 * @param {object|null} sticky         last frame's target
 * @returns the chosen enemy or null
 */
export function chooseTarget(from, enemies, range, visible, sticky = null) {
  const r2 = range * range;
  const d2 = (e) => (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
  let nearest = null, nd = r2, nearVis = null, vd = r2, stickyIn = false;
  for (const e of enemies) {
    if (e.dead || e.under) continue;   // dead ones are removed at the end of the enemy update; a submerged eel can't be hit   // a submerged Ink Eel can't be hit, so it isn't a target
    const d = d2(e);
    if (d >= r2) continue;
    if (e === sticky) stickyIn = true;
    if (d < nd) { nd = d; nearest = e; }
    if (d < vd && visible(e)) { vd = d; nearVis = e; }   // only ray-test enemies that could beat the best visible one so far
  }
  if (!nearest) return null;
  const k = STICKY_CLOSER * STICKY_CLOSER;
  if (stickyIn) {
    const sd = d2(sticky), sVis = visible(sticky);
    if (sVis) return nearVis && nearVis !== sticky && vd <= sd * k ? nearVis : sticky;
    if (nearVis) return nearVis;                                  // a visible enemy always beats a hidden sticky one
    return nd <= sd * k ? nearest : sticky;                       // nobody visible: keep the hidden one unless another is 30% closer
  }
  return nearVis || nearest;
}

/** Aim point: the enemy's position plus 50% of the way it travels while a book flies there. Lead time capped so bosses mid-charge stay sane. */
export function leadPoint(e, from, bookSpeed, frac = 0.5, maxT = 0.6) {
  const vx = e.pvx || 0, vy = e.pvy || 0;
  const t = Math.min(Math.hypot(e.x - from.x, e.y - from.y) / Math.max(1, bookSpeed), maxT);
  return { x: e.x + vx * frac * t, y: e.y + vy * frac * t };
}
