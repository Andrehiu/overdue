// Pool a balance report.json into one row per renos x wing: node scripts/balance-summary.mjs <report-dir> [more dirs]
import { readFileSync } from 'node:fs';
const dirs = process.argv.slice(2);
for (const d of dirs) {
  const j = JSON.parse(readFileSync(`${d}/report.json`, 'utf8'));
  const by = {};
  for (const r of j.rows) {
    const k = `${r.renos}|${r.wing}`; const o = by[k] ||= { renos: r.renos, wing: r.wing, runs: 0, clears: 0, hearts: 0, hn: 0, thrown: 0, ended: 0, hit: 0, dealt: {}, pages: { hits: 0, blocked: 0 }, bossT: [], evict: 0, secs: 0 };
    o.runs += r.runs; o.clears += r.clears;
    const m = r.metrics; if (!m) continue;
    o.thrown += m.thrown || 0; o.ended += m.ended || 0; o.hit += m.thrownHit || 0; o.evict += m.evict || 0; o.secs += m.seconds || 0;
    for (const s of Object.keys(m.dealt || {})) o.dealt[s] = (o.dealt[s] || 0) + m.dealt[s];
    o.pages.hits += m.pages?.hits || 0; o.pages.blocked += m.pages?.blockedHit || 0;
    o.bossT.push(...(m.bossKills || []));
  }
  console.log(`# ${d}`);
  console.log('| renos | wing | n | clear | thrown hit | orbit share | boss kill s | pages blocked |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const o of Object.values(by).sort((a, b) => a.renos.localeCompare(b.renos) || a.wing - b.wing)) {
    const tot = Object.values(o.dealt).reduce((a, b) => a + b, 0) || 1;
    const bt = o.bossT.length ? (o.bossT.reduce((a, b) => a + b, 0) / o.bossT.length).toFixed(1) : '–';
    const pb = o.pages.blocked + o.pages.hits ? Math.round(100 * o.pages.blocked / (o.pages.blocked + o.pages.hits)) + '%' : '–';
    console.log(`| ${o.renos} | ${o.wing} | ${o.runs} | ${Math.round(100 * o.clears / o.runs)}% | ${o.ended ? Math.round(100 * o.hit / o.ended) + '%' : '–'} | ${Math.round(100 * (o.dealt.orbit || 0) / tot)}% | ${bt} | ${pb} |`);
  }
}
