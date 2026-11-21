// OVERDUE! balance bot: `npm run balance` (NOT part of `npm run qa` or CI).
//
// Plays story wings with scripted door policies in headless Chromium and writes balance-report/report.md + report.json.
// The bot plays worse than people: compare wings and policies with each other, never read absolute difficulty from it.
//
//   npm run balance                       wings 1,4,7,10 × rare/rest/mixed × 20 runs, fresh save AND half-Renovations save
//   npm run balance -- --runs=5           quick look
//   npm run balance -- --wings=1,4        only some wings
//   npm run balance -- --renos=none|half|both   (default both)
//   npm run balance -- --policies=rare,rest --jobs=4
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { aggregate, findings, renderReport, POLICIES, WINGS_TESTED } from './balance-lib.mjs';
import { RENOVATIONS, normalizeProgress } from '../src/meta.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = join(ROOT, 'balance-report');
const SITE = join(OUT, 'site');
const arg = (name, dflt) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;
const RUNS = Math.max(1, Number(arg('runs', 20)));
const WINGS = arg('wings', WINGS_TESTED.join(',')).split(',').map(Number).filter((n) => n >= 1 && n <= 10);
const PICKED = arg('policies', POLICIES.join(',')).split(',').filter((p) => POLICIES.includes(p));
const RENOS = arg('renos', 'both') === 'both' ? ['none', 'half'] : [arg('renos', 'both')];
const JOBS = Math.max(1, Number(arg('jobs', Math.min(4, cpus().length))));

// A mid-game save: about half of every multi-level Renovation (one-off expensive ones, like Second Wind, not yet bought).
const saves = {
  none: normalizeProgress({ unlocked: 10 }),
  half: normalizeProgress({ unlocked: 10, reno: Object.fromEntries(RENOVATIONS.map((r) => [r.id, r.max <= 1 ? 0 : Math.round(r.max / 2)])) }),
};

await rm(OUT, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });
execSync('npm run build --silent', { cwd: ROOT, stdio: 'pipe' });
await cp(join(ROOT, 'dist/overdue.html'), join(SITE, 'index.html'));
await cp(join(ROOT, 'dist/version.json'), join(SITE, 'version.json'));
await cp(join(ROOT, 'icons'), join(SITE, 'icons'), { recursive: true });
await cp(join(ROOT, 'manifest.webmanifest'), join(SITE, 'manifest.webmanifest'));
const BUILD = JSON.parse(readFileSync(join(SITE, 'version.json'), 'utf8'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const bot = path.startsWith('/__bot/');                       // the bot's own modules live in scripts/, not in the game
  const base = bot ? join(ROOT, 'scripts') : SITE;
  const file = join(base, bot ? path.slice(7) : path.endsWith('/') ? 'index.html' : path);
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const URL0 = `http://localhost:${server.address().port}/?debug=1`;

const browser = await chromium.launch();
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('overdue.settings.v1', JSON.stringify({ sfx: false, music: false })); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  page.pageErrors = [];
  page.on('pageerror', (e) => page.pageErrors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => window.__overdue, null, { timeout: 15000 });
  return page;
}

const jobs = [];
for (const renos of RENOS) for (const wing of WINGS) for (const policy of PICKED) for (let i = 0; i < RUNS; i++) jobs.push({ renos, wing, policy });
// Interleave so a stopped batch still has every cell partly filled.
const order = jobs.map((j, i) => ({ j, k: i % RUNS, i })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.j);
console.log(`balance: ${order.length} runs (${RENOS.join('+')} × wings ${WINGS.join(',')} × ${PICKED.join('/')} × ${RUNS}), ${JOBS} in parallel, v${BUILD.version}`);

const results = [];
const started = Date.now();
let next = 0;
async function worker(id) {
  let page = await newPage();
  while (next < order.length) {
    const job = order[next++];
    let r;
    try {
      r = await page.evaluate(async ({ wing, policy, progress }) => {
        const m = await import('/__bot/balance-bot.mjs');
        return m.playRun(window.__overdue, { wing, policy, progress });
      }, { wing: job.wing, policy: job.policy, progress: saves[job.renos] });
      if (page.pageErrors.length) { r.errors = [...(r.errors || []), ...page.pageErrors.splice(0)]; }
    } catch (e) {
      r = { wing: job.wing, policy: job.policy, outcome: 'error', room: 0, hearts: 0, fines: 0, time: 0, errors: [String(e.message || e).slice(0, 200)] };
      try { await page.context().close(); } catch { /* gone */ }
      page = await newPage();
    }
    results.push({ renos: job.renos, ...r });
    if (results.length % 10 === 0 || results.length === order.length) {
      const el = (Date.now() - started) / 1000;
      console.log(`  ${results.length}/${order.length} runs · ${Math.round(el)}s elapsed · ~${Math.round(el / results.length * (order.length - results.length))}s left`);
    }
  }
  await page.context().close();
}
await Promise.all(Array.from({ length: JOBS }, (_, i) => worker(i)));
await browser.close();
server.close();

const rows = aggregate(results);
const meta = { date: new Date().toISOString().slice(0, 10), runsPerCell: RUNS, version: BUILD.version, wings: WINGS, policies: PICKED, renos: RENOS, seconds: Math.round((Date.now() - started) / 1000) };
const errs = results.filter((r) => r.outcome === 'error');
await writeFile(join(OUT, 'report.md'), renderReport(rows, meta) + (errs.length ? `\n## Errors\n\n${errs.length} run(s) failed to play and are excluded above:\n\n${[...new Set(errs.flatMap((r) => r.errors || []))].slice(0, 10).map((e) => `- ${e}`).join('\n')}\n` : ''));
await writeFile(join(OUT, 'report.json'), JSON.stringify({ meta, rows, findings: findings(rows), results }, null, 1));
console.log(`\nWrote balance-report/report.md and report.json in ${meta.seconds}s (${results.length} runs, ${errs.length} errors).`);
