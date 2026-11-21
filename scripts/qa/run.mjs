// OVERDUE! QA suite: `npm run qa` (full) or `npm run qa -- --ci` (relaxed perf thresholds for slow CI runners).
//
// Tests exactly what ships: builds the site, stages it like the GitHub Pages deploy,
// then drives it in Chromium on phone, tablet and desktop. Writes qa-report/report.md
// plus screenshots, prints a summary, and exits non-zero if anything fails.
//
// Each check exists because something real slipped through once (see TESTING.md).
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = join(ROOT, 'qa-report');
const SITE = join(OUT, 'site');
const CI = process.argv.includes('--ci');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7); // e.g. --only=perf
// Performance budgets (see TESTING.md). CI runners have no GPU, so fps is not judged there.
const PERF = CI ? { sim: 0.75, fps: 0 } : { sim: 0.85, fps: 50 };

const results = []; // { area, check, ok, detail }
const record = (area, check, ok, detail = '') => {
  results.push({ area, check, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${area} · ${check}${detail ? ` — ${detail}` : ''}`);
};
const want = (area) => !ONLY || ONLY.split(',').includes(area);

// ---------------------------------------------------------------- 1. unit tests + build
function sh(cmd) { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString(); }
await rm(OUT, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });
if (want('unit')) {
  try { const out = sh('npm test --silent'); const m = out.match(/# pass (\d+)[\s\S]*# fail (\d+)/); record('unit', 'node:test suite', m && m[2] === '0', m ? `${m[1]} passed, ${m[2]} failed` : 'no summary'); }
  catch (e) { record('unit', 'node:test suite', false, (e.stdout?.toString() || e.message).split('\n').filter((l) => l.startsWith('not ok')).join('; ').slice(0, 300)); }
}
sh('npm run build --silent');
await cp(join(ROOT, 'dist/overdue.html'), join(SITE, 'index.html'));
await cp(join(ROOT, 'dist/version.json'), join(SITE, 'version.json'));
await cp(join(ROOT, 'icons'), join(SITE, 'icons'), { recursive: true });
await cp(join(ROOT, 'manifest.webmanifest'), join(SITE, 'manifest.webmanifest'));
const BUILD = JSON.parse(readFileSync(join(SITE, 'version.json'), 'utf8'));

// ---------------------------------------------------------------- 2. serve the staged site
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(SITE, path.endsWith('/') ? 'index.html' : path);
  if (!file.startsWith(SITE)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const URL0 = `http://localhost:${server.address().port}/?debug=1`;

const TARGETS = [
  ['iphone', devices['iPhone 13']],
  ['iphone-landscape', devices['iPhone 13 landscape']],
  ['ipad-landscape', devices['iPad Pro 11 landscape']],
  ['desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }],
];

const browser = await chromium.launch();
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

// Relative luminance of a CSS rgb() colour (0 = black, 1 = white).
const LUM = `(c) => { const m = c.match(/[\\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); }`;

// ---------------------------------------------------------------- 3. screens on every device
if (want('screens')) for (const [name, opts] of TARGETS) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const tap = (sel) => (opts.hasTouch ? page.tap(sel) : page.click(sel));
  const area = `screens/${name}`;
  try {
    await page.goto(URL0); await page.waitForTimeout(700);
    await shot(page, `${name}-1-title`);
    // Layout: stage fills the screen, title fully visible (iPad clipping bug)
    const lay = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect(), logo = document.querySelector('.logo').getBoundingClientRect();
      return { fill: (st.width * st.height) / (innerWidth * innerHeight), logoOk: logo.top >= st.top - 1 && logo.bottom <= st.bottom + 1 };
    });
    record(area, 'title fully visible', lay.logoOk);
    record(area, 'arena fills screen', lay.fill >= 0.75, `${Math.round(lay.fill * 100)}% of screen`);
    // Readability: secondary menu text must be light on the dark UI (dark-on-dark regression)
    const lum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('[data-act=howto]')).color)`);
    record(area, 'menu text readable', lum > 0.5, `luminance ${lum.toFixed(2)}`);
    const ver = await page.textContent('#title .version-label');
    record(area, 'version label shown', ver.includes(BUILD.version) && ver.includes(BUILD.commit), ver);

    await tap('[data-act=play]');
    await page.evaluate(() => __overdue.god()); await page.waitForTimeout(2500);
    await shot(page, `${name}-2-play`);
    record(area, 'run starts', await page.evaluate(() => __overdue.game.state === 'playing'));

    // Perk screen: a combo hint and a Masterwork card, plain-language text only
    await page.evaluate(() => { const O = __overdue; O.grant('dewey'); for (let i = 0; i < 3; i++) O.grant('speedreader'); O.setRenews(1); O.showUpgrades(); });
    await page.waitForTimeout(800);
    await shot(page, `${name}-3-perks`);
    const cards = await page.$$eval('#cards .card', (cs) => cs.map((c) => ({ kind: c.className, gain: c.querySelector('.gain').textContent, text: c.textContent })));
    record(area, 'perk cards render', cards.length >= 1 && cards.every((c) => c.gain.trim().length > 0), `${cards.length} cards`);
    record(area, 'no technical units on cards', !cards.some((c) => /\d\s?(px|rad)\b|rad\/s/.test(c.text)));
    record(area, 'Masterwork offered at 3/3', cards[0]?.kind.includes('master'));
    const cardLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#cards .card strong')).color)`);
    record(area, 'card title readable on paper', cardLum < 0.3, `luminance ${cardLum.toFixed(2)}`);
    await page.waitForTimeout(400);
    await page.locator('#cards .card').first().click();
    await page.waitForTimeout(300);

    // Pause + build strip
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');            // pause (Esc toggles; press once only)
    await page.waitForTimeout(300);
    if (await page.isVisible('#pause')) { await shot(page, `${name}-4-pause`); record(area, 'pause shows build', (await page.textContent('#pauseBuild')).includes('Your build')); await tap('[data-act=resume]'); }
    else record(area, 'pause opens', false);

    // Boss fight renders with name plate
    await page.evaluate(() => { __overdue.startWave(5); __overdue.god(); }); await page.waitForTimeout(4200);
    await shot(page, `${name}-5-boss`);
    record(area, 'boss spawns', await page.evaluate(() => __overdue.enemies.some((e) => e.type === 'boss')));

    // Game over: stats readable, score can be filed
    await page.evaluate(() => { const O = __overdue; O.stats.maxHp = 5; O.player.hp = 1; O.player.inv = 0; O.die(); }); await page.waitForTimeout(2700);
    await shot(page, `${name}-6-gameover`);
    const goLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#goStats dd')).color)`);
    record(area, 'game-over stats readable', goLum > 0.5, `luminance ${goLum.toFixed(2)}`);
    await page.fill('#nameInput', 'QA');
    await page.click('#scoreForm button[type=submit]'); await page.waitForTimeout(500);
    record(area, 'score saves', /Filed|rank/i.test(await page.textContent('#submitMsg')), await page.textContent('#submitMsg'));

    await tap('[data-act=menu]'); await page.waitForTimeout(300);
    await tap('[data-act=codex]'); await page.waitForTimeout(300);
    await shot(page, `${name}-7-codex`);
    record(area, 'codex opens', /of \d+ discovered/.test(await page.textContent('#codexProgress')));

    // Late fees (A): the Renovations shop spends fines and the upgrade sticks
    await tap('#codex [data-act=back]'); await page.waitForTimeout(250);
    await page.evaluate(() => __overdue.setFines(1000));
    await tap('#title [data-act=shop]'); await page.waitForTimeout(300);
    await shot(page, `${name}-8-shop`);
    const shopLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#shopList strong')).color)`);
    record(area, 'shop text readable', shopLum > 0.5, `luminance ${shopLum.toFixed(2)}`);
    await tap('#shopList button[data-reno=catalogue]'); await page.waitForTimeout(200);
    const bought = await page.evaluate(() => ({ lvl: __overdue.progress.reno.catalogue, fines: __overdue.progress.fines, saved: JSON.parse(localStorage.getItem('overdue.progress.v1')).reno.catalogue }));
    record(area, 'Renovation bought and saved', bought.lvl === 1 && bought.saved === 1 && bought.fines === 700, JSON.stringify(bought));

    // Story wings (C): wing select, a room, a 4-card hand, an elite room, then clearing the wing unlocks the next
    await tap('#shop [data-act=shopback]'); await page.waitForTimeout(250);
    await tap('#title [data-act=story]'); await page.waitForTimeout(300);
    await shot(page, `${name}-9-story`);
    const tiles = await page.$$eval('#wingGrid .wing', (bs) => bs.map((b) => b.disabled));
    record(area, 'wing select: 10 wings, only wing 1 open', tiles.length === 10 && !tiles[0] && tiles.slice(1).every(Boolean), `${tiles.filter((d) => !d).length} open`);
    await tap('#btnEnterWing'); await page.waitForTimeout(300);
    await page.evaluate(() => __overdue.god()); await page.waitForTimeout(1800);
    await shot(page, `${name}-10-story-room`);
    record(area, 'story room starts', await page.evaluate(() => __overdue.game.mode === 'story' && __overdue.game.state === 'playing'));
    const clearRoom = () => page.evaluate(async () => {
      const O = __overdue;
      for (let i = 0; i < 60 && O.game.state === 'playing'; i++) { O.killAll(); await new Promise((r) => setTimeout(r, 100)); }
    });
    await clearRoom(); await page.waitForTimeout(2600);
    const hand = await page.evaluate(() => ({ state: __overdue.game.state, title: document.querySelector('#upgradeTitle').textContent,
      cards: [...document.querySelectorAll('#cards .card')].map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, r: r.right }; }) }));
    await shot(page, `${name}-11-story-perks`);
    record(area, 'room clear offers 4 cards', hand.state === 'upgrade' && hand.cards.length === 4 && /Room 1\/10/.test(hand.title), `${hand.cards.length} cards · ${hand.title}`);
    const vw = await page.evaluate(() => innerWidth);
    record(area, '4 cards fit on screen', hand.cards.every((c) => c.l >= -1 && c.r <= vw + 1));
    await page.evaluate(() => { __overdue.startWave(5); __overdue.god(); }); await page.waitForTimeout(1200);
    await shot(page, `${name}-12-elite-room`);
    // Watch for 3s and collect every enemy that appears (auto-fire can kill the first ones before a single snapshot).
    const eliteRoom = await page.evaluate(async () => {
      const seen = new Set(), t0 = performance.now();
      await new Promise((res) => { const tick = () => { for (const e of __overdue.enemies) seen.add(e.type + (e.elite ? '★' : '')); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(); }; tick(); });
      return { state: __overdue.game.state, room: __overdue.game.wave, types: [...seen] };
    });
    record(area, 'elite room spawns elites', eliteRoom.types.length > 0 && eliteRoom.types.filter((t) => !t.startsWith('worm')).every((t) => t.endsWith('★')), JSON.stringify(eliteRoom).slice(0, 200));
    await page.evaluate(() => { __overdue.startWave(10); __overdue.god(); }); await page.waitForTimeout(3600);
    record(area, 'room 10 boss spawns', await page.evaluate(() => __overdue.enemies.some((e) => e.type === 'boss')));
    await clearRoom(); await page.waitForTimeout(3400);
    await shot(page, `${name}-13-wing-cleared`);
    const won = await page.evaluate(() => ({ title: document.querySelector('#goTitle').textContent, unlocked: __overdue.progress.unlocked, next: !document.querySelector('#btnNextWing').hidden }));
    record(area, 'clearing wing 1 unlocks wing 2', /cleared/i.test(won.title) && won.unlocked === 2 && won.next, JSON.stringify(won));
  } catch (e) {
    record(area, 'flow completed', false, e.message.split('\n')[0]);
  }
  record(area, 'no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  record(area, 'no failed requests', failed.length === 0, failed.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 4. performance budget
// Late-game boss with a stacked build: this once ran at 0.4x game speed (chained hit-stop) and ~40fps.
if (want('perf')) {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();
  await page.goto(URL0); await page.waitForTimeout(500);
  await page.tap('[data-act=play]'); await page.waitForTimeout(300);
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
      out.push({ sim: (O.game.playTime - sim0) / ((performance.now() - t0) / 1000), fps: frames, books: O.counts().books });
    }
    return out;
  });
  await shot(page, 'perf-late-boss');
  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  record('perf', `late boss game speed ≥ ${PERF.sim}x`, avg('sim') >= PERF.sim, `${avg('sim').toFixed(2)}x (samples ${samples.map((s) => s.sim.toFixed(2)).join(', ')})`);
  if (PERF.fps) record('perf', `late boss fps ≥ ${PERF.fps}`, avg('fps') >= PERF.fps, `${avg('fps').toFixed(0)} fps`);
  record('perf', 'books in flight capped', Math.max(...samples.map((s) => s.books)) <= 110, `max ${Math.max(...samples.map((s) => s.books))}`);
  // Story late game: wing 10 room 9, a crowd of elites firing fans of pages.
  await page.evaluate(() => { const O = __overdue; O.unlockAll(); O.startRun('story', 10); O.startWave(9); O.god(); });
  await page.waitForTimeout(5000);
  const story = await page.evaluate(async () => {
    const O = __overdue, t0 = performance.now(), sim0 = O.game.playTime; let frames = 0;
    await new Promise((res) => { const tick = (now) => { frames++; if (now - t0 < 2000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return { sim: (O.game.playTime - sim0) / ((performance.now() - t0) / 1000), fps: frames / 2, hazards: O.counts().hazards };
  });
  await shot(page, 'perf-story-late');
  record('perf', `story wing 10 game speed ≥ ${PERF.sim}x`, story.sim >= PERF.sim, `${story.sim.toFixed(2)}x · ${story.hazards} pages in flight`);
  if (PERF.fps) record('perf', `story wing 10 fps ≥ ${PERF.fps}`, story.fps >= PERF.fps, `${story.fps.toFixed(0)} fps`);
  await ctx.close();
}
await browser.close();
server.close();

// ---------------------------------------------------------------- 5. privacy + secrets
// Files AND commit messages (the first scan once missed a commit message). Never put private terms
// in this file: add your own names/emails, one per line, to .qa-private-terms (gitignored).
if (want('security')) {
  const tracked = sh('git ls-files').split('\n').filter((f) => f && !f.endsWith('package-lock.json') && !/\.(png|jpg|ico)$/.test(f));
  const texts = tracked.map((f) => [f, existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : '']);
  texts.push(['(commit messages)', sh('git log --format=%B%n%an%n%ae')]);
  const SECRET = /(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const ALLOWED_EMAIL = /noreply@anthropic\.com|users\.noreply\.github\.com/;
  const priv = existsSync(join(ROOT, '.qa-private-terms')) ? readFileSync(join(ROOT, '.qa-private-terms'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const hits = [];
  for (const [f, t] of texts) {
    if (SECRET.test(t)) hits.push(`secret-like token in ${f}`);
    for (const e of t.match(EMAIL) || []) if (!ALLOWED_EMAIL.test(e)) hits.push(`email in ${f}`);
    for (const term of priv) if (t.toLowerCase().includes(term.toLowerCase())) hits.push(`private term in ${f}`);
  }
  record('security', 'no secrets or emails in files + commit messages', hits.length === 0, [...new Set(hits)].slice(0, 5).join(' | '));
  record('security', 'private-terms scan', true, priv.length ? `${priv.length} private terms checked` : 'skipped: create .qa-private-terms (gitignored) to also scan for your name');
}

// ---------------------------------------------------------------- 6. report
const failedChecks = results.filter((r) => !r.ok);
const md = [
  `# QA report — v${BUILD.version} · ${BUILD.commit}`,
  '',
  `${new Date().toISOString()} · mode: ${CI ? 'CI (relaxed perf)' : 'full'} · **${failedChecks.length ? `${failedChecks.length} FAILED` : 'ALL PASSED'}** (${results.length} checks)`,
  '',
  '| | Area | Check | Detail |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.area} | ${r.check} | ${String(r.detail).replace(/\|/g, '/')} |`),
  '',
  'Screenshots are in this folder. Look at them: several bugs in this project were only visible by eye.',
].join('\n');
await writeFile(join(OUT, 'report.md'), md + '\n');
console.log(`\n${failedChecks.length ? `❌ ${failedChecks.length} check(s) failed` : '✅ All checks passed'} — report: qa-report/report.md`);
process.exit(failedChecks.length ? 1 : 0);
