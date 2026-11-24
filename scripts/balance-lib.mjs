// Balance bot: pure helpers (no DOM, no Playwright), unit-tested in test/balance.test.js.
// Loaded both by Node (report) and by the game page (bot), so keep it dependency-free.

export const POLICIES = ['rare', 'rest', 'mixed'];
export const WINGS_TESTED = [1, 4, 7, 10];
export const DEALT_SOURCES = ['throw', 'crit', 'dash', 'orbit', 'burst', 'splash', 'shhh', 'other'];   // = src/runlog.js (this file runs in the game page too, so it imports nothing)
export const RENO_PRESETS = ['none', 'half', 'max'];
export const ROOMS = 7;   // = ROOMS_PER_WING in src/story.js (a unit test keeps them equal; this file also runs inside the game page, so it imports nothing)

/** Door preference per policy, best first. Mystery Shelf is always last: only taken when nothing else is offered. */
const ORDER = {
  rare: ['rare', 'stacks', 'rest', 'mystery'],
  rest: ['rest', 'stacks', 'rare', 'mystery'],
};

/** Which door the bot walks through. `offer` = door ids on screen, `hearts` = current hearts. */
export function chooseDoor(policy, offer, hearts) {
  if (offer.length === 1) return offer[0];                       // fixed door (elite / author)
  let order = ORDER[policy] || ORDER.rare;
  if (policy === 'mixed') order = hearts <= 2 ? ORDER.rest : ORDER.rare;
  for (const id of order) if (offer.includes(id)) return id;
  return offer[0];
}

// Perk priority: damage, throw rate and hearts first. Cursed books last (they cost hearts / speed).
const PERK_ORDER = ['hardcover', 'speedreader', 'extendedloan', 'graceperiod', 'trilogy', 'plottwist', 'coffee', 'dewey', 'bookmark',
  'footnotes', 'quietplease', 'audiobook', 'readingnook', 'spinebreaker', 'interlibrary'];

/** Index of the card to take. Unlocked Collected Works / Masterworks first, then the priority list, cursed last. */
export function pickPerk(choices) {
  let best = 0, bestScore = -Infinity;
  choices.forEach((u, i) => {
    const k = PERK_ORDER.indexOf(u.id);
    const score = u.kind === 'combo' || u.kind === 'master' ? 1000 : u.kind === 'cursed' ? -100 : k >= 0 ? 100 - k : 0;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/**
 * Pick a move direction. Samples 16 headings; each costs the threat pressure at the spot a short step ahead
 * (enemies, plus enemy pages predicted a moment forward), a wall/shelf penalty and a corner penalty.
 * state: { x, y, threats: [{x, y, vx, vy, w}], isSolid(x, y), W, H, prev: {x, y} | null }
 * Returns a unit vector, or {x:0, y:0} to hold position when nothing is close.
 */
export function chooseMove(s) {
  const near = s.threats.filter((t) => Math.hypot(t.x - s.x, t.y - s.y) < 330);
  const cx = s.W / 2, cy = s.H / 2;
  if (!near.length) {
    // Nobody close: drift back toward the middle so we never sit in a corner.
    const d = Math.hypot(cx - s.x, cy - s.y);
    return d > 90 ? { x: (cx - s.x) / d, y: (cy - s.y) / d } : { x: 0, y: 0 };
  }
  let best = null, bestCost = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let cost = 0, blocked = false;
    for (const L of [14, 28, 48]) if (s.isSolid(s.x + dx * L, s.y + dy * L)) { blocked = true; break; }
    if (blocked) cost += 40;
    const qx = s.x + dx * 55, qy = s.y + dy * 55;
    for (const t of near) {
      const tx = t.x + (t.vx || 0) * 0.35, ty = t.y + (t.vy || 0) * 0.35;
      const d = Math.max(4, Math.hypot(qx - tx, qy - ty) - (t.r || 0));
      cost += (t.w || 1) * 900 / (d * d + 600);
    }
    // Stay out of corners: penalise ending up close to the outer wall, more so near two walls at once.
    const ex = Math.min(qx, s.W - qx), ey = Math.min(qy, s.H - qy);
    const px = ex < 70 ? (70 - ex) / 70 : 0, py = ey < 70 ? (70 - ey) / 70 : 0;
    cost += 3 * (px + py) + 6 * px * py;
    if (s.prev) cost -= 0.25 * (dx * s.prev.x + dy * s.prev.y);   // small bias against jitter
    if (cost < bestCost) { bestCost = cost; best = { x: dx, y: dy }; }
  }
  return best;
}

// ---------------------------------------------------------------- run-log metrics (v1.14.0 part A)

/** Parse "--force-perks=dewey:3,interlibrary:3" -> [['dewey', 3], ['interlibrary', 3]]. Junk entries are dropped; levels clamp to 1..3. */
export function parseForce(text) {
  if (!text || text === 'none') return [];
  return String(text).split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const [id, n] = p.split(':'); return [id, Math.max(1, Math.min(3, Math.floor(Number(n)) || 1))]; }).filter(([id]) => /^[a-z_]+$/.test(id));
}

/** p-th percentile of a histogram: the lower edge of the bin where the running total reaches p, times unit. */
export function histP(hist, p, unit = 1) {
  let total = 0; for (const v of hist) total += v;
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= total * p) return i * unit; }
  return (hist.length - 1) * unit;
}

const addMaps = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = (o[k] || 0) + b[k]; return o; };
const addArrays = (a, b) => (b ? (a || []).length >= b.length ? a.map((v, i) => v + (b[i] || 0)) : b.map((v, i) => v + ((a || [])[i] || 0)) : a);

/** Pool the per-run `metrics` of several runs (each from the page: dealt, taken, thrown, ended, thrownHit, evict, flight[], life[], pages, bossKills[], seconds). */
export function poolMetrics(runs) {
  let m = null;
  for (const r of runs) {
    const x = r.metrics; if (!x) continue;
    if (!m) m = { n: 0, dealt: {}, taken: {}, thrown: 0, ended: 0, thrownHit: 0, evict: 0, flight: [], life: [], pages: { hits: 0, crossed: 0, crossedHit: 0 }, bossKills: [], seconds: 0 };
    m.n += x.n || 1; m.dealt = addMaps(m.dealt, x.dealt); m.taken = addMaps(m.taken, x.taken);
    for (const k of ['thrown', 'ended', 'thrownHit', 'evict', 'seconds']) m[k] += x[k] || 0;
    m.flight = addArrays(m.flight, x.flight); m.life = addArrays(m.life, x.life);
    m.pages = addMaps(m.pages, x.pages); m.bossKills.push(...(x.bossKills || []));
  }
  return m;
}

/** Derived numbers for the report, from pooled metrics. */
export function summariseMetrics(m) {
  if (!m) return null;
  const total = DEALT_SOURCES.reduce((a, k) => a + (m.dealt[k] || 0), 0);
  const share = Object.fromEntries(DEALT_SOURCES.map((k) => [k, total ? (m.dealt[k] || 0) / total : null]));
  const taken = Object.values(m.taken).reduce((a, b) => a + b, 0);
  return {
    n: m.n, dealtShare: share, dealtPerRun: total / m.n,
    takenList: Object.entries(m.taken).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ src: k, hearts: v, share: taken ? v / taken : null })),
    hitRate: m.ended ? m.thrownHit / m.ended : null,
    lifeP95: histP(m.life, 0.95, 0.1), flightP95: histP(m.flight, 0.95, 1),
    evictPerSec: m.seconds ? m.evict / m.seconds : null,
    orbitShareOfDamage: share.orbit,
    pagesBlockedShare: m.pages.hits ? m.pages.crossedHit / m.pages.hits : null,   // of the pages that hit you, how many first flew through an orbit book
    pagesCrossed: m.pages.crossed, pagesHit: m.pages.hits,
    bossKillTime: m.bossKills.length ? avg(m.bossKills) : null, bossKills: m.bossKills.length,
  };
}

// ---------------------------------------------------------------- aggregation + report

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v, d = 1) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * results: [{ renos: 'none'|'half', wing, policy, outcome: 'clear'|'death'|'timeout'|'error', room, hearts, fines, time }]
 * -> one row per renos × wing × policy.
 */
export function aggregate(results) {
  const rows = new Map();
  for (const r of results) {
    const key = `${r.renos}|${r.wing}|${r.policy}`;
    if (!rows.has(key)) rows.set(key, { renos: r.renos, wing: r.wing, policy: r.policy, runs: [] });
    rows.get(key).runs.push(r);
  }
  const out = [];
  for (const g of rows.values()) {
    const ok = g.runs.filter((r) => r.outcome !== 'error');
    const clears = ok.filter((r) => r.outcome === 'clear');
    const deathRooms = Array(ROOMS).fill(0);
    for (const r of ok) if (r.outcome === 'death' && r.room >= 1 && r.room <= ROOMS) deathRooms[r.room - 1]++;
    // Runs that reached room r: clears reached all rooms; a death or timeout in room d reached rooms 1..d.
    const reached = Array(ROOMS).fill(0);
    for (const r of ok) { const top = r.outcome === 'clear' ? ROOMS : Math.min(ROOMS, Math.max(0, r.room)); for (let i = 0; i < top; i++) reached[i]++; }
    out.push({
      renos: g.renos, wing: g.wing, policy: g.policy, reached,
      runs: ok.length, errors: g.runs.length - ok.length,
      clears: clears.length, timeouts: ok.filter((r) => r.outcome === 'timeout').length,
      clearRate: ok.length ? clears.length / ok.length : null,
      deathRooms,
      heartsLeft: round(avg(clears.map((r) => r.hearts))),
      fines: round(avg(ok.map((r) => r.fines))),
      time: round(avg(ok.map((r) => r.time)), 0),
      metrics: poolMetrics(ok),
    });
  }
  return out.sort((a, b) => a.renos.localeCompare(b.renos) || a.wing - b.wing || POLICIES.indexOf(a.policy) - POLICIES.indexOf(b.policy));
}

/**
 * Per-room numbers from rows that have deathRooms + reached (one row, or several rows pooled).
 * -> [{ room, reached, deaths, share (deaths / all deaths), rate (deaths / reached) }]
 */
export function roomStats(rows) {
  const deaths = Array(ROOMS).fill(0), reached = Array(ROOMS).fill(0);
  for (const r of rows) for (let i = 0; i < ROOMS; i++) { deaths[i] += r.deathRooms?.[i] || 0; reached[i] += r.reached?.[i] || 0; }
  const total = deaths.reduce((a, b) => a + b, 0);
  return deaths.map((d, i) => ({ room: i + 1, reached: reached[i], deaths: d, share: total ? d / total : null, rate: reached[i] ? d / reached[i] : null }));
}

/**
 * Survive-room check from the balance handoff: reach-conditional death rate of a Survive room vs the mean of the
 * clear (non-elite, non-boss) rooms just before and after it. info(room) -> { goal, kind }.
 * -> [{ room, rate, ref, ratio, verdict: 'easy'|'hard'|'fine'|'n/a' }]
 */
export function surviveChecks(stats, info) {
  const out = [];
  for (const s of stats) {
    if (info(s.room).goal !== 'survive') continue;
    const near = [stats[s.room - 2], stats[s.room]].filter((n) => n && info(n.room).goal === 'clear' && info(n.room).kind === 'normal' && n.rate !== null);
    const ref = near.length ? avg(near.map((n) => n.rate)) : null;
    if (s.rate === null || ref === null || ref === 0) { out.push({ room: s.room, rate: s.rate, ref, ratio: null, verdict: 'n/a' }); continue; }
    const ratio = s.rate / ref;
    out.push({ room: s.room, rate: s.rate, ref, ratio, verdict: ratio < 0.6 ? 'easy' : ratio > 1.5 ? 'hard' : 'fine' });
  }
  return out;
}

const pct = (v) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const mmss = (s) => (s === null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

/** Plain-language findings computed from the rows (never read as absolute difficulty: the bot plays worse than people). */
export function findings(rows) {
  const out = [];
  for (const renos of [...new Set(rows.map((r) => r.renos))]) {
    const set = rows.filter((r) => r.renos === renos && r.runs > 0);
    const tag = renos === 'none' ? '' : ` [renos: ${renos}]`;
    const wings = [...new Set(set.map((r) => r.wing))].sort((a, b) => a - b);
    // Clear rate per wing, averaged over policies.
    const perWing = wings.map((w) => ({ wing: w, rate: avg(set.filter((r) => r.wing === w).map((r) => r.clearRate)) }));
    let drop = null;
    for (let i = 1; i < perWing.length; i++) {
      const d = perWing[i - 1].rate - perWing[i].rate;
      if (!drop || d > drop.d) drop = { d, from: perWing[i - 1], to: perWing[i] };
    }
    if (drop && drop.d > 0.05) out.push(`Biggest clear-rate drop${tag}: wing ${drop.from.wing} → wing ${drop.to.wing} (${pct(drop.from.rate)} → ${pct(drop.to.rate)}, averaged over door policies).`);
    else if (perWing.length > 1) out.push(`Clear rate barely changes between tested wings${tag} (no step above 5 points).`);
    for (const w of wings) {
      const cells = set.filter((r) => r.wing === w);
      const byRate = [...cells].sort((a, b) => b.clearRate - a.clearRate);
      if (byRate.length > 1 && byRate[0].clearRate - byRate[byRate.length - 1].clearRate >= 0.15)
        out.push(`Wing ${w}${tag}: policy "${byRate[0].policy}" clears ${pct(byRate[0].clearRate)} vs "${byRate[byRate.length - 1].policy}" ${pct(byRate[byRate.length - 1].clearRate)}.`);
      const fine = [...cells].sort((a, b) => b.fines - a.fines);
      if (fine.length > 1 && fine[0].fines > 0 && fine[0].fines / Math.max(1, fine[fine.length - 1].fines) >= 1.25)
        out.push(`Wing ${w}${tag}: "${fine[0].policy}" earns the most fines per run (${fine[0].fines} vs ${fine[fine.length - 1].fines} for "${fine[fine.length - 1].policy}").`);
      // Where do the deaths pile up?
      const total = cells.reduce((a, r) => a + r.deathRooms.reduce((x, y) => x + y, 0), 0);
      if (total >= 5) {
        const sum = Array(ROOMS).fill(0);
        for (const r of cells) r.deathRooms.forEach((n, i) => { sum[i] += n; });
        const top = sum.indexOf(Math.max(...sum));
        if (sum[top] / total >= 0.3) out.push(`Wing ${w}${tag}: ${Math.round((sum[top] / total) * 100)}% of deaths happen in room ${top + 1}.`);
      }
    }
    const to = set.reduce((a, r) => a + r.timeouts, 0);
    if (to) out.push(`${to} run(s) timed out${tag}: the bot (or a room) got stuck. Check before trusting those cells.`);
    // Safe-looking: every policy clears ≥95% / impossible: none clear.
    for (const w of wings) {
      const cells = set.filter((r) => r.wing === w);
      if (cells.every((r) => r.clearRate >= 0.95)) out.push(`Wing ${w}${tag}: cleared almost every time by every policy (bot finds it easy).`);
      if (cells.every((r) => r.clears === 0)) out.push(`Wing ${w}${tag}: no policy cleared it once.`);
    }
  }
  // Renovations effect.
  const none = rows.filter((r) => r.renos === 'none'), half = rows.filter((r) => r.renos === 'half');
  if (none.length && half.length) {
    for (const w of [...new Set(none.map((r) => r.wing))]) {
      const a = avg(none.filter((r) => r.wing === w).map((r) => r.clearRate)), b = avg(half.filter((r) => r.wing === w).map((r) => r.clearRate));
      if (a !== null && b !== null && Math.abs(b - a) >= 0.1) out.push(`Wing ${w}: half Renovations move the clear rate ${pct(a)} → ${pct(b)}.`);
    }
  }
  return out;
}

const f1 = (v, d = 1) => (v === null || v === undefined ? '–' : v.toFixed(d));

/** Damage by source, damage taken by source, book and orbit metrics per renos × wing (all door policies pooled). */
export function metricsSection(rows) {
  const L = [];
  for (const renos of [...new Set(rows.map((r) => r.renos))]) {
    const wings = [...new Set(rows.filter((x) => x.renos === renos).map((x) => x.wing))].sort((a, b) => a - b);
    const sums = wings.map((w) => ({ w, s: summariseMetrics(poolMetrics(rows.filter((x) => x.renos === renos && x.wing === w).flatMap((x) => (x.metrics ? [{ metrics: x.metrics }] : [])))) }));
    if (!sums.some((x) => x.s)) continue;
    const name = renos === 'none' ? 'fresh save' : renos === 'half' ? 'half Renovations' : 'max Renovations';
    L.push(`## Damage and books (${name})`, '');
    L.push('Damage dealt by source (share of all damage, door policies pooled). burst = Spine Breaker shelf bursts, splash = Annotated crit splash.', '');
    L.push(`| Wing | Runs | Damage/run | ${DEALT_SOURCES.join(' | ')} |`, `|---|---|---|${DEALT_SOURCES.map(() => '---').join('|')}|`);
    for (const { w, s } of sums) if (s) L.push(`| ${w} | ${s.n} | ${Math.round(s.dealtPerRun)} | ${DEALT_SOURCES.map((k) => pct(s.dealtShare[k])).join(' | ')} |`);
    L.push('', 'Hearts lost by source (share of all hearts lost):', '', '| Wing | Top sources |', '|---|---|');
    for (const { w, s } of sums) if (s) L.push(`| ${w} | ${s.takenList.slice(0, 6).map((t) => `${t.src} ${pct(t.share)}`).join(' · ') || '–'} |`);
    L.push('', 'Throw and orbit metrics:', '', '| Wing | Thrown-book hit rate | Book life p95 (s) | Books in flight p95 | Evictions/s | Orbit share of damage | Pages through an orbit book that still hit you (share of hits) | Boss kill time (s, n) |', '|---|---|---|---|---|---|---|---|');
    for (const { w, s } of sums) if (s) L.push(`| ${w} | ${pct(s.hitRate)} | ${f1(s.lifeP95)} | ${f1(s.flightP95, 0)} | ${f1(s.evictPerSec, 2)} | ${pct(s.orbitShareOfDamage)} | ${pct(s.pagesBlockedShare)} (${s.pagesHit} hits) | ${f1(s.bossKillTime)} (${s.bossKills}) |`);
    L.push('');
  }
  return L;
}

export function renderReport(rows, meta = {}) {
  const L = [];
  L.push('# Balance report', '');
  L.push(`Generated ${meta.date || ''} · ${meta.runsPerCell ?? '?'} runs per cell · version ${meta.version || '?'}${meta.rooms ? ` · rooms ${meta.rooms}` : ''}${meta.viewport ? ` · viewport ${meta.viewport}` : ''}${meta.force && meta.force !== 'none' ? ` · forced perks ${meta.force}` : ''}`, '');
  L.push('> The bot plays worse than people. Compare wings and door policies with each other; never read absolute difficulty from these numbers.', '');
  L.push('## What stands out', '');
  const f = findings(rows);
  L.push(...(f.length ? f.map((x) => `- ${x}`) : ['- Nothing stands out.']), '');
  for (const renos of [...new Set(rows.map((r) => r.renos))]) {
    L.push(`## ${renos === 'none' ? 'Fresh save (no Renovations)' : 'Mid-game save (about half of every Renovation)'}`, '');
    L.push(`| Wing | Policy | Runs | Clear | Hearts left (clears) | Fines/run | Run time | Timeouts | Deaths by room 1–${ROOMS} |`);
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.renos === renos)) {
      L.push(`| ${r.wing} | ${r.policy} | ${r.runs}${r.errors ? ` (+${r.errors} err)` : ''} | ${pct(r.clearRate)} (${r.clears}/${r.runs}) | ${r.heartsLeft ?? '–'} | ${r.fines ?? '–'} | ${mmss(r.time)} | ${r.timeouts} | ${r.deathRooms.join(' ')} |`);
    }
    L.push('');
    const info = meta.roomInfo || (() => ({ goal: 'clear', kind: 'normal' }));
    L.push(`### Deaths by room, ${renos === 'none' ? 'fresh save' : 'mid-game save'}`, '');
    L.push('Share = this room\'s deaths ÷ all deaths in the cell. Death rate = deaths in the room ÷ runs that reached it. ⏱️ = Survive room, ⭐ = elite, 👑 = boss.', '');
    const wings = [...new Set(rows.filter((x) => x.renos === renos).map((x) => x.wing))];
    for (const w of wings) {
      const cells = rows.filter((x) => x.renos === renos && x.wing === w);
      const groups = [...cells.map((c) => ({ label: c.policy, rows: [c] })), { label: 'all policies', rows: cells }];
      L.push(`**Wing ${w}**`, '');
      L.push('| Room | Goal | Kind | ' + groups.map((g) => `${g.label} reached / deaths / share / rate`).join(' | ') + ' |');
      L.push('|---|---|---|' + groups.map(() => '---').join('|') + '|');
      const stats = groups.map((g) => roomStats(g.rows));
      for (let i = 0; i < ROOMS; i++) {
        const inf = info(i + 1, w);
        L.push(`| ${i + 1} | ${inf.goal === 'survive' ? '⏱️ survive' : 'clear'} | ${inf.kind === 'elite' ? '⭐ elite' : inf.kind === 'boss' ? '👑 boss' : 'normal'} | ` + stats.map((st) => `${st[i].reached} / ${st[i].deaths} / ${pct(st[i].share)} / ${pct(st[i].rate)}`).join(' | ') + ' |');
      }
      L.push('');
      const chk = surviveChecks(stats[stats.length - 1], (r) => info(r, w));
      for (const c of chk) L.push(`- Survive room ${c.room}: death rate ${pct(c.rate)} vs ${pct(c.ref)} for the clear rooms around it (ratio ${c.ratio === null ? '–' : c.ratio.toFixed(2)}, ${c.verdict}).`);
      if (chk.length) L.push('');
    }
  }
  L.push(...metricsSection(rows));
  L.push('Policies: `rare` = always 💰 Rare Books; `rest` = ☕ Break Room / 🚪 Stacks; `mixed` = Break Room at ≤ 2 hearts, else Rare Books. 🎲 Mystery Shelf only when nothing else is offered.');
  L.push('Run time is game time (what a player would spend). Hearts left and fines are averaged over the runs that apply (hearts: clears only).', '');
  return L.join('\n');
}
