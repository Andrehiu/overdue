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
 * 16:9 desktop -> 32x18, iPad landscape -> 28x20. Narrower screens get the 4:3 shape (letterboxed); wider ones (phones) widen up to ~2.2:1.
 * Keeps roughly the same number of cells (same amount of room to play) and an even column count.
 */
export function gridForAspect(aspect, story = false) {
  const [lc, lr] = legacyGrid(aspect);
  if (!story) return [lc, lr];
  return storyGrid(aspect, lr);
}

/**
 * v1.14.0: story rooms are ~20% longer on every side than the legacy grid (the same screen shape, so no bars).
 * Rows = legacy rows x 1.2; columns follow the screen's aspect (even). Endless keeps the legacy grid.
 */
export const ROOM_SCALE = 1.2;
function storyGrid(aspect, legacyRows) {
  const a = clamp(aspect || 16 / 9, 4 / 3, WIDE_MAX);
  const r0 = Math.round(legacyRows * ROOM_SCALE);
  let best = null; // stay near r0 rows, but within 2.5% of the screen's shape (no black bars)
  for (const rows of [r0 - 1, r0, r0 + 1]) {
    const cols = clamp(Math.round((rows * a) / 2) * 2, 24, 48);
    const miss = Math.abs(cols / rows / a - 1);
    const cost = (miss > 0.025 ? 1000 : 0) + Math.abs(rows - r0) * 20 + miss * 100;
    if (!best || cost < best.cost) best = { cols, rows, cost };
  }
  return [best.cols, best.rows];
}

/** How much bigger than the 576-cell legacy room this grid is (>= 1). Scales story shelf counts. */
export const areaK = () => Math.max(1, (COLS * ROWS) / 576);

/** The grid before v1.14.0: endless mode always uses it, and story HUD scale is measured against it. */
function legacyGrid(aspect) {
  const a = clamp(aspect || 16 / 9, 4 / 3, WIDE_MAX); // landscape only since v1.4.0: never a portrait grid
  if (a > 32 / 18) { // phones (~2:1 to 2.2:1): follow the screen's shape so there are no side bars (v1.11.1)
    let best = null; // within 2.5% of the screen's shape, keep the cell count nearest today's 576
    for (const rows of [16, 17, 18]) {
      const cols = clamp(Math.round((rows * a) / 2) * 2, 32, 40);
      const miss = Math.abs(cols / rows / a - 1);
      const cost = (miss > 0.025 ? 1000 : 0) + Math.abs(cols * rows - 576) + miss * 100;
      if (!best || cost < best.cost) best = { cols, rows, cost };
    }
    return [best.cols, best.rows];
  }
  let rows = Math.round(Math.sqrt(576 / a));
  let cols = Math.round((rows * a) / 2) * 2;
  cols = clamp(cols, 18, 32); rows = clamp(rows, 18, 32);
  return [cols, rows];
}

/** Widest screen shape the arena follows (iPhone landscape is about 2.0 to 2.17). */
const WIDE_MAX = 2.2;

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
  if (WATER_SHAPES.includes(shape)) {
    const a = waterArena(seed, wave, shelvesPerHalf, shape);
    if (a) return a;
    shape = 'pillars';   // never happens in practice: fall back to a dry open room
  }
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
      const merged = mergeRects(shelves);
  const rects = merged.map((s) => ({ x: s.x * CELL, y: s.y * CELL, w: s.w * CELL, h: s.h * CELL }));
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
/** Act II (v1.16.0): shapes with deep water. `arena.water` marks the cells, `arena.walk` = shelves + water (what walkers can't enter). */
export const WATER_SHAPES = ['causeway', 'islands'];

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
  // (each 4 cells wide), plus a few shelves outside it.
  reading(rng, perHalf) {
    const half = COLS >> 1, xl = SAFE.x0 - 2, yt = SAFE.y0 - 2, yb = SAFE.y1 + 2;
    const gy = (ROWS >> 1) - 2; // side opening rows gy .. gy+3
    const ring = [
      [{ x: xl, y: yt, w: half - 2 - xl, h: 1 }, { x: xl, y: yt + 1, w: 1, h: gy - yt - 1 }],   // top bar + upper side bar (closed corner)
      [{ x: xl, y: yb, w: half - 2 - xl, h: 1 }, { x: xl, y: gy + 4, w: 1, h: yb - gy - 4 }],   // bottom bar + lower side bar
    ];
    const out = [];
    for (let i = 0, n = Math.round(14 * areaK()); i < n; i++) {
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
    for (let i = 0, n = Math.round(12 * areaK()); i < n; i++) {
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

/**
 * Merge shelf rects (grid cells) that sit on the same row or column and touch or overlap, so a wall built
 * from several pieces is one continuous shelf when drawn. Same cells covered, so `solid` is unaffected.
 */
export function mergeRects(list) {
  const rs = list.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.y === b.y && a.h === b.h && a.x <= b.x + b.w && b.x <= a.x + a.w) {
        const x = Math.min(a.x, b.x); a.w = Math.max(a.x + a.w, b.x + b.w) - x; a.x = x;
      } else if (a.x === b.x && a.w === b.w && a.y <= b.y + b.h && b.y <= a.y + a.h) {
        const y = Math.min(a.y, b.y); a.h = Math.max(a.y + a.h, b.y + b.h) - y; a.y = y;
      } else continue;
      rs.splice(j, 1); again = true; break outer;
    }
  }
  return rs;
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
  const merged = mergeRects(shelves);
  const rects = merged.map((s) => ({ x: s.x * CELL, y: s.y * CELL, w: s.w * CELL, h: s.h * CELL }));
  return { seed, wave, shape, shelves: merged, rects, solid };
}


// ---- Water rooms (Act II). Deep water is not walkable for the player or walking enemies; books, pages and
// line of sight fly over it (only shelves and walls block those). Stone walkways always connect every dry cell.
// The result keeps `solid` = shelves only (LOS, books, pages) and adds `water`, `walk` (= solid | water, for
// walkers and the flow field) and `wrects` (shelf + water rects, for wall collision). Layouts are mirrored left/right.
const mirrorRect = (r) => ({ x: COLS - r.x - r.w, y: r.y, w: r.w, h: r.h });

function waterMask(rng, shape) {
  const half = COLS >> 1, cy = ROWS >> 1, water = new Uint8Array(COLS * ROWS);
  const fill = (x, y, w, h, v = 1) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= half || yy >= ROWS) continue;
      water[idx(xx, yy)] = v; water[idx(COLS - 1 - xx, yy)] = v;
    }
  };
  if (shape === 'causeway') {
    // One long walkway across the middle; a pool above and below with a stone shore all round; peninsulas
    // (side platforms) stick out from the walkway into the pools and piers cross them.
    const top = 2, topH = cy - 3 - top, bot = cy + 3, botH = ROWS - 2 - bot;
    fill(2, top, half - 2, topH); fill(2, bot, half - 2, botH);
    const slots = [];
    for (let x = 4; x <= half - 6; x += 5) slots.push(x);
    const pick = shuffled(rng, slots);
    pick.slice(0, Math.max(2, Math.ceil(slots.length * 0.6))).forEach((x) => {
      const w = rng.int(3, 4), up = rng.int(2, Math.max(2, topH - 1)), dn = rng.int(2, Math.max(2, botH - 1));
      if (rng.chance(0.5)) fill(x, cy - 3 - up, w, up, 0);
      if (rng.chance(0.65)) fill(x, bot, w, dn, 0);
    });
    // One pier all the way across each pool, so the shore ring is reachable from the walkway too.
    const px = rng.int(4, Math.max(4, half - 8));
    fill(px, top, 3, topH, 0); fill(px, bot, 3, botH, 0);
  } else {
    // islands: shoreline columns left and right, a big centre island and one or two island pairs, joined by 2-wide bridges.
    fill(2, 0, half - 2, ROWS);                                   // everything but the two shore columns is water...
    const ix = SAFE.x0 - 3, iy = cy - 5;
    fill(ix, iy, half - ix, 10, 0);                               // ...except the centre island (mirrors into one block)
    const n = rng.chance(0.4) ? 2 : 1;
    const ys = n === 1 ? [rng.chance(0.5) ? 3 : ROWS - 8] : [3, ROWS - 8];
    for (const y of ys) {
      const x = rng.int(5, Math.max(5, ix - 7)), w = rng.int(5, 6), h = 5;
      fill(x, y, w, h, 0);
      const bx = x + 1 + rng.int(0, w - 4);                       // bridge down/up from the island to the centre island
      if (y < cy) fill(bx, y + h, 2, iy - (y + h), 0); else fill(bx, iy + 10, 2, y - (iy + 10), 0);
      fill(2 - 2, y + 1, x, 2, 0);                                // bridge from the island to its shore
    }
    // the centre island always reaches the shore: one 2-wide causeway on the centre row
    fill(0, cy - 1, ix, 2, 0);
  }
  return water;
}

function waterArena(seed, wave, shelvesPerHalf, shape) {
  const rng = new Rng(hashString(`arena:${seed}:${wave}:${shape}`));
  const water = waterMask(rng, shape);
  const walk = new Uint8Array(COLS * ROWS);
  walk.set(water);
  const half = COLS >> 1, shelves = [];
  // The mask must itself be valid (connected, no 1-wide notch); otherwise let the caller fall back.
  if (!isConnected(walk) || !isWide(walk)) return null;
  const solid = new Uint8Array(COLS * ROWS);
  const perHalf = Math.max(1, Math.round((shelvesPerHalf ?? 4) * 0.6));
  const cands = [];
  for (let i = 0; i < 40; i++) {
    const horiz = rng.chance(0.55), w = horiz ? rng.int(3, 5) : 1, h = horiz ? 1 : rng.int(2, 4);
    cands.push({ x: rng.int(2, Math.max(2, half - 1 - w)), y: rng.int(2, ROWS - 2 - h), w, h });
  }
  let placed = 0;
  for (const r of cands) {
    if (placed >= perHalf) break;
    if (r.x + r.w > half - 1 || overlapsSafe(r.x, r.y, r.w, r.h)) continue;
    let ok = true;
    // a shelf stands on dry stone only, with a 2-cell margin from other shelves; isWide(walk) below keeps every passage 2+ cells wide
    for (let yy = Math.max(0, r.y - AISLE); yy < Math.min(ROWS, r.y + r.h + AISLE) && ok; yy++)
      for (let xx = Math.max(0, r.x - AISLE); xx < Math.min(COLS, r.x + r.w + AISLE); xx++) {
        const inside = yy >= r.y && yy < r.y + r.h && xx >= r.x && xx < r.x + r.w;
        if (inside ? water[idx(xx, yy)] : solid[idx(xx, yy)]) { ok = false; break; }
      }
    if (!ok) continue;
    for (const s of [r, mirrorRect(r)]) for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) { solid[idx(xx, yy)] = 1; walk[idx(xx, yy)] = 1; }
    if (!isConnected(walk) || !isWide(walk)) {
      for (const s of [r, mirrorRect(r)]) for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) { solid[idx(xx, yy)] = 0; walk[idx(xx, yy)] = water[idx(xx, yy)]; }
      continue;
    }
    shelves.push(r, mirrorRect(r));
    placed++;
  }
  const px = (list) => list.map((s) => ({ x: s.x * CELL, y: s.y * CELL, w: s.w * CELL, h: s.h * CELL }));
  const merged = mergeRects(shelves);
  const rects = px(merged);
  const waterRects = px(rectsOf(Array.from(water.keys()).filter((i) => water[i])));
  return { seed, wave, shape, shelves: merged, rects, solid, water, walk, waterRects, wrects: [...rects, ...waterRects] };
}

/** Free cells on the outer ring, used as enemy entry points (pass `arena.walk || arena.solid` so water cells are skipped). */
export function edgeCells(solid) {
  const out = [];
  for (let x = 0; x < COLS; x++) for (const y of [0, ROWS - 1]) if (!solid[idx(x, y)]) out.push([x, y]);
  for (let y = 1; y < ROWS - 1; y++) for (const x of [0, COLS - 1]) if (!solid[idx(x, y)]) out.push([x, y]);
  return out;
}
