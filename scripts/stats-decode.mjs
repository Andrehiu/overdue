// Turns a pasted "Share stats" code (OVS1:...) into readable tables: one row per run, then a summary.
// Usage:  node scripts/stats-decode.mjs "<code>"      or      node scripts/stats-decode.mjs code.txt      or      pbpaste | node scripts/stats-decode.mjs
import { readFileSync, existsSync } from 'node:fs';
import { decodeStats } from '../src/runlog.js';

export const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const sum = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
const top = (m, n = 99) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const RES = { c: 'cleared', d: 'died', q: 'quit' };

/** Plain-text report for a list of run records (also used by the tests). */
export function report(runs) {
  const L = [];
  L.push(`${runs.length} run${runs.length === 1 ? '' : 's'}${runs.length ? ` · versions ${[...new Set(runs.map((r) => r.ver))].join(', ')}` : ''}`, '');
  L.push('| # | ver | mode | wing | room | result | killed by | time | hp | perks (pick order) | doors |', '|---|---|---|---|---|---|---|---|---|---|---|');
  runs.forEach((r, i) => L.push(`| ${i + 1} | ${r.ver} | ${r.mode === 's' ? 'story' : 'endless'} | ${r.wing || '-'} | ${r.room} | ${RES[r.res]} | ${r.res === 'd' ? r.killer + (r.elite ? ' (elite)' : '') : '-'} | ${Math.floor(r.t / 60)}m${String(r.t % 60).padStart(2, '0')} | ${r.hp} | ${r.perks.join(', ') || '-'} | ${r.doors.join(', ') || '-'} |`));
  if (!runs.length) return L.join('\n');
  const story = runs.filter((r) => r.mode === 's');
  L.push('', '## Summary', `Cleared ${runs.filter((r) => r.res === 'c').length} · died ${runs.filter((r) => r.res === 'd').length} · quit ${runs.filter((r) => r.res === 'q').length}`);
  const deaths = new Map(), killers = new Map(), picks = new Map(), dealt = new Map(), taken = new Map();
  for (const r of runs) {
    if (r.res === 'd') { const k = `wing ${r.wing || '-'} room ${r.room}`; deaths.set(k, (deaths.get(k) || 0) + 1); killers.set(r.killer + (r.elite ? ' (elite)' : ''), (killers.get(r.killer + (r.elite ? ' (elite)' : '')) || 0) + 1); }
    for (const id of new Set(r.perks)) picks.set(id, (picks.get(id) || 0) + 1);
    for (const [k, v] of Object.entries(r.dealt)) dealt.set(k, (dealt.get(k) || 0) + v);
    for (const [k, v] of Object.entries(r.taken)) taken.set(k, (taken.get(k) || 0) + v);
  }
  const table = (title, rows, fmt) => { L.push('', `### ${title}`, ...(rows.length ? rows.map(fmt) : ['(none)'])); };
  table('Deaths by room', top(deaths), ([k, n]) => `- ${k}: ${n}`);
  table('Killers', top(killers), ([k, n]) => `- ${k}: ${n} (${pct(n, [...killers.values()].reduce((a, b) => a + b, 0))})`);
  table('Perk pick rate (share of runs that took it)', top(picks, 15), ([k, n]) => `- ${k}: ${pct(n, runs.length)}`);
  const dt = sum(Object.fromEntries(dealt)), tk = sum(Object.fromEntries(taken));
  table('Damage dealt by source', top(dealt), ([k, v]) => `- ${k}: ${Math.round(v)} (${pct(v, dt)})`);
  table('Hearts lost by source', top(taken), ([k, v]) => `- ${k}: ${v} (${pct(v, tk)})`);
  if (story.length) L.push('', `Story: average room reached ${(story.reduce((s, r) => s + r.room, 0) / story.length).toFixed(1)}, average run ${Math.round(story.reduce((s, r) => s + r.t, 0) / story.length)} s`);
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  const text = arg ? (existsSync(arg) ? readFileSync(arg, 'utf8') : arg) : readFileSync(0, 'utf8');
  const r = decodeStats(text);
  if (!r.ok) { console.error(`Could not read the code: ${r.error}`); process.exit(1); }
  console.log(report(r.runs));
}
