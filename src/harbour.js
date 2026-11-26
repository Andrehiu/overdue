// The Harbourmaster (v1.17.0): the wing-15 boss. A huge folded-paper flagship that sails in two water channels along the top and bottom walls.
// Pure rules (no DOM): timers, wall-of-pages gaps, boat cap, anchors and the ram. main.js (`harbourAI`) owns hazards, spawns and drawing,
// and this module is unit-tested in test/harbour.test.js with a seeded Rng. Phases come from boss HP as for every boss: 1 Broadside, 2 Launch the fleet, 3 Ramming speed.

export const HM = {
  channelRows: 2,            // each channel is 2 cells deep (src/arena.js `harbour` shape)
  name: 'THE HARBOURMASTER',
  hpMult: 0.85,              // v1.17.0 owner call: the Harbourmaster has 15% less HP than the boss formula (this boss only)
  scale: 1.35,               // hit radius = tome radius x this
  sail: 95,                  // px/s along a channel
  swap: 330,                 // px/s when it changes channel along a side wall (no attacks, no contact)
  back: 240,                 // px/s returning to a channel after a ram
  ram: { windup: 0.7, speed: 470, time: 0.75, sideEvery: 0.16, sidePages: 1 },
  lapTurns: 2,               // turns at the ends before it changes channel: one lap
  wall: { tell: 0.5, every: [2.2, 2.6, 0], speed: 150, spacing: 26, margin: 14, gapMin: 96, gapPlayers: 4.2, reach: 130 },
  boat: { every: 8, cap: 5, drop: 3 },
  anchor: { every: [0, 5, 3.5], delay: 0.9, r: 34, pages: 12, speed: 170 },
  ramEvery: 3.4,             // phase 3: seconds in a channel between rams
  first: { wall: 3.0, boat: 3, anchor: 2.6, ram: 2.4 },
  contactK: 0,               // contact radius while it sails in a channel (fraction of r): none, so standing at a channel's edge is safe; full size while it rams
  laneBottomInset: 30,       // the bottom lane sits this far above the channel's inner edge, clear of the boss HP bar
};

/** Y of the two sailing lanes (the middle of each channel) for a room of height H (px) and cell size c. */
// v1.17.0 cosmetic fix: the ship sails on the inner edge of each channel (not its middle), so the whole hull and eye stay on screen below the ROOM label (top)
// and above the boss HP bar (bottom). Boats still go in the middle of the water (channelYs).
export const laneYs = (H, c, rows = HM.channelRows) => [rows * c, H - rows * c - HM.laneBottomInset];
export const channelYs = (H, c, rows = HM.channelRows) => [(rows * c) / 2, H - (rows * c) / 2];

export function newHarbour(W, H, cell) {
  const [top] = laneYs(H, cell);
  return { lane: 0, dir: 1, x: W / 2, y: top, mode: 'sail', modeT: 0, turns: 0, wallT: HM.first.wall, boatT: HM.first.boat, anchorT: HM.first.anchor, ramT: HM.first.ram, sideT: 0,
    wall: null, anchors: [], cAim: 0, cdx: 0, cdy: 0, swapTo: 0, phase: 1 };
}

/** A phase change (after the boss's 1 s transform): back to a lane, fresh timers, attacks restart gently. */
export function harbourPhase(h, phase) {
  h.phase = phase; h.mode = h.mode === 'swap' ? 'swap' : 'back'; h.wall = null;
  h.wallT = 1.2; h.boatT = 2.5; h.anchorT = 2.2; h.ramT = 2.4; h.sideT = 0;
}

/** Plan a wall of pages: 1-2 gaps, each at least 3 player widths wide; one gap is always within `reach` px of the player's x. */
export function planWall(rng, playerX, W, playerW = 24, opts = {}) {
  const o = { ...HM.wall, ...opts };
  const w = Math.max(o.gapMin, o.gapPlayers * playerW), lo = o.margin + w / 2, hi = W - o.margin - w / 2;
  const c1 = Math.min(hi, Math.max(lo, playerX + (rng.next() * 2 - 1) * o.reach * 0.8));
  const gaps = [{ c: c1, w }];
  if (rng.chance(0.5)) {
    for (let t = 0; t < 12; t++) {   // a second gap anywhere that keeps one page-wide post between the two
      const c2 = lo + rng.next() * (hi - lo);
      if (Math.abs(c2 - c1) >= w + o.spacing) { gaps.push({ c: c2, w }); break; }
    }
  }
  return { gaps: gaps.sort((a, b) => a.c - b.c) };
}
/** x of every page in a planned wall (the line minus the gaps). */
export function wallPages(plan, W, opts = {}) {
  const o = { ...HM.wall, ...opts }, xs = [];
  for (let x = o.margin; x <= W - o.margin + 0.1; x += o.spacing) if (!plan.gaps.some((g) => Math.abs(x - g.c) < g.w / 2)) xs.push(x);
  return xs;
}

/** Radius of the part of the ship that hurts on contact: small while it sails in a channel, none while it changes channel, full while it rams. */
export const contactRadius = (h, r) => (h.mode === 'ram' || h.mode === 'windup' ? r : r * HM.contactK);

/**
 * Advance the Harbourmaster by dt. `h` is its state (x, y included: main.js copies them to the enemy),
 * `env` = { phase 1..3, W, H, cell, r, player: {x, y, r}, boats (alive + incoming), rng }. Returns the events that happened this step:
 *   {type:'wallTell', plan, y, dy}   a wall's line flashes for HM.wall.tell s (h.wall holds it until it fires)
 *   {type:'wallFire', plan, y, dy}   the pages leave (dy = +1 down from the top channel, -1 up from the bottom)
 *   {type:'boats', list:[{x, y}]}    drop boats into the channels (never more than HM.boat.cap alive in total)
 *   {type:'anchor', x, y}            thrown: a red circle on the player, lands after HM.anchor.delay
 *   {type:'anchorLand', x, y}        it landed: hurt inside the circle, burst of pages
 *   {type:'ramWindup'} {type:'ramGo'} {type:'ramSide', x, y, nx, ny} {type:'ramEnd', wall}
 */
export function harbourStep(h, dt, env) {
  const ev = [], { W, H, cell, r, player: p, rng } = env, phase = env.phase || 1;
  if (h.phase !== phase) harbourPhase(h, phase);
  const [yTop, yBot] = laneYs(H, cell), laneY = [yTop, yBot], chY = channelYs(H, cell), margin = r * 0.9 + 6;
  // pending anchors land first (they were thrown earlier)
  for (let i = h.anchors.length - 1; i >= 0; i--) {
    const a = h.anchors[i]; a.t += dt;
    if (a.t >= HM.anchor.delay) { ev.push({ type: 'anchorLand', x: a.x, y: a.y }); h.anchors.splice(i, 1); }
  }
  // a wall whose tell is up fires
  if (h.wall) { h.wall.t += dt; if (h.wall.t >= HM.wall.tell) { ev.push({ type: 'wallFire', plan: h.wall.plan, y: h.wall.y, dy: h.wall.dy }); h.wall = null; } }

  if (h.mode === 'sail') {
    h.x += h.dir * HM.sail * dt; h.y = laneY[h.lane];
    if ((h.dir > 0 && h.x >= W - margin) || (h.dir < 0 && h.x <= margin)) {
      h.x = Math.min(W - margin, Math.max(margin, h.x)); h.dir = -h.dir; h.turns++;
      if (h.turns >= HM.lapTurns && phase < 3) { h.turns = 0; h.mode = 'swap'; h.swapTo = 1 - h.lane; }
    }
    // Broadside: a wall across the room, perpendicular to its heading (down from the top channel, up from the bottom)
    const every = HM.wall.every[phase - 1];
    if (every) {
      h.wallT -= dt;
      if (h.wallT <= 0 && !h.wall && h.mode === 'sail' && !env.hold) {
        h.wallT = every;
        const plan = planWall(rng, p.x, W, p.r * 2), dy = h.lane === 0 ? 1 : -1;
        h.wall = { plan, y: h.y + dy * (r * 0.35 + 6), dy, t: 0 };
        ev.push({ type: 'wallTell', plan, y: h.wall.y, dy });
      }
    }
    if (phase === 3) {
      h.ramT -= dt;
      if (h.ramT <= 0 && !h.wall) {
        h.mode = 'windup'; h.modeT = HM.ram.windup; h.cAim = Math.atan2(p.y - h.y, p.x - h.x); ev.push({ type: 'ramWindup' });
      }
    }
  } else if (h.mode === 'swap') {
    // Along the side wall to the other channel; no attacks, no contact (contactRadius is 0).
    const ty = laneY[h.swapTo], step = HM.swap * dt;
    if (Math.abs(ty - h.y) <= step) { h.y = ty; h.lane = h.swapTo; h.mode = 'sail'; h.wallT = Math.max(h.wallT, 0.8); }
    else h.y += Math.sign(ty - h.y) * step;
  } else if (h.mode === 'back') {
    // Return to the nearest lane (also the way a phase change recovers from anywhere).
    const lane = Math.abs(h.y - yTop) <= Math.abs(h.y - yBot) ? 0 : 1, ty = laneY[lane], step = HM.back * dt;
    if (Math.abs(ty - h.y) <= step) { h.y = ty; h.lane = lane; h.mode = 'sail'; h.dir = h.x > W / 2 ? -1 : 1; h.turns = 0; }
    else h.y += Math.sign(ty - h.y) * step;
  } else if (h.mode === 'windup') {
    h.modeT -= dt;
    if (h.modeT <= 0) { h.mode = 'ram'; h.modeT = HM.ram.time; h.cdx = Math.cos(h.cAim); h.cdy = Math.sin(h.cAim); h.sideT = 0; ev.push({ type: 'ramGo' }); }
  } else if (h.mode === 'ram') {
    h.modeT -= dt; h.x += h.cdx * HM.ram.speed * dt; h.y += h.cdy * HM.ram.speed * dt;
    h.sideT -= dt;
    if (h.sideT <= 0) {   // a short broadside from both sides as it goes
      h.sideT = HM.ram.sideEvery;
      ev.push({ type: 'ramSide', x: h.x, y: h.y, nx: -h.cdy, ny: h.cdx }, { type: 'ramSide', x: h.x, y: h.y, nx: h.cdy, ny: -h.cdx });
    }
    const hitWall = h.x < r || h.x > W - r || h.y < r || h.y > H - r;
    if (hitWall || h.modeT <= 0) {
      h.x = Math.min(W - r, Math.max(r, h.x)); h.y = Math.min(H - r, Math.max(r, h.y));
      h.mode = 'back'; h.ramT = HM.ramEvery; ev.push({ type: 'ramEnd', wall: hitWall });
    }
  }
  if (phase >= 2) {
    h.boatT -= dt;
    if (h.boatT <= 0) {
      h.boatT = HM.boat.every;
      const n = Math.max(0, Math.min(HM.boat.drop, HM.boat.cap - (env.boats || 0)));
      if (n > 0) ev.push({ type: 'boats', list: Array.from({ length: n }, (_, i) => ({ x: W * (0.2 + 0.6 * rng.next()), y: chY[(i + (rng.chance(0.5) ? 1 : 0)) % 2] })) });
    }
    h.anchorT -= dt;
    if (h.anchorT <= 0) { h.anchorT = HM.anchor.every[phase - 1]; const a = { x: p.x, y: p.y, t: 0 }; h.anchors.push(a); ev.push({ type: 'anchor', x: a.x, y: a.y }); }
  }
  return ev;
}
