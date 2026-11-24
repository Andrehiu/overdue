// Enemy art (v1.12.0): every enemy except the boss is drawn here. Look "Blend": library characters (own face per type)
// on their own silhouettes and size ladder, a bunny hop, a patron charge ripple, elites outlined in gold instead of a ring.
// Spec and history: docs/plans/art-directions-enemies.md.
//
// Pure canvas code. Every body is pre-rendered ONCE into an offscreen canvas (per type / elite / flash state)
// and then drawn with drawImage + a transform, so there is no shadowBlur / filter / path rebuild per enemy per frame.
// Hitboxes are untouched: only the drawing size changes (visual R below, DEF.r in main.js stays).

const TAU = Math.PI * 2;
const OL = '#120a06';
const GOLD = '#ffd54a';
const RED = '#ff4d5e';
const SS = 3; // sprite pixel density (3x covers a 3x iPhone)

/**
 * Body colours per type. Enemies own the red / orange / pink hues (see palette.js isEnemyHue, enforced in test/enemy-art.test.js);
 * the only exceptions are the gold golem and coin, allowed by name in GOLD_TYPES.
 */
export const COL = {
  bunny: { body: '#c98a9e', shade: '#7a3f55', light: '#e8b4c3' },
  notice: { paper: '#f7c9c4', fold: '#d99a95', ink: '#b3202e' },
  patron: { head: '#ff9f43', shoulders: '#c2571f', lit: '#d6682a' },
  worm: { head: '#ff8fb1', seg: '#e0607f', seg2: '#c94a6a', band: '#7a2a40' },
  golem: { book: '#b8860b', book2: '#9a700a', dark: '#6b4f0c' },
  coin: { face: '#ffd54a', rim: '#b8860b' },
};
export const GOLD_TYPES = ['golem', 'coin'];

/** Death-burst colours per type (the boss keeps its own in main.js). Follow COL's hues. */
export const BURST = {
  bunny: [COL.bunny.body, COL.bunny.shade], notice: [COL.notice.paper, COL.notice.ink], patron: [COL.patron.head, '#ffd8a8'],
  worm: [COL.worm.seg, COL.worm.head], golem: ['#d4a017', '#8a6d1a'], coin: [COL.coin.face],
};

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
function dot(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

/** Bead / dot eye. Elites get a red iris in the type's own eye style. */
function bead(g, x, y, r, elite) {
  if (elite) { dot(g, x, y, r + 0.7, '#ff3b4e'); dot(g, x, y, r * 0.5, OL); } else dot(g, x, y, r, OL);
}

// ---------------------------------------------------------------- bunny: eared dust puff
function bunnyBody(g, k, elite) {
  const R = 9 * k, c = COL.bunny;
  for (const s of [-1, 1]) { // long ears (up, away from centre)
    ell(g, s * 0.4 * R, -1.05 * R, 0.3 * R, 0.75 * R, s * 0.2, c.body);
    ell(g, s * 0.4 * R, -1.05 * R, 0.13 * R, 0.5 * R, s * 0.2, c.light, 0);
  }
  circ(g, 0, 0.82 * R, 2.4 * k, '#f2e2e7', 2.4); // dust tail puff
  // fluffy ball: 5 lumps + core, outline as one silhouette
  const lumps = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; lumps.push([Math.cos(a) * 0.42 * R, Math.sin(a) * 0.42 * R, 0.46 * R]); }
  lumps.push([0, 0, 0.62 * R]);
  g.fillStyle = OL; for (const [x, y, r] of lumps) { g.beginPath(); g.arc(x, y, r + 1.7, 0, TAU); g.fill(); }
  g.fillStyle = c.body; for (const [x, y, r] of lumps) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(122,63,85,0.35)'; g.beginPath(); g.arc(0.25 * R, 0.4 * R, 0.5 * R, 0, TAU); g.fill();
  ell(g, 0, 0.12 * R, 0.55 * R, 0.38 * R, 0, c.light, 0); // lighter face patch
  for (const s of [-1, 1]) bead(g, s * 0.27 * R, 0.08 * R, 1.6, elite);
}

// ---------------------------------------------------------------- notice: pink slip, one angry eye, DUE stamp
function noticeBody(g, k, elite) {
  const R = 11 * k, hw = 0.9 * R, hh = 1.2 * R, f = 0.5 * R; // half width / half height, fold leg
  const c = COL.notice;
  shape(g, c.paper, (g2) => { // slip with a folded top-right corner
    g2.moveTo(-hw, -hh); g2.lineTo(hw - f, -hh); g2.lineTo(hw, -hh + f); g2.lineTo(hw, hh); g2.lineTo(-hw, hh); g2.closePath();
  });
  shape(g, c.fold, (g2) => { g2.moveTo(hw - f, -hh); g2.lineTo(hw - f, -hh + f); g2.lineTo(hw, -hh + f); g2.closePath(); }, 1.6);
  const ey = -0.28 * R;
  dot(g, 0, ey, 0.36 * R, '#fff'); g.strokeStyle = OL; g.lineWidth = 1; g.beginPath(); g.arc(0, ey, 0.36 * R, 0, TAU); g.stroke();
  dot(g, 0.5 * k, ey + 0.4 * k, 0.19 * R, elite ? '#ff3b4e' : c.ink);
  dot(g, 0.5 * k, ey + 0.4 * k, 0.07 * R, OL);
  g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-0.5 * R, ey - 0.62 * R); g.lineTo(0.42 * R, ey - 0.3 * R); g.stroke(); // brow
  g.save(); g.translate(0, 0.62 * R); g.rotate(-0.2);
  g.strokeStyle = c.ink; g.lineWidth = 1.1; g.strokeRect(-0.62 * R, -0.28 * R, 1.24 * R, 0.56 * R);
  g.fillStyle = c.ink; g.font = `bold ${3.9 * k}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('DUE', 0, 0.3); g.restore();
}

// ---------------------------------------------------------------- patron (faces +x; the sprite is rotated toward the player)
function patronShoulders(g, k) {
  const R = 17 * k;
  ell(g, -0.12 * R, 0, 0.52 * R, 1.0 * R, 0, COL.patron.shoulders);
  ell(g, -0.12 * R, 0, 0.3 * R, 0.8 * R, 0, COL.patron.lit, 0);
}
function patronHead(g, k, elite, shout) {
  const R = 17 * k, hr = 0.56 * R, hx = 0.2 * R;
  circ(g, hx, 0, hr, COL.patron.head);
  g.fillStyle = 'rgba(184,92,18,0.4)'; g.beginPath(); g.arc(hx - hr * 0.2, hr * 0.25, hr * 0.7, 0.2, 2.6); g.fill();
  for (const s of [-1, 1]) { // half-closed eyes: flat arcs (red iris line on elites)
    g.strokeStyle = elite ? '#ff3b4e' : OL; g.lineWidth = 1.5; g.beginPath(); g.arc(hx + hr * 0.1, s * hr * 0.42, hr * 0.2, 0, Math.PI); g.stroke();
  }
  g.fillStyle = '#3a0d0d'; g.beginPath();
  if (shout) g.roundRect(hx + hr * 0.3, -hr * 0.55, hr * 0.62, hr * 1.1, 1); else g.ellipse(hx + hr * 0.58, 0, hr * 0.26, hr * 0.38, 0, 0, TAU);
  g.fill();
  if (shout) { // "))" sound arcs in front of the mouth
    g.strokeStyle = COL.patron.head; g.lineWidth = 1.3;
    for (let i = 0; i < 2; i++) { g.beginPath(); g.arc(hx + hr * 0.9, 0, hr * (0.55 + i * 0.4), -0.7, 0.7); g.stroke(); }
  }
}
function patronPhone(g, k) {
  const R = 17 * k;
  g.fillStyle = OL; g.beginPath(); g.roundRect(0.28 * R, 0.62 * R, 0.3 * R, 0.5 * R, 1); g.fill();
  g.fillStyle = '#6a5a58'; g.fillRect(0.32 * R, 0.68 * R, 0.22 * R, 0.14 * R);
}

// ---------------------------------------------------------------- worm: head with reading glasses; the body is one tube (drawWorms)
function wormHead(g, k, elite) {
  const R = 11 * k; // 1.1 x visual radius 10
  circ(g, 0, 0, R, COL.worm.head);
  g.fillStyle = 'rgba(179,77,109,0.4)'; g.beginPath(); g.arc(-R * 0.15, R * 0.3, R * 0.7, 0.2, 2.7); g.fill();
  g.strokeStyle = OL; g.lineWidth = 1.3;
  for (const s of [-1, 1]) {
    dot(g, R * 0.3, s * R * 0.42, R * 0.3, '#ffe9f0');
    g.beginPath(); g.arc(R * 0.3, s * R * 0.42, R * 0.3, 0, TAU); g.stroke();
    bead(g, R * 0.36, s * R * 0.42, 1.2, elite);
  }
  g.beginPath(); g.moveTo(R * 0.3, -R * 0.12); g.lineTo(R * 0.3, R * 0.12); g.stroke(); // bridge
  g.beginPath(); g.moveTo(R * 0.3, -R * 0.7); g.lineTo(-R * 0.4, -R * 0.78); g.moveTo(R * 0.3, R * 0.7); g.lineTo(-R * 0.4, R * 0.78); g.stroke(); // arms
}
const wormRad = (depth) => 9 - depth * 0.33; // tube radius: 9 at the head tapering to 7

// ---------------------------------------------------------------- golem: a stack of three ledgers
function golemStack(g, k, elite) {
  const c = COL.golem, w = 46 * k, h = 15.5 * k, X = [-1.5, 2, -0.5], Y = [-23 * k, -7.5 * k, 8 * k], C = [c.book, c.book2, c.book];
  for (let i = 0; i < 3; i++) {
    shape(g, C[i], (g2) => g2.roundRect(-w / 2 + X[i], Y[i], w, h, 4 * k));
    g.fillStyle = 'rgba(255,226,170,0.32)'; g.fillRect(-w / 2 + X[i] + 4, Y[i] + 2, w - 12, 1.8);
    g.fillStyle = c.dark; g.fillRect(-w / 2 + X[i] + 3, Y[i] + h - 4, w - 6, 1.4); // page edge
  }
  g.fillStyle = c.dark; g.font = `bold ${14 * k}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', X[2], Y[2] + h * 0.52);
  for (const sx of [-1, 1]) { // slot eyes set into the top book
    g.fillStyle = elite ? '#ff3b4e' : '#ffef9f'; g.fillRect(sx * 8 * k - 3 + X[0], Y[0] + h * 0.5 - 1.2, 6, 2.4);
  }
}

// ---------------------------------------------------------------- coin
function coinBody(g, k) {
  circ(g, 0, 0, 7 * k, COL.coin.face);
  g.strokeStyle = COL.coin.rim; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 5.2 * k, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-3 * k, -3.4 * k, 2 * k, 1.3);
}
function coinFace(g, k, elite) {
  for (const s of [-1, 1]) dot(g, s * 2 * k, -1 * k, 0.8, elite ? '#ff3b4e' : COL.golem.dark);
  g.strokeStyle = COL.golem.dark; g.lineWidth = 0.9; g.beginPath(); g.arc(0.4 * k, 1.2 * k, 2.4 * k, 0.2, Math.PI - 0.5); g.stroke();
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
/** Everything cached for one (type, elite). `top` = how far above the centre the silhouette reaches (crown height). */
function setFor(type, elite) {
  const key = `${type}|${elite ? 'e' : 'n'}`;
  let s = cache.get(key);
  if (s) return s;
  const k = elite ? 1.25 : 1, id = (n) => `${key}|${n}`;
  s = { top: 12 * k };
  switch (type) {
    case 'bunny':
      s.body = spr(id('b'), 17 * k, (g) => bunnyBody(g, k, elite));
      s.top = 15 * k;
      break;
    case 'notice':
      s.body = spr(id('b'), 15 * k, (g) => noticeBody(g, k, elite));
      s.top = 13.2 * k;
      break;
    case 'patron': {
      const half = 22 * k;
      s.shoulders = spr(id('s'), half, (g) => patronShoulders(g, k));
      s.head = spr(id('h'), half, (g) => patronHead(g, k, elite, false));
      s.shout = spr(id('hs'), half, (g) => patronHead(g, k, elite, true));
      s.phone = spr(id('p'), half, (g) => patronPhone(g, k));
      // composite, only to cut the elite outline from
      s.body = spr(id('b'), half, (g) => { patronShoulders(g, k); patronHead(g, k, elite, false); patronPhone(g, k); });
      s.top = 17 * k;
      break;
    }
    case 'worm': // heads only; the rest of the chain is one tube
      s.body = spr(id('b'), 18 * k, (g) => wormHead(g, k, elite));
      s.top = 11 * k;
      break;
    case 'golem':
      s.body = spr(id('b'), 32 * k, (g) => golemStack(g, k, elite));
      s.top = 24 * k;
      break;
    case 'coin':
      s.body = spr(id('b'), 10 * k, (g) => coinBody(g, k));
      s.face = spr(id('f'), 10 * k, (g) => coinFace(g, k, elite));
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

/** Bunny hop height (px, negative = up). */
const hopY = (e) => -Math.abs(Math.sin(e.t * 9)) * 4;
/** Ground-shadow scale for the shared shadow pass in main.js (the hop's shadow shrinks at the top of each hop). */
export function shadowK(e) {
  return e.type === 'bunny' ? 1 - 0.3 * Math.abs(Math.sin(e.t * 9)) : 1;
}

/**
 * Patron charge-up ripple. Only while charging (the last 0.5 s before the shout; ch = 0..1), never otherwise.
 * One thin, faint ring (1 px, alpha <= 0.3, within R+10) pulsing outward, so it never reads as a SHHH ring (teal, 2 px+)
 * or the real shout ring (orange, thick, expanding across the room).
 */
export const rippleOf = (ch) => (ch > 0 ? { phase: ch * 2 % 1, alpha: 0.3 } : null);

// ---------------------------------------------------------------- the enemy dispatcher
const depthOf = (e) => { if (e._d === undefined) { let d = 0, l = e.leader; while (l && d < 8) { d++; l = l.leader; } e._d = d; } return e._d; };
const isHead = (e) => !e.leader || e.leader.dead;

/** Draw one enemy (not the boss). env = { player, playing }. Worm bodies are drawn by drawWorms(); here only their heads. */
export function drawEnemy(ctx, e, env) {
  const type = e.type;
  if (type === 'worm' && !isHead(e)) return;
  const flash = e.flash > 0;
  const warn = !!e.elite && e.shootT !== undefined && e.shootT < 0.4 && env.playing;
  const look = Math.atan2(env.player.y - e.y, env.player.x - e.x);
  const set = setFor(type, !!e.elite);
  if (!set) return;
  let lift = 0;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.vs > 1) ctx.scale(e.vs, e.vs);   // story rooms: 20% bigger (hitbox scaled in main.js)
  if (e.stun > 0) ctx.rotate(Math.sin(e.t * 20) * 0.15);
  switch (type) {
    case 'bunny':
      lift = hopY(e); ctx.translate(0, lift);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      break;
    case 'notice':
      ctx.rotate(Math.sin(e.t * 6) * 0.35);
      ctx.scale(Math.max(0.75, Math.abs(Math.cos(e.t * 4)) * 0.5 + 0.6), 1);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      break;
    case 'patron': {
      const ch = e.atkT < 0.5 ? (0.5 - e.atkT) / 0.5 : 0; // 0..1 charge-up before the shout
      ctx.rotate(look);
      if (e.elite) { ctx.globalAlpha = warn ? 0.95 : 0.8 + Math.sin(e.t * 5) * 0.12; put(ctx, warn ? redOf(set.body) : goldOf(set.body)); ctx.globalAlpha = 1; }
      ctx.save();
      ctx.rotate(Math.sin(e.t * 8) * 0.1);
      put(ctx, flash ? white(set.shoulders) : set.shoulders);
      ctx.restore();
      ctx.save();
      if (ch > 0) { ctx.translate(0.2 * 17, 0); ctx.scale(1 + 0.3 * ch, 1 + 0.3 * ch); ctx.translate(-0.2 * 17, 0); }
      const head = ch > 0 ? set.shout : set.head;
      put(ctx, flash ? white(head) : head);
      ctx.restore();
      put(ctx, flash ? white(set.phone) : set.phone);
      ctx.rotate(-look);
      const rip = rippleOf(ch);
      if (rip) {
        ctx.strokeStyle = COL.patron.head; ctx.lineWidth = 1;
        ctx.globalAlpha = rip.alpha * (1 - rip.phase);
        ctx.beginPath(); ctx.arc(0, 0, 17 + 10 * rip.phase, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      break;
    }
    case 'worm': {
      // face the way the head is moving (last frame's displacement), else toward the player
      const dx = e.x - (e._px ?? e.x), dy = e.y - (e._py ?? e.y);
      if (dx * dx + dy * dy > 0.04) e._ang = Math.atan2(dy, dx);
      e._px = e.x; e._py = e.y;
      ctx.rotate((e._ang ?? look) + Math.sin(e.t * 8) * 0.2);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      break;
    }
    case 'golem': {
      const st = Math.abs(Math.sin(e.t * 6));
      ctx.translate(0, 24); ctx.scale(1 + st * 0.03, 1 - st * 0.06); ctx.translate(0, -24);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      ctx.restore(); ctx.save(); ctx.translate(e.x, e.y); if (e.vs > 1) ctx.scale(e.vs, e.vs); // HP bar stays level
      if (e.hp < e.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(-18, 29, 36, 4); ctx.fillStyle = GOLD; ctx.fillRect(-18, 29, 36 * (e.hp / e.maxHp), 4); }
      break;
    }
    case 'coin': {
      const sx = 0.3 + Math.abs(Math.cos(e.t * 8)) * 0.7;
      ctx.scale(sx, 1);
      bodyWithOutline(ctx, set.body, e, flash, warn);
      if (sx > 0.6 && !flash) put(ctx, set.face);
      break;
    }
  }
  ctx.restore();
  if (e.elite) { // crown stays upright, perched on the top of the own silhouette
    const c = crownSprite();
    ctx.drawImage(c, e.x - c.half, e.y + (lift - set.top - 7) * (e.vs || 1) - c.half, c.half * 2, c.half * 2);
  }
}

/** Every worm is ONE tube (outline pass, body pass, joint bands) instead of a row of circles. Call before the enemy loop. */
export function drawWorms(ctx, enemies) {
  const outl = new Map(), body = new Map(), bands = [];
  for (const e of enemies) {
    if (e.type !== 'worm' || isHead(e)) continue;
    const d = depthOf(e), col = e.flash > 0 ? '#fff' : d & 1 ? COL.worm.seg2 : COL.worm.seg;
    (outl.get(d) || outl.set(d, []).get(d)).push(e);
    const k = `${d}|${col}`;
    (body.get(k) || body.set(k, []).get(k)).push(e);
    bands.push(e);
  }
  if (!outl.size) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OL;
  for (const [d, list] of outl) {
    ctx.lineWidth = (wormRad(d) * 2 + 3.4) * (list[0].vs || 1); ctx.beginPath();
    for (const e of list) { ctx.moveTo(e.x, e.y); ctx.lineTo(e.leader.x, e.leader.y); }
    ctx.stroke();
  }
  for (const [k, list] of body) {
    const [d, col] = k.split('|');
    ctx.strokeStyle = col; ctx.lineWidth = wormRad(+d) * 2 * (list[0].vs || 1); ctx.beginPath();
    for (const e of list) { ctx.moveTo(e.x, e.y); ctx.lineTo(e.leader.x, e.leader.y); }
    ctx.stroke();
  }
  ctx.strokeStyle = COL.worm.band; ctx.lineWidth = 1; ctx.lineCap = 'butt'; ctx.beginPath();
  for (const e of bands) {
    const L = e.leader, a = Math.atan2(L.y - e.y, L.x - e.x) + Math.PI / 2, r = wormRad(depthOf(e)) * 0.92 * (e.vs || 1);
    ctx.moveTo(e.x - Math.cos(a) * r, e.y - Math.sin(a) * r); ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}
