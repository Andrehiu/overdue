// Small, dependency-free helpers shared by the game and its unit tests.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Wrap an angle difference into (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** FNV-1a string hash -> uint32. Used to derive deterministic seeds. */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, good-enough seeded PRNG returning [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG with convenience helpers. Same seed => same sequence. */
export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); } // inclusive
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  /** Pick from [{weight}, ...] proportionally to weight. */
  weighted(items, key = 'weight') {
    const total = items.reduce((s, it) => s + it[key], 0);
    let r = this.next() * total;
    for (const it of items) { r -= it[key]; if (r < 0) return it; }
    return items[items.length - 1];
  }
}

/**
 * Push a circle out of an axis-aligned rectangle.
 * Returns the push normal {nx, ny} when they overlapped (and mutates obj.x/y), else null.
 */
export function pushCircleOutOfRect(obj, r, rect) {
  const cx = clamp(obj.x, rect.x, rect.x + rect.w);
  const cy = clamp(obj.y, rect.y, rect.y + rect.h);
  let dx = obj.x - cx, dy = obj.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    obj.x = cx + nx * r; obj.y = cy + ny * r;
    return { nx, ny };
  }
  // Centre is inside the rect: push out along the axis of least penetration.
  const left = obj.x - rect.x, right = rect.x + rect.w - obj.x;
  const top = obj.y - rect.y, bottom = rect.y + rect.h - obj.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) { obj.x = rect.x - r; return { nx: -1, ny: 0 }; }
  if (m === right) { obj.x = rect.x + rect.w + r; return { nx: 1, ny: 0 }; }
  if (m === top) { obj.y = rect.y - r; return { nx: 0, ny: -1 }; }
  obj.y = rect.y + rect.h + r; return { nx: 0, ny: 1 };
}

/**
 * Corner assist for the player. When a circle moving mostly along one axis is stopped by the corner of a
 * rect that it overlaps by at most `maxSlip` px sideways, slide it sideways past the corner (instead of
 * snagging). `obj` has been moved by (mx, my) this step; `before` is its position beforehand.
 * `maxStep` caps how far one call slides it, so a long snag slides smoothly over a few steps.
 * Returns true when it nudged `obj` (mutates obj.x / obj.y), else false. A head-on hit on a rect's face
 * (overlap bigger than `maxSlip`) or a move that is not mostly along one axis is left alone.
 */
export function cornerAssist(obj, before, r, rect, maxSlip = 8, maxStep = maxSlip) {
  const mx = obj.x - before.x, my = obj.y - before.y;
  const ax = Math.abs(mx), ay = Math.abs(my);
  if (ax < 1e-6 && ay < 1e-6) return false;
  if (ax >= ay * 2) {
    // Moving along x: would it hit the rect's left/right face? How far does the circle's y overlap the rect's top/bottom edge?
    const hitsX = mx > 0 ? obj.x + r > rect.x && before.x + r <= rect.x + 1e-6 && obj.x < rect.x + rect.w
                         : obj.x - r < rect.x + rect.w && before.x - r >= rect.x + rect.w - 1e-6 && obj.x > rect.x;
    if (!hitsX) return false;
    const overTop = obj.y + r - rect.y, overBottom = rect.y + rect.h - (obj.y - r);
    if (overTop > 0 && overTop <= maxSlip) { obj.y -= Math.min(overTop, maxStep); return true; }   // clip the top corner: slide up
    if (overBottom > 0 && overBottom <= maxSlip) { obj.y += Math.min(overBottom, maxStep); return true; } // clip the bottom corner: slide down
    return false;
  }
  if (ay >= ax * 2) {
    const hitsY = my > 0 ? obj.y + r > rect.y && before.y + r <= rect.y + 1e-6 && obj.y < rect.y + rect.h
                         : obj.y - r < rect.y + rect.h && before.y - r >= rect.y + rect.h - 1e-6 && obj.y > rect.y;
    if (!hitsY) return false;
    const overLeft = obj.x + r - rect.x, overRight = rect.x + rect.w - (obj.x - r);
    if (overLeft > 0 && overLeft <= maxSlip) { obj.x -= Math.min(overLeft, maxStep); return true; }
    if (overRight > 0 && overRight <= maxSlip) { obj.x += Math.min(overRight, maxStep); return true; }
  }
  return false;
}

/**
 * Which source steers the throw this frame (pure, so it is unit-tested).
 *  'pad'   right stick held · 'touch' the aim stick is deflected (touchAiming) · 'auto' nearest-enemy aim · 'mouse' follow the cursor
 *  'none'  auto-aim is off and nothing is being aimed: don't aim, don't throw (touch / gamepad only)
 * `autoaim` is the player's setting; the balance bot always auto-aims.
 */
export function aimSource({ autoaim, bot, touchEnabled, touchAiming, padConnected, padStick, mouseSeen }) {
  if (padConnected && padStick) return 'pad';
  if (touchAiming) return 'touch'; // touchAiming = the aim stick is deflected past its deadzone (see aimStick)
  if (touchEnabled || bot || (padConnected && !mouseSeen)) return (autoaim || bot) ? 'auto' : 'none';
  return 'mouse';
}

/**
 * The floating aim stick (v1.10.2), pure so it is unit-tested. The drag vector from where the finger landed (ox, oy) to where it is now
 * (x, y) is the aim: `deflected` once it is longer than `dead`, `angle` = atan2 of the drag. Where the player stands is irrelevant.
 */
export function aimStick(ox, oy, x, y, dead) {
  const dx = x - ox, dy = y - oy;
  return { deflected: Math.hypot(dx, dy) > dead, angle: Math.atan2(dy, dx) };
}
