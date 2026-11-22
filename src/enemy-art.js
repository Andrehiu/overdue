// Enemy art prototypes (v1.12.0 proposal). URL switch: ?art=a|b|c  (&eyes=1 adds glowing eyes in the dark).
//   a = Shapes      (Direction 1 "Shape Alphabet": own silhouette per type, size ladder, elite = gold outline)
//   b = Characters  (Direction 2 "Cast of Characters": own face language per type)
//   c = Blend       (b's characters on a's silhouettes and size ladder, + bunny hop + patron ripple)
// Without the flag nothing here runs and drawEnemy() in main.js draws today's look.
// A later session deletes the two losing options; keep the option branches easy to find (look for `opt === 'a'` etc).
//
// Pure canvas code. Every body is pre-rendered ONCE into an offscreen canvas (per option / type / elite / flash state)
// and then drawn with drawImage + a transform, so there is no shadowBlur / filter / path rebuild per enemy per frame.
// Hitboxes are untouched: only the drawing size changes (visual R below, DEF.r in main.js stays).

const TAU = Math.PI * 2;
const OL = '#120a06';
const GOLD = '#ffd54a';
const RED = '#ff4d5e';
const SS = 3; // sprite pixel density (3x covers a 3x iPhone)

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const artParam = q.get('art');
/** null (today's look) or 'a' | 'b' | 'c'. */
export const ART = artParam === 'a' || artParam === 'b' || artParam === 'c' ? artParam : null;
/** Glowing eyes above the light layer. Only with an art option. */
export const EYES = !!ART && q.get('eyes') === '1';

/** Death-burst colours for the types whose hue changed (the rest keep main.js's own). */
export const ART_BURST = { bunny: ['#c98a9e', '#7a3f55'], notice: ['#f7c9c4', '#b3202e'], worm: ['#e0607f', '#ff8fb1'] };

// ---------------------------------------------------------------- sprite cache helpers
const cache = new Map();
function canvas(half) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(half * 2 * SS);
  c.half = half;
  return c;
}
/** Render `draw(g)` centred at (0,0) into a cached offscreen canvas. */
function spr(key, half, draw) {
  let c = cache.get(key);
  if (!c) {
    c = canvas(half);
    const g = c.getContext('2d');
    g.scale(SS, SS); g.translate(half, half);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    cache.set(key, c);
  }
  return c;
}
/** Same shape filled with one colour (hit flash = white, elite outline = gold/red). */
function tint(src, color) {
  const c = canvas(src.half), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function white(c) { return c._w || (c._w = tint(c, '#fff')); }
/** Silhouette grown by `grow` px in `color` (drawn 16 times around a ring, once, at load). */
function outlineOf(c, color, grow = 2.5) {
  const half = c.half + grow + 1, o = canvas(half), g = o.getContext('2d');
  const off = (half - c.half) * SS;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    g.drawImage(c, off + Math.cos(a) * grow * SS, off + Math.sin(a) * grow * SS);
  }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, o.width, o.height);
  return o;
}
const goldOf = (c) => c._g || (c._g = outlineOf(c, GOLD));
const redOf = (c) => c._r || (c._r = outlineOf(c, RED));
function put(ctx, c, s = 1) { ctx.drawImage(c, -c.half * s, -c.half * s, c.half * 2 * s, c.half * 2 * s); }

// ---------------------------------------------------------------- shape helpers (inside sprites)
const LW = 3.4; // black outline = LW/2 visible px
function shape(g, fill, path, lw = LW) {
  g.beginPath(); path(g);
  if (lw) { g.lineWidth = lw; g.strokeStyle = OL; g.stroke(); }
  g.fillStyle = fill; g.fill();
}
const circ = (g, x, y, r, fill, lw = LW) => shape(g, fill, (g2) => g2.arc(x, y, r, 0, TAU), lw);
const ell = (g, x, y, rx, ry, rot, fill, lw = LW) => shape(g, fill, (g2) => g2.ellipse(x, y, rx, ry, rot, 0, TAU), lw);
const rrect = (g, x, y, w, h, r, fill, lw = LW) => shape(g, fill, (g2) => g2.roundRect(x, y, w, h, r), lw);
function dot(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

/** Bead / dot eye. Elites get a red iris in the type's own eye style. */
function bead(g, x, y, r, elite, base = OL) {
  if (elite) { dot(g, x, y, r + 0.7, '#ff3b4e'); dot(g, x, y, r * 0.5, OL); } else dot(g, x, y, r, base);
}

// ---------------------------------------------------------------- bunny
function starPath(g, R, r, n = 6) {
  // soft star: each outer tip is a quadratic curve whose control point is the tip itself (blunt points)
  const pt = (i) => { const o = i % 2 === 0, a = (i / (n * 2)) * TAU - Math.PI / 2, rr = o ? R : r; return [Math.cos(a) * rr, Math.sin(a) * rr]; };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const N = n * 2;
  const start = mid(pt(N - 1), pt(0));
  g.moveTo(start[0], start[1]);
  for (let i = 0; i < N; i += 2) {
    const tip = pt(i), inner = pt(i + 1), m = mid(tip, inner);
    g.quadraticCurveTo(tip[0], tip[1], m[0], m[1]);
    const nxt = mid(inner, pt(i + 2));
    g.lineTo(inner[0], inner[1]); g.lineTo(nxt[0], nxt[1]);
  }
  g.closePath();
}
function bunnyA(g, k, elite) {
  const R = 9.4 * k;
  shape(g, '#c98a9e', (g2) => starPath(g2, R, R * 0.6));
  g.fillStyle = 'rgba(122,63,85,0.45)'; g.beginPath(); starPath(g, R * 0.5, R * 0.3); g.save(); g.translate(R * 0.12, R * 0.18); g.fill(); g.restore();
  for (const s of [-1, 1]) { dot(g, s * R * 0.28, -R * 0.08, 1.7, '#fff'); if (elite) dot(g, s * R * 0.28, -R * 0.08, 0.9, '#ff3b4e'); }
}
function bunnyB(g, k, elite) {
  const R = 9 * k;
  for (const s of [-1, 1]) { // long ears (up, away from centre)
    ell(g, s * 0.4 * R, -1.05 * R, 0.3 * R, 0.75 * R, s * 0.2, '#c98a9e');
    ell(g, s * 0.4 * R, -1.05 * R, 0.13 * R, 0.5 * R, s * 0.2, '#e8b4c3', 0);
  }
  circ(g, 0, 0.82 * R, 2.4 * k, '#f2e2e7', 2.4); // dust tail puff
  // fluffy ball: 5 lumps + core, outline as one silhouette
  const lumps = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; lumps.push([Math.cos(a) * 0.42 * R, Math.sin(a) * 0.42 * R, 0.46 * R]); }
  lumps.push([0, 0, 0.62 * R]);
  g.fillStyle = OL; for (const [x, y, r] of lumps) { g.beginPath(); g.arc(x, y, r + 1.7, 0, TAU); g.fill(); }
  g.fillStyle = '#c98a9e'; for (const [x, y, r] of lumps) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(122,63,85,0.35)'; g.beginPath(); g.arc(0.25 * R, 0.4 * R, 0.5 * R, 0, TAU); g.fill();
  ell(g, 0, 0.12 * R, 0.55 * R, 0.38 * R, 0, '#e8b4c3', 0); // lighter face patch
  for (const s of [-1, 1]) bead(g, s * 0.27 * R, 0.08 * R, 1.6, elite);
}

// ---------------------------------------------------------------- notice
function noticeBody(g, k, opt, elite) {
  const R = 11 * k, hw = 0.9 * R, hh = 1.2 * R, f = 0.5 * R; // half width / half height, fold leg
  const paper = '#f7c9c4';
  // slip with a folded top-right corner (a, c); plain slip (b)
  const fold = opt !== 'b';
  shape(g, paper, (g2) => {
    g2.moveTo(-hw, -hh);
    if (fold) { g2.lineTo(hw - f, -hh); g2.lineTo(hw, -hh + f); } else g2.lineTo(hw, -hh);
    g2.lineTo(hw, hh); g2.lineTo(-hw, hh); g2.closePath();
  });
  if (fold) shape(g, '#d99a95', (g2) => { g2.moveTo(hw - f, -hh); g2.lineTo(hw - f, -hh + f); g2.lineTo(hw, -hh + f); g2.closePath(); }, 1.6);
  if (opt === 'a') {
    g.fillStyle = '#b3202e'; g.fillRect(-hw + 2, -2, hw * 2 - 4, 5.5 * k); // "OVERDUE" bar
    g.fillStyle = '#f7c9c4'; for (let i = 0; i < 5; i++) g.fillRect(-hw + 3.4 + i * (hw * 2 - 7) / 5, -0.4 * k + 0.2, (hw * 2 - 7) / 5 - 1, 2 * k);
    g.fillStyle = '#c99a96'; g.fillRect(-hw + 2.5, -hh + 3, hw * 1.0, 1.5); g.fillRect(-hw + 2.5, hh - 5, hw * 1.5, 1.5);
  } else {
    // one big angry eye + slanted brow + DUE stamp
    const ey = -0.28 * R;
    dot(g, 0, ey, 0.36 * R, '#fff'); g.strokeStyle = OL; g.lineWidth = 1; g.beginPath(); g.arc(0, ey, 0.36 * R, 0, TAU); g.stroke();
    dot(g, 0.5 * k, ey + 0.4 * k, 0.19 * R, elite ? '#ff3b4e' : '#b3202e');
    dot(g, 0.5 * k, ey + 0.4 * k, 0.07 * R, OL);
    g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-0.5 * R, ey - 0.62 * R); g.lineTo(0.42 * R, ey - 0.3 * R); g.stroke();
    g.save(); g.translate(0, 0.62 * R); g.rotate(-0.2);
    g.strokeStyle = '#b3202e'; g.lineWidth = 1.1; g.strokeRect(-0.62 * R, -0.28 * R, 1.24 * R, 0.56 * R);
    g.fillStyle = '#b3202e'; g.font = `bold ${3.9 * k}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('DUE', 0, 0.3); g.restore();
  }
}

// ---------------------------------------------------------------- patron (faces +x; the sprite is rotated toward the player)
function patronShoulders(g, k) {
  const R = 17 * k;
  ell(g, -0.12 * R, 0, 0.52 * R, 1.0 * R, 0, '#c2571f');
  ell(g, -0.12 * R, 0, 0.3 * R, 0.8 * R, 0, '#d6682a', 0);
}
function patronHead(g, k, opt, elite, shout) {
  const R = 17 * k, hr = (opt === 'a' ? 0.5 : 0.56) * R, hx = 0.2 * R;
  circ(g, hx, 0, hr, '#ff9f43');
  g.fillStyle = 'rgba(184,92,18,0.4)'; g.beginPath(); g.arc(hx - hr * 0.2, hr * 0.25, hr * 0.7, 0.2, 2.6); g.fill();
  if (opt === 'b' || opt === 'c') {
    for (const s of [-1, 1]) { // half-closed eyes: flat arcs (red iris line on elites)
      g.strokeStyle = elite ? '#ff3b4e' : OL; g.lineWidth = 1.5; g.beginPath(); g.arc(hx + hr * 0.1, s * hr * 0.42, hr * 0.2, 0, Math.PI); g.stroke();
    }
    if (shout) { g.fillStyle = '#3a0d0d'; g.beginPath(); g.roundRect(hx + hr * 0.3, -hr * 0.55, hr * 0.62, hr * 1.1, 1); g.fill(); }
    else { g.fillStyle = '#3a0d0d'; g.beginPath(); g.ellipse(hx + hr * 0.58, 0, hr * 0.26, hr * 0.38, 0, 0, TAU); g.fill(); }
    if (shout) { // "))" sound arcs in front of the mouth
      g.strokeStyle = '#ff9f43'; g.lineWidth = 1.3;
      for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(hx + hr * 0.9, 0, hr * (0.55 + i * 0.4), -0.7, 0.7); g.stroke(); }
    }
  } else { // a: a mouth and nothing else
    g.fillStyle = '#3a0d0d'; g.beginPath(); g.ellipse(hx + hr * 0.4, 0, hr * 0.34, hr * 0.5, 0, 0, TAU); g.fill();
  }
}
function patronPhone(g, k) {
  const R = 17 * k;
  g.fillStyle = OL; g.beginPath(); g.roundRect(0.28 * R, 0.62 * R, 0.3 * R, 0.5 * R, 1); g.fill();
  g.fillStyle = '#6a5a58'; g.fillRect(0.32 * R, 0.68 * R, 0.22 * R, 0.14 * R);
}

// ---------------------------------------------------------------- worm
function wormHead(g, k, opt, elite) {
  const R = 11 * k; // 1.1 x visual radius 10
  circ(g, 0, 0, R, '#ff8fb1');
  g.fillStyle = 'rgba(179,77,109,0.4)'; g.beginPath(); g.arc(-R * 0.15, R * 0.3, R * 0.7, 0.2, 2.7); g.fill();
  if (opt === 'a') {
    for (const s of [-1, 1]) { dot(g, R * 0.36, s * R * 0.42, 2, '#fff'); bead(g, R * 0.42, s * R * 0.42, 1.1, elite); }
  } else { // round reading glasses
    g.strokeStyle = OL; g.lineWidth = 1.3;
    for (const s of [-1, 1]) {
      dot(g, R * 0.3, s * R * 0.42, R * 0.3, '#ffe9f0');
      g.beginPath(); g.arc(R * 0.3, s * R * 0.42, R * 0.3, 0, TAU); g.stroke();
      bead(g, R * 0.36, s * R * 0.42, 1.2, elite);
    }
    g.beginPath(); g.moveTo(R * 0.3, -R * 0.12); g.lineTo(R * 0.3, R * 0.12); g.stroke();
    g.beginPath(); g.moveTo(R * 0.3, -R * 0.7); g.lineTo(-R * 0.4, -R * 0.78); g.moveTo(R * 0.3, R * 0.7); g.lineTo(-R * 0.4, R * 0.78); g.stroke();
  }
}
const SPINE = ['#e0607f', '#c94a6a'];
function wormSpine(g, alt) { // option b: one book spine, long axis along +x
  rrect(g, -10, -7, 20, 14, 3, SPINE[alt]);
  g.fillStyle = '#7a2a40'; g.fillRect(-1, -6, 1.2, 12); g.fillRect(5, -6, 1, 12); g.fillRect(-7, -6, 1, 12);
  g.fillStyle = 'rgba(255,200,215,0.35)'; g.fillRect(-8, -5.5, 16, 1.4);
}
const wormRad = (depth) => 9 - depth * 0.33; // tube radius: 9 at the head tapering to 7

// ---------------------------------------------------------------- golem
function golemA(g, k) { // today's square, plus two feet
  const s = 22.5 * k;
  rrect(g, -s * 0.62, s * 0.8, s * 0.32, s * 0.3, 2, '#6b4f0c');
  rrect(g, s * 0.3, s * 0.8, s * 0.32, s * 0.3, 2, '#6b4f0c');
  rrect(g, -s, -s, s * 2, s * 2, 8 * k, '#b8860b');
  g.fillStyle = 'rgba(255,226,170,0.35)'; g.fillRect(-s * 0.8, -s * 0.95, s * 1.45, 2);
  g.strokeStyle = '#6b4f0c'; g.lineWidth = 2.6; g.beginPath(); g.roundRect(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4, 6 * k); g.stroke();
  g.fillStyle = '#6b4f0c'; g.font = `bold ${22 * k}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 4 * k);
  for (const sx of [-1, 1]) { dot(g, sx * 8 * k, -10 * k, 3, '#ffef9f'); dot(g, sx * 8 * k, -10 * k, 1.2, OL); }
}
function golemStack(g, k, elite) { // b / c: three ledgers
  const w = 46 * k, h = 15.5 * k, X = [-1.5, 2, -0.5], Y = [-23 * k, -7.5 * k, 8 * k], C = ['#b8860b', '#9a700a', '#b8860b'];
  for (let i = 0; i < 3; i++) {
    rrect(g, -w / 2 + X[i], Y[i], w, h, 4 * k, C[i]);
    g.fillStyle = 'rgba(255,226,170,0.32)'; g.fillRect(-w / 2 + X[i] + 4, Y[i] + 2, w - 12, 1.8);
    g.fillStyle = '#6b4f0c'; g.fillRect(-w / 2 + X[i] + 3, Y[i] + h - 4, w - 6, 1.4); // page edge
  }
  g.fillStyle = '#6b4f0c'; g.font = `bold ${14 * k}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', X[2], Y[2] + h * 0.52);
  for (const sx of [-1, 1]) { // slot eyes set into the top book
    g.fillStyle = elite ? '#ff3b4e' : '#ffef9f'; g.fillRect(sx * 8 * k - 3 + X[0], Y[0] + h * 0.5 - 1.2, 6, 2.4);
  }
}

// ---------------------------------------------------------------- coin
function coinBody(g, k) {
  circ(g, 0, 0, 7 * k, '#ffd54a');
  g.strokeStyle = '#b8860b'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 5.2 * k, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-3 * k, -3.4 * k, 2 * k, 1.3);
}
function coinFace(g, k, elite) {
  for (const s of [-1, 1]) dot(g, s * 2 * k, -1 * k, 0.8, elite ? '#ff3b4e' : '#6b4f0c');
  g.strokeStyle = '#6b4f0c'; g.lineWidth = 0.9; g.beginPath(); g.arc(0.4 * k, 1.2 * k, 2.4 * k, 0.2, Math.PI - 0.5); g.stroke();
}

// ---------------------------------------------------------------- crown (elites)
function crownSprite() {
  return spr('crown', 9, (g) => {
    g.fillStyle = GOLD; g.strokeStyle = OL; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-7, 5); g.lineTo(-7, -2); g.lineTo(-3.5, 1.5); g.lineTo(0, -4); g.lineTo(3.5, 1.5); g.lineTo(7, -2); g.lineTo(7, 5); g.closePath();
    g.fill(); g.stroke();
  });
}

// ---------------------------------------------------------------- sprite sets
/** Everything cached for one (option, type, elite). `top` = how far above the centre the silhouette reaches (crown height). */
function setFor(opt, type, elite, head) {
  const key = `${opt}|${type}|${elite ? 'e' : 'n'}${type === 'worm' ? (head ? 'h' : 's') : ''}`;
  let s = cache.get(key);
  if (s) return s;
  const k = elite ? 1.25 : 1, id = (n) => `${key}|${n}`;
  s = { top: 12 * k };
  switch (type) {
    case 'bunny': {
      const half = (opt === 'a' ? 12 : 17) * k;
      s.body = spr(id('b'), half, (g) => (opt === 'a' ? bunnyA(g, k, elite) : bunnyB(g, k, elite)));
      s.top = (opt === 'a' ? 9.4 : 15) * k;
      break;
    }
    case 'notice':
      s.body = spr(id('b'), 15 * k, (g) => noticeBody(g, k, opt, elite));
      s.top = 13.2 * k;
      break;
    case 'patron': {
      const half = 22 * k;
      s.shoulders = spr(id('s'), half, (g) => patronShoulders(g, k));
      s.head = spr(id('h'), half, (g) => patronHead(g, k, opt, elite, false));
      s.shout = spr(id('hs'), half, (g) => patronHead(g, k, opt, elite, true));
      s.phone = opt === 'a' ? null : spr(id('p'), half, (g) => patronPhone(g, k));
      // composite, only to cut the elite outline from
      s.body = spr(id('b'), half, (g) => { patronShoulders(g, k); patronHead(g, k, opt, elite, false); if (s.phone) patronPhone(g, k); });
      s.top = 17 * k;
      break;
    }
    case 'worm': {
      if (head) { s.body = spr(id('b'), 18 * k, (g) => wormHead(g, k, opt, elite)); s.top = 11 * k; }
      else if (opt === 'b') { s.spine = [spr(id('s0'), 13 * k, (g) => wormSpine(g, 0)), spr(id('s1'), 13 * k, (g) => wormSpine(g, 1))]; s.top = 8; }
      break;
    }
    case 'golem': {
      const half = 32 * k;
      s.body = spr(id('b'), half, (g) => (opt === 'a' ? golemA(g, k) : golemStack(g, k, elite)));
      s.top = (opt === 'a' ? 22.5 : 24) * k;
      break;
    }
    case 'coin':
      s.body = spr(id('b'), 10 * k, (g) => coinBody(g, k));
      s.face = opt === 'a' ? null : spr(id('f'), 10 * k, (g) => coinFace(g, k, elite));
      s.top = 8 * k;
      break;
    default: return null;
  }
  cache.set(key, s);
  return s;
}

function bodyWithOutline(ctx, c, e, flash, warn) {
  if (e.elite) {
    const o = warn ? redOf(c) : goldOf(c);
    ctx.globalAlpha = warn ? 0.95 : 0.8 + Math.sin(e.t * 5) * 0.12;
    put(ctx, o, warn ? 1 + Math.sin(e.t * 40) * (1.5 / o.half) : 1);
    ctx.globalAlpha = 1;
  }
  put(ctx, flash ? white(c) : c);
}

/** Bunny hop height (px) for options b/c. */
const hopY = (e) => -Math.abs(Math.sin(e.t * 9)) * 4;
/** Ground-shadow scale for the shared shadow pass in main.js (the hop's shadow shrinks at the top of each hop). */
export function artShadowK(e) {
  if (e.type === 'bunny' && (ART === 'b' || ART === 'c')) return 1 - 0.3 * Math.abs(Math.sin(e.t * 9));
  return 1;
}

// ---------------------------------------------------------------- the enemy dispatcher
const depthOf = (e) => { if (e._d === undefined) { let d = 0, l = e.leader; while (l && d < 8) { d++; l = l.leader; } e._d = d; } return e._d; };
const isHead = (e) => !e.leader || e.leader.dead;

/**
 * Draw one enemy (not the boss) in the chosen art option. env = { player, playing }.
 * Worm bodies in options a and c are drawn by drawArtWorms() as one tube; here only their heads.
 */
export function drawArtEnemy(ctx, e, env) {
  const opt = ART, type = e.type;
  if (type === 'worm' && !isHead(e) && opt !== 'b') return;
  const flash = e.flash > 0;
  const warn = !!e.elite && e.shootT !== undefined && e.shootT < 0.4 && env.playing;
  const look = Math.atan2(env.player.y - e.y, env.player.x - e.x);
  const set = setFor(opt, type, !!e.elite, type === 'worm' && isHead(e));
  if (!set) return;
  let lift = 0;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.stun > 0) ctx.rotate(Math.sin(e.t * 20) * 0.15);
  switch (type) {
    case 'bunny':
      if (opt === 'a') {
        const sq = 1 + Math.sin(e.t * 10) * 0.08;
        ctx.rotate(e.t * 0.8); ctx.scale(1 / sq, sq);
      } else { lift = hopY(e); ctx.translate(0, lift); }
      bodyWithOutline(ctx, set.body, e, flash, warn);
      break;
    case 'notice':
      ctx.rotate(Math.sin(e.t * 6) * (opt === 'a' ? 0.5 : 0.35));
      ctx.scale(Math.max(0.75, Math.abs(Math.cos(e.t * 4)) * 0.5 + 0.6), 1);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      break;
    case 'patron': {
      const ch = e.atkT < 0.5 ? (0.5 - e.atkT) / 0.5 : 0; // 0..1 charge-up before the shout
      ctx.rotate(look);
      if (e.elite) { ctx.globalAlpha = warn ? 0.95 : 0.8 + Math.sin(e.t * 5) * 0.12; put(ctx, warn ? redOf(set.body) : goldOf(set.body)); ctx.globalAlpha = 1; }
      ctx.save();
      ctx.rotate(Math.sin(e.t * 8) * 0.1);
      if (opt === 'a') ctx.scale(1 + 0.4 * ch, 1 + 0.4 * ch);
      put(ctx, flash ? white(set.shoulders) : set.shoulders);
      ctx.restore();
      ctx.save();
      if (opt !== 'a' && ch > 0) { ctx.translate(0.2 * 17, 0); ctx.scale(1 + 0.3 * ch, 1 + 0.3 * ch); ctx.translate(-0.2 * 17, 0); }
      const head = opt !== 'a' && ch > 0 ? set.shout : set.head;
      put(ctx, flash ? white(head) : head);
      ctx.restore();
      if (set.phone) put(ctx, flash ? white(set.phone) : set.phone);
      ctx.rotate(-look);
      if (opt === 'a' && ch > 0) { // a thin ring shrinks inward before the shout
        ctx.strokeStyle = '#ff9f43'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 17 + 4 + 10 * (1 - ch), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (opt === 'c') { // ripple tell: faint constant ring; rises to 6/s and solid while charging
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1;
        const rate = ch > 0 ? 6 : 1 / 1.2, ph = (e.t * rate) % 1;
        ctx.globalAlpha = (ch > 0 ? 0.85 : 0.3) * (1 - ph * 0.6);
        ctx.beginPath(); ctx.arc(0, 0, 17 + 10 * ph, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      break;
    }
    case 'worm':
      if (isHead(e)) {
        // face the way the head is moving (last frame's displacement), else toward the player
        const dx = e.x - (e._px ?? e.x), dy = e.y - (e._py ?? e.y);
        if (dx * dx + dy * dy > 0.04) e._ang = Math.atan2(dy, dx);
        e._px = e.x; e._py = e.y;
        ctx.rotate((e._ang ?? look) + (opt === 'a' ? 0 : Math.sin(e.t * 8) * 0.2));
        bodyWithOutline(ctx, set.body, e, flash, warn);
      } else { // option b: a book spine, pointing along the chain, 30% smaller by the tail
        const L = e.leader, d = depthOf(e), sc = 1 - d * 0.045;
        ctx.rotate(Math.atan2(L.y - e.y, L.x - e.x)); ctx.scale(sc, sc);
        put(ctx, flash ? white(set.spine[d & 1]) : set.spine[d & 1]);
      }
      break;
    case 'golem': {
      const st = Math.abs(Math.sin(e.t * 6));
      if (opt === 'a') ctx.rotate(Math.sin(e.t * 6) * 0.06);
      else { ctx.translate(0, 24); ctx.scale(1 + st * 0.03, 1 - st * 0.06); ctx.translate(0, -24); }
      bodyWithOutline(ctx, set.body, e, flash, warn);
      ctx.restore(); ctx.save(); ctx.translate(e.x, e.y); // HP bar stays level and unscaled
      if (e.hp < e.maxHp) {
        const by = opt === 'a' ? 30 : 29;
        ctx.fillStyle = '#000'; ctx.fillRect(-18, by, 36, 4); ctx.fillStyle = GOLD; ctx.fillRect(-18, by, 36 * (e.hp / e.maxHp), 4);
      }
      break;
    }
    case 'coin': {
      const sx = (opt === 'a' ? 0.35 : 0.3) + Math.abs(Math.cos(e.t * 8)) * (opt === 'a' ? 0.65 : 0.7);
      ctx.scale(sx, 1);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      if (set.face && sx > 0.6 && !flash) put(ctx, set.face);
      if (opt === 'a' && (e.t % 0.6) < 0.14) { // sparkle tick
        ctx.scale(1 / sx, 1);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(3, -9); ctx.lineTo(7, -9); ctx.moveTo(5, -11); ctx.lineTo(5, -7); ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
  if (e.elite) { // crown stays upright, perched on the top of the own silhouette
    const c = crownSprite();
    ctx.drawImage(c, e.x - c.half, e.y + lift - set.top - 7 - c.half, c.half * 2, c.half * 2);
  }
}

/** Options a and c: every worm is ONE tube (outline pass, body pass, joint bands) instead of a row of circles. Call before the enemy loop. */
export function drawArtWorms(ctx, enemies) {
  if (ART !== 'a' && ART !== 'c') return;
  const outl = new Map(), body = new Map(), bands = [];
  for (const e of enemies) {
    if (e.type !== 'worm' || isHead(e)) continue;
    const d = depthOf(e), col = e.flash > 0 ? '#fff' : ART === 'c' && d & 1 ? SPINE[1] : SPINE[0];
    (outl.get(d) || outl.set(d, []).get(d)).push(e);
    const k = `${d}|${col}`;
    (body.get(k) || body.set(k, []).get(k)).push(e);
    bands.push(e);
  }
  if (!outl.size) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OL;
  for (const [d, list] of outl) {
    ctx.lineWidth = wormRad(d) * 2 + 3.4; ctx.beginPath();
    for (const e of list) { ctx.moveTo(e.x, e.y); ctx.lineTo(e.leader.x, e.leader.y); }
    ctx.stroke();
  }
  for (const [k, list] of body) {
    const [d, col] = k.split('|');
    ctx.strokeStyle = col; ctx.lineWidth = wormRad(+d) * 2; ctx.beginPath();
    for (const e of list) { ctx.moveTo(e.x, e.y); ctx.lineTo(e.leader.x, e.leader.y); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#7a2a40'; ctx.lineWidth = 1; ctx.lineCap = 'butt'; ctx.beginPath();
  for (const e of bands) {
    const L = e.leader, a = Math.atan2(L.y - e.y, L.x - e.x) + Math.PI / 2, r = wormRad(depthOf(e)) * 0.92;
    ctx.moveTo(e.x - Math.cos(a) * r, e.y - Math.sin(a) * r); ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Optional (&eyes=1): tiny per-type eyes drawn ABOVE the light layer, only on enemies out in the dark
 * (more than half a lantern radius from the player). No glow, no blur: 1-2 px shapes, batched by colour.
 */
export function drawGlowEyes(ctx, enemies, player, lanternR) {
  const far2 = (lanternR * 0.5) ** 2;
  const pink = [], red = [], slits = [], slots = [], rings = []; // flat [x, y, ...] lists, one path per colour
  for (const e of enemies) {
    if (e.type === 'boss' || e.type === 'coin') continue;
    const dx = e.x - player.x, dy = e.y - player.y;
    if (dx * dx + dy * dy < far2) continue;
    const look = Math.atan2(-dy, -dx), ux = Math.cos(look), uy = Math.sin(look);
    switch (e.type) {
      case 'bunny': { const y = e.y + (ART === 'a' ? -1 : hopY(e) + 0.7); pink.push(e.x - 3, y, e.x + 3, y); break; }
      case 'notice': red.push(e.x, e.y - 3); break;
      case 'patron': for (const s of [-1, 1]) slits.push(e.x + ux * 6 - uy * 3.6 * s, e.y + uy * 6 + ux * 3.6 * s, look); break;
      case 'worm': if (isHead(e)) { const a = e._ang ?? look, hx = Math.cos(a), hy = Math.sin(a); for (const s of [-1, 1]) rings.push(e.x + hx * 4 - hy * 4.4 * s, e.y + hy * 4 + hx * 4.4 * s); } break;
      case 'golem': for (const s of [-1, 1]) slots.push(e.x + s * 8, e.y - (ART === 'a' ? 10 : 15)); break;
    }
  }
  ctx.save(); ctx.globalAlpha = 0.85;
  const dots = (list, col, r) => { if (!list.length) return; ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < list.length; i += 2) { ctx.moveTo(list[i] + r, list[i + 1]); ctx.arc(list[i], list[i + 1], r, 0, TAU); } ctx.fill(); };
  dots(pink, '#ff8fb1', 1.3);
  dots(red, '#ff3b4e', 1.7);
  if (slits.length) { // patron: 2 orange slits
    ctx.fillStyle = '#ff9f43'; ctx.beginPath();
    for (let i = 0; i < slits.length; i += 3) { ctx.moveTo(slits[i] + 1.6, slits[i + 1]); ctx.ellipse(slits[i], slits[i + 1], 1.7, 0.8, slits[i + 2] + Math.PI / 2, 0, TAU); }
    ctx.fill();
  }
  if (slots.length) { // golem: 2 wide slots
    ctx.fillStyle = '#ffb43a'; ctx.beginPath();
    for (let i = 0; i < slots.length; i += 2) ctx.rect(slots[i] - 2.5, slots[i + 1] - 1, 5, 2);
    ctx.fill();
  }
  if (rings.length) { // worm: 2 tiny rings (glasses)
    ctx.strokeStyle = '#ff8fb1'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < rings.length; i += 2) { ctx.moveTo(rings[i] + 1.6, rings[i + 1]); ctx.arc(rings[i], rings[i + 1], 1.6, 0, TAU); }
    ctx.stroke();
  }
  ctx.restore();
}
