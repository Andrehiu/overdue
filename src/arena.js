// Procedural, mirrored library layouts on a grid. Pure module (no DOM) so it is unit-testable.
import { Rng, hashString, clamp } from './util.js';

export const CELL = 30;
// Grid size is switchable between landscape (32x18 = 960x540) and portrait (18x32 = 540x960)
// for phones. These are live ES-module bindings, so importers always see the current layout.
export let COLS = 32;
export let ROWS = 18;
export let W = COLS * CELL;
export let H = ROWS * CELL;
/** Cells kept clear around the player's spawn point (inclusive bounds). */
export let SAFE = { x0: 12, y0: 6, x1: 19, y1: 11 };
export let PORTRAIT = false;
/** Free cells required between any two shelves (and between a shelf and the walls). */
export const AISLE = 2;

/** Use an arena of `cols` x `rows` cells. Call only between runs. */
export function setGrid(cols, rows) {
  COLS = cols; ROWS = rows; W = COLS * CELL; H = ROWS * CELL;
  PORTRAIT = ROWS > COLS;
  const hw = PORTRAIT ? 3 : 4, hh = PORTRAIT ? 4 : 3; // half-size of the clear zone
  SAFE = { x0: (COLS >> 1) - hw, y0: (ROWS >> 1) - hh, x1: (COLS >> 1) + hw - 1, y1: (ROWS >> 1) + hh - 1 };
}

/** Switch between the classic landscape (32x18) and phone-portrait (18x32) arenas. */
export function setOrientation(portrait) { setGrid(portrait ? 18 : 32, portrait ? 32 : 18); }

/**
 * Pick an arena shape that matches the screen, so there are no big black bars:
 * 16:9 desktop -> 32x18, iPad landscape -> 28x20. Narrower screens get the 4:3 shape (letterboxed).
 * Keeps roughly the same number of cells (same amount of room to play) and an even column count.
 */
export function gridForAspect(aspect) {
  const a = clamp(aspect || 16 / 9, 4 / 3, 32 / 18); // landscape only since v1.4.0: never a portrait grid
  let rows = Math.round(Math.sqrt(576 / a));
  let cols = Math.round((rows * a) / 2) * 2;
  cols = clamp(cols, 18, 32); rows = clamp(rows, 18, 32);
  return [cols, rows];
}

export const idx = (cx, cy) => cy * COLS + cx;

export function cellOf(x, y) {
  return [clamp(Math.floor(x / CELL), 0, COLS - 1), clamp(Math.floor(y / CELL), 0, ROWS - 1)];
}

/** True if pixel position is inside a shelf or outside the arena. */
export function isSolidPx(solid, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  return solid[idx(Math.floor(x / CELL), Math.floor(y / CELL))] === 1;
}

/** Every free cell must be reachable from the centre (4-neighbour flood fill). */
export function isConnected(solid) {
  const start = idx(COLS >> 1, ROWS >> 1);
  if (solid[start]) return false;
  const seen = new Uint8Array(COLS * ROWS);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length) {
    const i = stack.pop();
    reached++;
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = idx(nx, ny);
      if (!seen[ni] && !solid[ni]) { seen[ni] = 1; stack.push(ni); }
    }
  }
  let free = 0;
  for (let i = 0; i < solid.length; i++) if (!solid[i]) free++;
  return reached === free;
}

function overlapsSafe(x, y, w, h) {
  return x <= SAFE.x1 && x + w - 1 >= SAFE.x0 && y <= SAFE.y1 && y + h - 1 >= SAFE.y0;
}

/**
 * Generate a symmetric library floor: shelves are placed in the left half and mirrored.
 * Deterministic for a given (seed, wave). `shelvesPerHalf` overrides the density (story wings).
 */
export function generateArena(seed, wave, shelvesPerHalf = null, shape = 'scatter') {
  if (shape && shape !== 'scatter') {
    const a = shapedArena(seed, wave, shelvesPerHalf, shape);
    if (a) return a;
  }
  return scatterArena(seed, wave, shelvesPerHalf);
}

/** The original generator (endless mode and the 'scatter' shape). Layouts must never change. */
function scatterArena(seed, wave, shelvesPerHalf) {
  const rng = new Rng(hashString(`arena:${seed}:${wave}`));
  const perHalf = shelvesPerHalf ?? Math.min(2 + Math.floor((wave + 1) / 2), 6);
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const solid = new Uint8Array(COLS * ROWS);
    const shelves = [];
    let tries = 0;
    while (shelves.length < perHalf * 2 && tries++ < 300) {
      const horiz = rng.chance(0.55);
      const w = horiz ? rng.int(3, 5) : 1;
      const h = horiz ? 1 : rng.int(2, 4);
      const x = rng.int(2, (COLS >> 1) - 1 - w);
      const y = rng.int(2, ROWS - 2 - h);
      if (overlapsSafe(x, y, w, h)) continue;
      // Keep a two-cell (60 px) aisle around every shelf, corners included, so the 22 px player
      // and the enemies chasing them never jam in a gap. Walls and the mirror seam also leave 2 cells.
      let blocked = false;
      for (let yy = y - AISLE; yy < y + h + AISLE && !blocked; yy++)
        for (let xx = x - AISLE; xx < x + w + AISLE; xx++)
          if (solid[idx(xx, yy)]) { blocked = true; break; }
      if (blocked) continue;
      const mx = COLS - x - w; // mirrored x
      for (const sx of [x, mx]) {
        for (let yy = y; yy < y + h; yy++) for (let xx = sx; xx < sx + w; xx++) solid[idx(xx, yy)] = 1;
        shelves.push({ x: sx, y, w, h });
      }
    }
    if (isConnected(solid) && (!best || shelves.length > best.shelves.length)) {
      const rects = shelves.map((s) => ({ x: s.x * CELL, y: s.y * CELL, w: s.w * CELL, h: s.h * CELL }));
      best = { seed, wave, shape: 'scatter', shelves, rects, solid };
    }
    // Wide aisles can make a crowded request not fit; if so keep retrying for the fullest layout,
    // and settle for fewer shelves rather than an empty room.
    if (best && best.shelves.length >= perHalf * 2) break;
  }
  return best || { seed, wave, shape: 'scatter', shelves: [], rects: [], solid: new Uint8Array(COLS * ROWS) };
}

// ---- Room shapes (story wings). Each shape lists candidate shelves for the LEFT half in priority
// order; they are placed greedily (mirrored to the right) while they keep the 2-cell aisles, the spawn
// zone clear and the floor connected. Taking the first N of a fixed list means a denser room always
// contains every shelf of a sparser one (same shape, same seed).
export const SHAPES = ['scatter', 'aisles', 'pillars', 'maze', 'reading', 'bridge'];

function shuffled(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const SHAPE_GEN = {
  // Long parallel rows (library stacks), each with a cross-gap at the mirror seam and sometimes one more.
  aisles(rng, perHalf) {
    const half = COLS >> 1, n = Math.floor((ROWS - 2) / 3), slack = (ROWS - 4) - (3 * (n - 1) + 1);
    const off = rng.int(0, slack);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const y = 2 + off + 3 * i;
      const end = y >= SAFE.y0 - 0 && y <= SAFE.y1 ? SAFE.x0 - 2 : half - 2; // last cell of the half-row
      const len = end - 2 + 1;
      const segs = [];
      if (len >= 10 && rng.chance(0.55)) {
        const g = rng.int(4, len - 6); // cross-gap of 2 cells
        segs.push([2, g], [g + 3, len - g - 2]);
      } else segs.push([2, len]);
      rows.push(segs.map(([x, w]) => ({ x, y, w, h: 1 })));
    }
    return { cands: shuffled(rng, rows).flat(), target: perHalf * 2 };
  },
  // Open hall: a regular grid of 1x1 or 2x2 pillars, checkerboard first.
  pillars(rng, perHalf) {
    const half = COLS >> 1, s = rng.chance(0.5) ? 1 : 2, pitch = s + 3;
    const ox = rng.int(0, 1), oy = rng.int(0, 1);
    const a = [], b = [];
    for (let j = 0, y = 2 + oy; y + s <= ROWS - 2; j++, y += pitch)
      for (let i = 0, x = 2 + ox; x + s <= half - 1; i++, x += pitch) ((i + j) % 2 ? b : a).push({ x, y, w: s, h: s });
    return { cands: [...shuffled(rng, a), ...shuffled(rng, b)], target: s === 1 ? perHalf * 2 : perHalf + 1 };
  },
  // Short bars of alternating direction on a loose lattice: corridors that turn.
  maze(rng, perHalf) {
    const half = COLS >> 1, cands = [];
    for (let y = 2; y <= ROWS - 4; y += 5) for (let x = 2; x <= half - 4; x += 5) {
      const horiz = ((x - 2) / 5 + (y - 2) / 5) % 2 === 0 ? rng.chance(0.75) : rng.chance(0.25);
      const len = rng.int(3, 4);
      const jx = rng.int(0, 1), jy = rng.int(0, 1);
      cands.push(horiz ? { x: x + jx, y: y + 1 + jy, w: len, h: 1 } : { x: x + 1 + jx, y: y + jy, w: 1, h: len });
    }
    return { cands: shuffled(rng, cands), target: perHalf + 1 };
  },
  // Reading room: a ring around the spawn rug with openings top, bottom and at the four corners,
  // plus a few shelves outside it.
  reading(rng, perHalf) {
    const half = COLS >> 1, xl = SAFE.x0 - 2, yt = SAFE.y0 - 2, yb = SAFE.y1 + 2;
    const ring = [
      { x: xl, y: yt, w: half - 1 - xl, h: 1 },           // top bar
      { x: xl, y: yb, w: half - 1 - xl, h: 1 },           // bottom bar
      { x: xl, y: yt + 3, w: 1, h: yb - yt - 5 },         // side bar
    ];
    const out = [];
    for (let i = 0; i < 14; i++) {
      const horiz = rng.chance(0.4), w = horiz ? rng.int(3, 4) : 1, h = horiz ? 1 : rng.int(3, 5);
      out.push({ x: rng.int(2, Math.max(2, xl - 2 - w)), y: rng.int(2, ROWS - 2 - h), w, h });
    }
    return { cands: [...ring, ...out], target: 3 + Math.max(0, perHalf - 2) };
  },
  // Two long shelf walls split the floor into a centre and two sides, joined by 2-3 wide gaps each.
  bridge(rng, perHalf) {
    const half = COLS >> 1, wx = rng.int(4, 6), gaps = rng.int(2, 3), gw = 2;
    const top = 2, bottom = ROWS - 2; // wall spans rows [top, bottom)
    const room = bottom - top - gaps * gw, segs = gaps + 1;
    const cuts = Array.from({ length: segs }, (_, i) => Math.floor(room / segs) + (i < room % segs ? 1 : 0));
    if (rng.chance(0.5)) cuts.reverse();
    const wall = [];
    let y = top;
    for (const l of cuts) { wall.push({ x: wx, y, w: 1, h: l }); y += l + gw; }
    const extra = [];
    for (let i = 0; i < 12; i++) {
      const horiz = rng.chance(0.6), w = horiz ? rng.int(3, 5) : 1, h = horiz ? 1 : rng.int(2, 4);
      extra.push({ x: rng.int(wx + 3, Math.max(wx + 3, half - 1 - w)), y: rng.int(2, ROWS - 2 - h), w, h });
    }
    return { cands: [...wall, ...extra], target: wall.length + Math.max(0, perHalf - 1) };
  },
};

function shapedArena(seed, wave, shelvesPerHalf, shape) {
  const gen = SHAPE_GEN[shape];
  if (!gen) return null;
  const rng = new Rng(hashString(`arena:${seed}:${wave}:${shape}`));
  const perHalf = shelvesPerHalf ?? Math.min(2 + Math.floor((wave + 1) / 2), 6);
  const { cands, target } = gen(rng, perHalf);
  const half = COLS >> 1;
  const solid = new Uint8Array(COLS * ROWS);
  const shelves = [];
  const stamp = (x, y, w, h, v) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) solid[idx(xx, yy)] = v; };
  let placed = 0;
  for (const c of cands) {
    if (placed >= target) break;
    const { x, y, w, h } = c;
    if (w < 1 || h < 1 || x < AISLE || y < AISLE || x + w > half - 1 || y + h > ROWS - AISLE || overlapsSafe(x, y, w, h)) continue;
    let blocked = false;
    for (let yy = y - AISLE; yy < y + h + AISLE && !blocked; yy++)
      for (let xx = x - AISLE; xx < x + w + AISLE; xx++) if (solid[idx(xx, yy)]) { blocked = true; break; }
    if (blocked) continue;
    const mx = COLS - x - w;
    stamp(x, y, w, h, 1); stamp(mx, y, w, h, 1);
    if (!isConnected(solid)) { stamp(x, y, w, h, 0); stamp(mx, y, w, h, 0); continue; }
    shelves.push({ x, y, w, h }, { x: mx, y, w, h });
    placed++;
  }
  if (!shelves.length) return null; // fall back to scatter rather than an empty room
  const rects = shelves.map((s) => ({ x: s.x * CELL, y: s.y * CELL, w: s.w * CELL, h: s.h * CELL }));
  return { seed, wave, shape, shelves, rects, solid };
}


/** Free cells on the outer ring, used as enemy entry points. */
export function edgeCells(solid) {
  const out = [];
  for (let x = 0; x < COLS; x++) for (const y of [0, ROWS - 1]) if (!solid[idx(x, y)]) out.push([x, y]);
  for (let y = 1; y < ROWS - 1; y++) for (const x of [0, COLS - 1]) if (!solid[idx(x, y)]) out.push([x, y]);
  return out;
}
