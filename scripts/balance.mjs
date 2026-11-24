// OVERDUE! balance bot: `npm run balance` (NOT part of `npm run qa` or CI).
//
// Plays story wings with scripted door policies in headless Chromium and writes balance-report/report.md + report.json.
// The bot plays worse than people: compare wings and policies with each other, never read absolute difficulty from it.
//
//   npm run balance                       wings 1,4,7,10 × rare/rest/mixed × 20 runs, fresh save AND half-Renovations save
//   npm run balance -- --runs=5           quick look
//   npm run balance -- --wings=1,4        only some wings
//   npm run balance -- --renos=none|half|max|both   (default both = none+half; csv works too: --renos=none,max)
//   npm run balance -- --wings=6,7,8,9,10 --renos=max --policies=rare --runs=60
//   npm run balance -- --force-perks=dewey:3,interlibrary:3   (bot only: grant perks at run start; the bot still picks the rest)
//   npm run balance -- --rooms=old|new --viewport=844x390 --out=balance-report-x   (old = pre-1.14.0 room size, debug flag)
//   npm run balance -- --policies=rare,rest --jobs=4
//   npm run balance -- --policies=mystery --cursed=take|walk   (always Mystery Shelf; take or walk away from its cursed book)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { EXTRA_POLICIES, aggregate, findings, renderReport, parseForce, POLICIES, WINGS_TESTED, RENO_PRESETS } from './balance-lib.mjs';
import { RENOVATIONS, normalizeProgress } from '../src/meta.js';
import { roomGoal, roomKind } from '../src/story.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, dflt) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;
const OUT = join(ROOT, arg('out', 'balance-report'));
const SITE = join(OUT, 'site');
const RUNS = Math.max(1, Number(arg('runs', 20)));
const WINGS = arg('wings', WINGS_TESTED.join(',')).split(',').map(Number).filter((n) => n >= 1 && n <= 10);
const PICKED = arg('policies', POLICIES.join(',')).split(',').filter((p) => POLICIES.includes(p) || EXTRA_POLICIES.includes(p));
const RENOS = arg('renos', 'both') === 'both' ? ['none', 'half'] : arg('renos', 'both').split(',').filter((r) => RENO_PRESETS.includes(r));
const CURSED = arg('cursed', 'take');   // Mystery Shelf cursed book: take | walk
const FORCE = parseForce(arg('force-perks', ''));
const ROOMS_FLAG = arg('rooms', 'new') === 'old' ? '&legacyrooms=1' : '';
const [VW, VH] = arg('viewport', '1280x720').split('x').map(Number);
const JOBS = Math.max(1, Number(arg('jobs', Math.min(4, cpus().length))));

// A mid-game save: about half of every multi-level Renovation (one-off expensive ones, like Second Wind, not yet bought).
const saves = {
  none: normalizeProgress({ unlocked: 10 }),
  half: normalizeProgress({ unlocked: 10, reno: Object.fromEntries(RENOVATIONS.map((r) => [r.id, r.max <= 1 ? 0 : Math.round(r.max / 2)])) }),
  max: normalizeProgress({ unlocked: 10, reno: Object.fromEntries(RENOVATIONS.map((r) => [r.id, r.max])) }),   // every Renovation at its top tier
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
  try { const body = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const URL0 = `http://localhost:${server.address().port}/?debug=1${ROOMS_FLAG}`;

const browser = await chromium.launch();
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  await ctx.addInitScript(() => { try { localStorage.setItem('overdue.settings.v1', JSON.stringify({ sfx: false, music: false })); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  page.pageErrors = [];
  page.on('pageerror', (e) => page.pageErrors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => window.__overdue, null, { timeout: 15000 });
  return page;
}

const jobs = [];
for (const renos of RENOS) for (const wing of WINGS) for (const policy of PICKED) for (let i = 0; i < RUNS; i++) jobs.push({ renos, wing, policy, seed: i + 1 });
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
      r = await page.evaluate(async ({ wing, policy, progress, force, seed, cursed }) => {
        // Seeded randomness: run k of a cell gets the same seed in every batch, so old-vs-new room size compares like with like.
        let a = (seed * 2654435761) >>> 0;
        Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const m = await import('/__bot/balance-bot.mjs');
        return m.playRun(window.__overdue, { wing, policy, progress, force, cursed });
      }, { wing: job.wing, policy: job.policy, progress: saves[job.renos], force: FORCE, seed: job.seed, cursed: CURSED });
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
const meta = { date: new Date().toISOString().slice(0, 10), runsPerCell: RUNS, version: BUILD.version, force: FORCE.map(([i, n]) => `${i}:${n}`).join(',') || 'none', rooms: ROOMS_FLAG ? 'old (pre-1.14.0)' : 'new', viewport: `${VW}x${VH}`, wings: WINGS, policies: PICKED, renos: RENOS, seconds: Math.round((Date.now() - started) / 1000) };
const errs = results.filter((r) => r.outcome === 'error');
await writeFile(join(OUT, 'report.md'), renderReport(rows, { ...meta, roomInfo: (room, wing) => ({ goal: roomGoal(wing, room), kind: roomKind(room) }) }) + (errs.length ? `\n## Errors\n\n${errs.length} run(s) failed to play and are excluded above:\n\n${[...new Set(errs.flatMap((r) => r.errors || []))].slice(0, 10).map((e) => `- ${e}`).join('\n')}\n` : ''));
await writeFile(join(OUT, 'report.json'), JSON.stringify({ meta, rows, findings: findings(rows), results }, null, 1));
console.log(`\nWrote ${OUT}/report.md and report.json in ${meta.seconds}s (${results.length} runs, ${errs.length} errors).`);
