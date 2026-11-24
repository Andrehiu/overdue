// Balance bot, page side: plays one story wing through window.__overdue (needs ?debug=1). Loaded by scripts/balance.mjs.
// It drives the simulation itself (no rendering, no real-time wait), so a full wing takes seconds.
import { chooseDoor, pickPerk, chooseMove } from './balance-lib.mjs';

const WEIGHT = { boss: 2.5, golem: 1.5, coin: 0.4 };
const DECIDE_EVERY = 4;                 // steps (1/120 s each): the bot re-thinks at 30 Hz

/** Play one run. progress = the save to start from. Never throws: failures come back as outcome 'error'. */
export function playRun(o, { wing, policy, progress, force = [], ban = [], cursed = 'take', roomTimeout = 180, wallMs = 180000 }) {
  const g = o.game, errors = [];
  try {
    o.drive(true);
    o.setProgress(progress);
    o.startRun('story', wing);
    for (const [id, lvl] of force) for (let i = 0; i < lvl; i++) o.grant(id);   // --force-perks: bot only, never in the game
    const t0 = Date.now();
    let prev = null, stuck = 0, outcome = null, lastDoor = null, seen = 0;
    const trace = [];                   // per room: hearts on entry and the door taken (for diagnosing spike rooms)
    for (let guard = 0; guard < 3e6 && !outcome; guard++) {
      const st = g.state;
      if (st === 'gameover') break;
      if (st === 'upgrade') {
        const before = g.wave;
        if (o.cursedOffer) { o.takeCursed(cursed === 'take'); continue; }   // Mystery Shelf cursed book: take it or walk away
        o.pickCard(pickPerk(o.choices, ban));
        if (g.state === 'upgrade' && g.wave === before && ++stuck > 20) { outcome = 'error'; errors.push('perk screen would not close'); }
        continue;
      }
      if (st === 'doors') {
        lastDoor = chooseDoor(policy, o.doors, o.player.hp);
        o.pickDoor(lastDoor);
        if (g.state === 'doors' && ++stuck > 20) { outcome = 'error'; errors.push('door screen would not close'); }
        continue;
      }
      if (st !== 'playing' && st !== 'waveclear' && st !== 'dying') { outcome = 'error'; errors.push(`unexpected state ${st}`); break; }
      stuck = 0;
      if (st === 'playing' && g.wave !== seen) { seen = g.wave; trace.push({ room: g.wave, hp: o.player.hp, door: lastDoor }); lastDoor = null; }
      if (st === 'playing') {
        if (g.waveT > roomTimeout || Date.now() - t0 > wallMs) { outcome = 'timeout'; break; }
        prev = think(o, prev);
      } else o.setBotInput({ x: 0, y: 0 });
      o.stepN(DECIDE_EVERY);
    }
    o.setBotInput(null);
    const room = g.wave, won = g.state === 'gameover' && g.wingCleared;
    if (!outcome) outcome = g.state !== 'gameover' ? 'error' : won ? 'clear' : 'death';
    const banked = g.banked ? g.banked.banked - (g.banked.firstClear ? 30 + 10 * wing : 0) : null;
    const c = o.runCounters;   // the same counters the game's run log uses (src/runlog.js)
    const metrics = { dealt: { ...c.dealt }, taken: { ...c.taken }, thrown: c.thrown, ended: c.ended, thrownHit: c.thrownHit, evict: c.evict, flight: Array.from(c.flight), life: Array.from(c.life), pages: { ...c.pages }, bossKills: c.bossKills.slice(), seconds: g.playTime };
    return { wing, policy, outcome, room, hearts: o.player.hp, fines: banked ?? Math.round(g.fines), time: Math.round(g.playTime), kills: g.kills, errors, trace, metrics, record: g.lastRun };
  } catch (e) {
    return { wing, policy, outcome: 'error', room: g.wave, hearts: 0, fines: 0, time: Math.round(g.playTime || 0), errors: [String(e && e.message || e)] };
  } finally {
    o.drive(false);
  }
}

/** One decision: steer, and maybe dash / SHHH. Returns the chosen direction (for the anti-jitter bias). */
function think(o, prev) {
  const p = o.player, threats = [];
  for (const e of o.enemies) if (!e.dead) threats.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, w: WEIGHT[e.type] || 1 });
  for (const h of o.hazards) threats.push({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, r: h.r, w: 1.6 });
  let mv = chooseMove({ x: p.x, y: p.y, threats, isSolid: o.isSolid, W: o.W, H: o.H, prev });
  // Closest thing that will hit us: used for dashing, and to pick a direction if we would otherwise stand still.
  let nearest = null, nd = Infinity, close = 0, danger = false;
  for (const t of threats) {
    const d = Math.hypot(t.x - p.x, t.y - p.y) - (t.r || 0);
    if (d < nd) { nd = d; nearest = t; }
    if (t.w !== 1.6 && d < o.stats.shhhRadius * 0.85) close++;
    const towards = (t.vx || 0) * (p.x - t.x) + (t.vy || 0) * (p.y - t.y) > 0;
    if (t.w === 1.6 ? d < 34 && towards : d < p.r + 14) danger = true;
  }
  if (!mv.x && !mv.y && nearest && nd < 90) { const d = Math.hypot(p.x - nearest.x, p.y - nearest.y) || 1; mv = { x: (p.x - nearest.x) / d, y: (p.y - nearest.y) / d }; }
  o.setBotInput(mv);
  if (danger && p.dashStock > 0 && p.dashT <= 0 && p.inv <= 0 && (mv.x || mv.y)) o.actions.dash = true;
  if (close >= 4 && p.shhhT <= 0) o.actions.shhh = true;
  return mv;
}
