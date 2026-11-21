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
  // Maze: a lattice of 2x2 rooms separated by 1-cell wall lines. Random wall edges plus the posts that
  // join them form real corridors, L/T joints and dead ends (all passages stay 2+ cells wide).
  maze(rng, perHalf) {
    const half = COLS >> 1, bits = new Uint8Array(COLS * ROWS), at = (x, y) => y * COLS + x;
    const xs = [], ys = [];
    for (let x = 4; x <= half - 4; x += 3) xs.push(x);
    for (let y = 4; y <= ROWS - 5; y += 3) ys.push(y);
    const vEdge = new Set(), hEdge = new Set(); // keys "i,k": line i, room k
    for (let i = 0; i < xs.length; i++) for (let k = 0; k <= ys.length; k++) if (rng.chance(0.58)) vEdge.add(`${i},${k}`);
    for (let j = 0; j < ys.length; j++) for (let k = 0; k <= xs.length; k++) if (rng.chance(0.58)) hEdge.add(`${j},${k}`);
    for (const key of vEdge) { const [i, k] = key.split(',').map(Number); for (let d = 0; d < 2; d++) bits[at(xs[i], 2 + 3 * k + d)] = 1; }
    for (const key of hEdge) { const [j, k] = key.split(',').map(Number); for (let d = 0; d < 2; d++) bits[at(2 + 3 * k + d, ys[j])] = 1; }
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) { // posts where lines cross
      if (vEdge.has(`${i},${j}`) || vEdge.has(`${i},${j + 1}`) || hEdge.has(`${j},${i}`) || hEdge.has(`${j},${i + 1}`)) bits[at(xs[i], ys[j])] = 1;
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x > half - 2 || (x >= SAFE.x0 && x <= SAFE.x1 && y >= SAFE.y0 && y <= SAFE.y1)) bits[at(x, y)] = 0;
    const comps = [], seen = new Uint8Array(COLS * ROWS);
    for (let s = 0; s < bits.length; s++) {
      if (!bits[s] || seen[s]) continue;
      const cells = [], stack = [s]; seen[s] = 1;
      while (stack.length) {
        const c = stack.pop(); cells.push(c);
        const cx = c % COLS, cy = (c / COLS) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const n = at(nx, ny);
          if (bits[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
      comps.push(rectsOf(cells));
    }
    // Each wall grows rect by rect (touching the previous ones) so a wall never closes off a pocket.
    const cands = [];
    for (const rects of shuffled(rng, comps)) {
      const left = rects.slice(), order = [left.shift()];
      while (left.length) {
        const i = left.findIndex((r) => order.some((o) => r.x <= o.x + o.w && o.x <= r.x + r.w && r.y <= o.y + o.h && o.y <= r.y + r.h));
        order.push(...left.splice(i < 0 ? 0 : i, 1));
      }
      for (const r of order) { const g = [r]; g.touch = true; cands.push(g); }
    }
    return { cands, target: Math.max(2, Math.ceil(cands.length * Math.min(1, perHalf / 7))) };
  },
  // Reading room: a closed ring around the spawn rug with an opening at the top, bottom, left and right
  // (each 2 cells wide), plus a few shelves outside it.
  reading(rng, perHalf) {
    const half = COLS >> 1, xl = SAFE.x0 - 2, yt = SAFE.y0 - 2, yb = SAFE.y1 + 2;
    const gy = (ROWS >> 1) - 1; // side opening rows gy, gy+1
    const ring = [
      [{ x: xl, y: yt, w: half - 1 - xl, h: 1 }, { x: xl, y: yt + 1, w: 1, h: gy - yt - 1 }],   // top bar + upper side bar (closed corner)
      [{ x: xl, y: yb, w: half - 1 - xl, h: 1 }, { x: xl, y: gy + 2, w: 1, h: yb - gy - 2 }],   // bottom bar + lower side bar
    ];
    const out = [];
    for (let i = 0; i < 14; i++) {
      const horiz = rng.chance(0.4), w = horiz ? rng.int(3, 4) : 1, h = horiz ? 1 : rng.int(3, 5);
      out.push([{ x: rng.int(2, Math.max(2, xl - 2 - w)), y: rng.int(2, ROWS - 2 - h), w, h }]);
    }
    return { cands: [...ring, ...out], target: 2 + Math.max(0, perHalf - 2) };
  },
  // Two continuous shelf walls (edge to edge) split the floor into a centre and two sides,
  // joined by 2-3 gaps of 2 cells each.
  bridge(rng, perHalf) {
    const half = COLS >> 1, wx = rng.int(4, 6), gaps = rng.int(2, 3), gw = 2;
    const room = ROWS - gaps * gw, segs = gaps + 1;
    const cuts = Array.from({ length: segs }, (_, i) => Math.floor(room / segs) + (i < room % segs ? 1 : 0));
    if (rng.chance(0.5)) cuts.reverse();
    const wall = [];
    let y = 0;
    for (const l of cuts) { wall.push({ x: wx, y, w: 1, h: l }); y += l + gw; }
    const extra = [];
    for (let i = 0; i < 12; i++) {
      const horiz = rng.chance(0.6), w = horiz ? rng.int(3, 5) : 1, h = horiz ? 1 : rng.int(2, 4);
      extra.push([{ x: rng.int(wx + 3, Math.max(wx + 3, half - 1 - w)), y: rng.int(2, ROWS - 2 - h), w, h }]);
    }
    return { cands: [wall, ...extra], target: 1 + Math.max(0, perHalf - 1) };
  },
};

/** Greedy decomposition of a set of cell indices into touching rectangles. */
function rectsOf(cells) {
  const set = new Set(cells), done = new Set(), out = [];
  const order = cells.slice().sort((a, b) => a - b);
  for (const c of order) {
    if (done.has(c)) continue;
    const x = c % COLS, y = (c / COLS) | 0;
    let w = 1;
    while (set.has(y * COLS + x + w) && !done.has(y * COLS + x + w) && x + w < COLS) w++;
    let h = 1;
    const rowOk = (yy) => { for (let i = 0; i < w; i++) if (!set.has(yy * COLS + x + i) || done.has(yy * COLS + x + i)) return false; return true; };
    while (y + h < ROWS && rowOk(y + h)) h++;
    for (let yy = y; yy < y + h; yy++) for (let i = 0; i < w; i++) done.add(yy * COLS + x + i);
    out.push({ x, y, w, h });
  }
  return out;
}

/**
 * The passage rule: every free cell sits in a fully free 2x2 block, so there is no 1-cell-wide
 * corridor, notch or pocket anywhere (the 22 px player and 44 px golems always fit through).
 */
export function isWide(solid) {
  const free = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !solid[idx(x, y)];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (solid[idx(x, y)]) continue;
    let ok = false;
    for (const [bx, by] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
      if (free(bx, by) && free(bx + 1, by) && free(bx, by + 1) && free(bx + 1, by + 1)) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

function shapedArena(seed, wave, shelvesPerHalf, shape) {
  const gen = SHAPE_GEN[shape];
  if (!gen) return null;
  const rng = new Rng(hashString(`arena:${seed}:${wave}:${shape}`));
  const perHalf = shelvesPerHalf ?? Math.min(2 + Math.floor((wave + 1) / 2), 6);
  const { cands, target } = gen(rng, perHalf);
  const half = COLS >> 1;
  const solid = new Uint8Array(COLS * ROWS);
  const shelves = [];
  const stamp = (r, v) => {
    for (const sx of [r.x, COLS - r.x - r.w]) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = sx; xx < sx + r.w; xx++) solid[idx(xx, yy)] = v;
  };
  let placed = 0;
  for (const cand of cands) {
    if (placed >= target) break;
    // A candidate is one shelf, or a group of touching shelves forming one wall (L / T joints, corners).
    const group = Array.isArray(cand) ? cand : [cand];
    const pad = group.length === 1 && !group.touch; // a lone shelf keeps the old 2-cell margin from everything else
    let ok = true;
    for (const { x, y, w, h } of group) {
      if (w < 1 || h < 1 || x < 0 || y < 0 || x + w > half || y + h > ROWS || overlapsSafe(x, y, w, h)) { ok = false; break; }
      if (pad && (x < AISLE || y < AISLE || x + w > half - 1 || y + h > ROWS - AISLE)) { ok = false; break; }
      const m = pad ? AISLE : 0;
      for (let yy = Math.max(0, y - m); yy < Math.min(ROWS, y + h + m) && ok; yy++)
        for (let xx = Math.max(0, x - m); xx < Math.min(COLS, x + w + m); xx++) if (solid[idx(xx, yy)]) { ok = false; break; }
      if (!ok) break;
    }
    if (!ok) continue;
    for (const r of group) stamp(r, 1);
    if (!isConnected(solid) || !isWide(solid)) { for (const r of group) stamp(r, 0); continue; }
    for (const r of group) shelves.push(r, { x: COLS - r.x - r.w, y: r.y, w: r.w, h: r.h });
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
