// Enemy art (dev only): lineup / dark / combat screenshots + perf numbers for the current enemy look.
//   node scripts/art-shots.mjs                 # everything, into art-shots/ (gitignored)
//   node scripts/art-shots.mjs --only=shots    # screenshots only (or --only=perf)
// Self-serves the repo root (no build needed): needs `npm ci` and Playwright's Chromium.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = join(ROOT, 'art-shots');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ONLY = arg('only');
const chosen = ['default'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, p.endsWith('/') ? `${p}index.html` : p);
  if (!file.startsWith(ROOT) || /[/\\](node_modules|\.git)([/\\]|$)/.test(file)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://localhost:${server.address().port}/?debug=1`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const perf = {};

async function open(opt) {
  const ctx = await browser.newContext(devices['iPhone 13 landscape']); // 844x390 @3x
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE); await page.waitForTimeout(600);
  await page.tap('[data-act=play]'); await page.waitForTimeout(400);
  return { ctx, page, errors };
}

/** world -> CSS pixel clip rectangle of the canvas */
const clipFor = (page, x0, y0, x1, y1) => page.evaluate(([a, b, c, d]) => {
  const r = document.getElementById('game').getBoundingClientRect(), s = r.width / __overdue.W;
  return { x: r.left + a * s, y: r.top + b * s, width: (c - a) * s, height: (d - b) * s };
}, [x0, y0, x1, y1]);

/** Freeze the sim, then lay out the six types (row 1) and their elites (row 2) around a player at (px, py). */
async function lineup(page, px, py) {
  await page.evaluate(([px, py]) => {
    const O = __overdue;
    O.startRun('endless'); O.god(); O.killAll(); O.game.bannerT = 0; O.freeze(true);
    O.player.x = px; O.player.y = py; O.player.inv = 99;
    const row = (y, elite) => {
      const mk = (type, x, extra = {}) => { const e = O.makeEnemy(type, x, y, { elite, ...extra }); e.speed = 0; e.atkT = 99; e.shootT = 99; e.t = 0.12; return e; };
      const bunny = mk('bunny', px - 62);
      mk('notice', px - 22, { t: 0.05 });
      const patron = mk('patron', px + 24);
      const golem = mk('golem', px + 84);
      mk('coin', px + 136);
      // worm: head at the left end, 5 trailing segments (15 px apart) going left
      let prev = mk('worm', px - 112, { head: true });
      for (let i = 0; i < 5; i++) { prev = O.makeEnemy('worm', px - 112 - 15 * (i + 1), y, { leader: prev }); prev.speed = 0; prev.t = 0.12; }
      if (elite) bunny.shootT = 0.2; // one elite flaring red
      return { bunny, patron, golem };
    };
    row(py - 46, false); row(py + 46, true);
    for (const e of O.enemies) { e.vx = e.vy = 0; }
  }, [px, py]);
  await page.waitForTimeout(500);
  await page.evaluate(() => { __overdue.game.bannerT = 0; }); await page.waitForTimeout(150);
}

async function shots(opt) {
  const { ctx, page, errors } = await open(opt);
  const dim = await page.evaluate(() => ({ W: __overdue.W, H: __overdue.H }));
  // 1. lineup next to the player, inside the lantern
  const px = 270, py = dim.H / 2;
  await lineup(page, px, py);
  await page.screenshot({ path: join(OUT, `${opt}-lineup.png`), clip: await clipFor(page, px - 230, py - 95, px + 170, py + 95) });
  // 2. same lineup out in the dark: player far away, lineup between the lamps at the top of the room
  await page.evaluate(([W, H]) => { const O = __overdue; O.player.x = W - 70; O.player.y = H - 50; O.game.bannerT = 0; }, [dim.W, dim.H]);
  const DY = 128, dx = dim.W / 2 - px, dy = DY - py; // below the HUD, between the lamps
  await page.evaluate(([dx, dy]) => { for (const e of __overdue.enemies) { e.x += dx; e.y += dy; } }, [dx, dy]);
  await page.waitForTimeout(500);
  await page.evaluate(() => { __overdue.game.bannerT = 0; }); await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${opt}-dark.png`), clip: await clipFor(page, dim.W / 2 - 230, DY - 46 - 26, dim.W / 2 + 170, DY + 46 + 36) });
  // 3. combat: wing 10 room 5, ~10 s of real play with god mode (crowded real fight)
  await page.evaluate(() => { const O = __overdue; O.freeze(false); O.unlockAll(); O.startRun('story', 10); O.startWave(5); O.god(); });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: join(OUT, `${opt}-combat.png`) });
  if (errors.length) console.log(`⚠ ${opt}: page errors`, errors.slice(0, 3));
  await ctx.close();
  console.log(`📸 ${opt}`);
}

/** The QA perf scenarios (scripts/qa/run.mjs): wave-15 boss with a stacked build, and story wing 10 room 6. */
async function perfRun(opt) {
  const { ctx, page, errors } = await open(opt);
  await page.evaluate(() => {
    const O = __overdue;
    for (const id of ['hardcover', 'hardcover', 'hardcover', 'speedreader', 'speedreader', 'speedreader', 'trilogy', 'trilogy', 'trilogy',
      'plottwist', 'plottwist', 'plottwist', 'footnotes', 'footnotes', 'audiobook', 'audiobook', 'bookmark', 'spinebreaker',
      'm_tome', 'm_zone', 'm_saga', 'm_twist', 'm_biblio', 'unreliable', 'annotated']) O.grant(id);
    O.startWave(15); O.god();
  });
  await page.waitForTimeout(3000);
  const samples = await page.evaluate(async () => {
    const O = __overdue, out = [];
    for (let s = 0; s < 4; s++) {
      const b = O.enemies.find((e) => e.type === 'boss');
      if (b) { b.hp = b.maxHp; O.player.x = b.x; O.player.y = Math.min(b.y + 160, 900); }
      const t0 = performance.now(), sim0 = O.game.playTime; let frames = 0;
      await new Promise((res) => { const tick = (now) => { frames++; if (now - t0 < 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
      out.push({ sim: (O.game.playTime - sim0) / ((performance.now() - t0) / 1000), fps: frames, enemies: O.counts().enemies });
    }
    return out;
  });
  const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
  await page.evaluate(() => { const O = __overdue; O.unlockAll(); O.startRun('story', 10); O.startWave(6); O.god(); });
  await page.waitForTimeout(5000);
  const story = await page.evaluate(async () => {
    const O = __overdue, t0 = performance.now(), sim0 = O.game.playTime; let frames = 0;
    await new Promise((res) => { const tick = (now) => { frames++; if (now - t0 < 2000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return { sim: (O.game.playTime - sim0) / ((performance.now() - t0) / 1000), fps: frames / 2, enemies: O.counts().enemies };
  });
  perf[opt] = { boss: { sim: +avg(samples, 'sim').toFixed(2), fps: +avg(samples, 'fps').toFixed(0), enemies: Math.round(avg(samples, 'enemies')) },
    story10: { sim: +story.sim.toFixed(2), fps: +story.fps.toFixed(0), enemies: story.enemies } };
  if (errors.length) console.log(`⚠ ${opt}: page errors`, errors.slice(0, 3));
  await ctx.close();
  console.log(`⏱  ${opt}: boss ${perf[opt].boss.sim}x ${perf[opt].boss.fps}fps · story10 ${perf[opt].story10.sim}x ${perf[opt].story10.fps}fps`);
}

for (const opt of chosen) {
  if (ONLY !== 'perf') await shots(opt);
  if (ONLY !== 'shots') await perfRun(opt);
}
if (Object.keys(perf).length) {
  const f = join(OUT, 'perf.json');
  let prev = {}; try { prev = JSON.parse(await readFile(f, 'utf8')); } catch { /* first run */ }
  await writeFile(f, JSON.stringify({ ...prev, ...perf }, null, 2));
  console.log(`perf → ${f}`);
}
await browser.close(); server.close();
