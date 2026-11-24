// OVERDUE! QA suite: `npm run qa` (full) or `npm run qa -- --ci` (relaxed perf thresholds for slow CI runners).
//
// Tests exactly what ships: builds the site, stages it like the GitHub Pages deploy,
// then drives it in Chromium on iPhone and iPad (mobile only). Writes qa-report/report.md
// plus screenshots, prints a summary, and exits non-zero if anything fails.
//
// Each check exists because something real slipped through once (see TESTING.md).
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile, mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = join(ROOT, 'qa-report');
const SITE = join(OUT, 'site');
const CI = process.argv.includes('--ci');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7); // e.g. --only=perf
const FULL = process.argv.includes('--full'); // full gameplay flow on every target (default: only FULL_TARGETS; the rest get the fit-only pass)
const JOBS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--jobs='))?.slice(7)) || Math.min(4, cpus().length)); // parallel browser contexts (perf always runs alone)
// Performance budgets (see TESTING.md). CI runners have no GPU, so fps is not judged there.
const PERF = CI ? { sim: 0.75, fps: 0 } : { sim: 0.85, fps: 50 };

const results = []; // { area, check, ok, detail }
const record = (area, check, ok, detail = '') => {
  results.push({ area, check, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${area} · ${check}${detail ? ` — ${detail}` : ''}`);
};
const want = (area) => !ONLY || ONLY.split(',').includes(area);
// Flows that run in parallel keep their own result list (so the report stays in a stable order) and hand it back.
const recorder = () => { const list = []; const rc = (area, check, ok, detail = '') => { list.push({ area, check, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${area} · ${check}${detail ? ` — ${detail}` : ''}`); }; rc.list = list; return rc; };
// Run async tasks `n` at a time; results come back in task order.
const pool = async (tasks, n) => { const out = new Array(tasks.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } })); return out; };

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
await cp(join(ROOT, 'dist/sw.js'), join(SITE, 'sw.js'));
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
  ['iphone-landscape', devices['iPhone 13 landscape']],
  ['ipad-landscape', devices['iPad Pro 11 landscape']],
  ['ipad-mini-landscape', { ...devices['iPad Pro 11 landscape'], viewport: { width: 1133, height: 744 } }],
  // v1.11.1: more phone sizes (Safari with browser bars, smallest, biggest) and a mid-height iPad Safari
  ['iphone-se-landscape', { ...devices['iPhone 13 landscape'], viewport: { width: 667, height: 331 }, screen: { width: 667, height: 375 } }],
  ['iphone-13-safari-landscape', { ...devices['iPhone 13 landscape'], viewport: { width: 750, height: 342 } }],
  ['iphone-15-pro-max-landscape', { ...devices['iPhone 13 landscape'], viewport: { width: 932, height: 430 }, screen: { width: 932, height: 430 } }],
  ['ipad-safari-landscape', { ...devices['iPad Pro 11 landscape'], viewport: { width: 1180, height: 740 } }],
];
// Tiers (v1.11.3 QA trim): the full gameplay flow runs on these three; every other size gets the fit-only pass
// (title, perks, doors, end screens, menus: fill, nothing clipped, contrast). `--full` runs the full flow everywhere.
const FULL_TARGETS = new Set(['iphone-landscape', 'ipad-landscape', 'ipad-mini-landscape']);
const FILL_MIN = 0.95;
// v1.11.1: how much of the screen the stage covers, plus whether the title fits without scrolling
const FILL_JS = () => { const st = document.getElementById('stage').getBoundingClientRect(); return (st.width * st.height) / (innerWidth * innerHeight); };
const TITLE_FIT_JS = () => {
  const t = document.getElementById('title'), bad = [];
  if (t.scrollHeight > t.clientHeight + 2) bad.push(`scrolls: ${t.scrollHeight} > ${t.clientHeight}`);
  for (const el of t.querySelectorAll('h1, p:not([hidden]), button')) {
    if (!el.offsetParent || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1)) bad.push(`${(el.className || el.tagName).toString().slice(0, 16)} outside`);
  }
  return bad;
};

const browser = await chromium.launch();
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

// Relative luminance of a CSS rgb() colour (0 = black, 1 = white).
const LUM = `(c) => { const m = c.match(/[\\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); }`;


// v1.7.1: the pinned bottom row must never cover content and be no wider than the content column.
// Scrolls the screen to the bottom, then checks every visible text element against the row's rect.
const PINNED_CHECK = (id) => {
  const scr = document.getElementById(id), row = scr.querySelector(':scope > .menu.row:last-child');
  if (!row) return ['no pinned row'];
  scr.scrollTop = scr.scrollHeight;
  const rr = row.getBoundingClientRect(), bad = [];
  const kids = [...scr.children].filter((c) => c !== row && !c.hidden && c.offsetParent !== null);
  const col = Math.max(0, ...kids.map((c) => c.getBoundingClientRect().width));
  if (rr.height > innerHeight * 0.22 + 1) bad.push(`row ${Math.round(rr.height)}px tall > 22% of ${innerHeight}px`);
  // One line everywhere; as wide as the screen allows (tall screens keep the column cap only while the buttons still fit it)
  const tops = [...row.querySelectorAll('button')].filter((b) => !b.hidden && b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().top));
  if (Math.max(...tops) - Math.min(...tops) > 4) bad.push(`row wraps onto ${new Set(tops).size} lines`);
  if (rr.right > innerWidth + 1 || rr.left < -1) bad.push('row wider than the screen');
  // v1.12.1: while the list is scrolled the dark band must reach the bottom edge and span the full width (nothing shows around it)
  if (scr.scrollHeight > scr.clientHeight + 1) {
    const sr = scr.getBoundingClientRect();
    if (Math.abs(rr.bottom - sr.bottom) > 1.5) bad.push(`band ends ${Math.round(sr.bottom - rr.bottom)}px above the screen bottom`);
    if (rr.left - sr.left > 1.5 || sr.right - rr.right > 1.5) bad.push(`band spans ${Math.round(rr.left)}-${Math.round(rr.right)} of ${Math.round(sr.left)}-${Math.round(sr.right)}px`);
  }
  const w = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (row.contains(el) || !el.offsetParent || getComputedStyle(el).visibility === 'hidden') continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom > rr.top + 1 && r.top < rr.bottom - 1 && r.right > rr.left && r.left < rr.right) { bad.push(`"${n.textContent.trim().slice(0, 24)}" under the row`); break; }
    }
  }
  return bad;
};

// ---------------------------------------------------------------- 3. screens on every device
// `full` = whole gameplay flow; otherwise the fit-only pass (skips rules/logic checks that don't depend on screen size).
async function screensFlow(name, opts, full) {
  const record = recorder();
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
    record(area, 'arena fills screen (title)', lay.fill >= FILL_MIN, `${Math.round(lay.fill * 100)}% of screen · grid ${await page.evaluate(() => __overdue.grid ? __overdue.grid() : '')}`);
    const fit = await page.evaluate(`(${TITLE_FIT_JS})()`);
    record(area, 'title fits without scrolling, every element on screen', fit.length === 0, fit.join(' | '));
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
    // v1.11.0: learn perks as you go. Fresh tips store -> first perk screen shows the stacking tip.
    {
      const tipInfo = await page.evaluate(() => {
        const t = document.querySelector('#perkTip'), tr = t.getBoundingClientRect();
        const cs = [...document.querySelectorAll('#cards .card')];
        const hit = cs.map((c) => { const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && c.contains(e); });
        return { hidden: t.hidden, text: t.textContent, bottom: tr.bottom, tops: cs.map((c) => c.getBoundingClientRect().top), hit,
          seen: (JSON.parse(localStorage.getItem('overdue.tips.v1') || '{}').seen || []), vh: innerHeight };
      });
      record(area, 'first perk screen shows the stacking tip once', !tipInfo.hidden && /Perks stack to ●●●/.test(tipInfo.text) && tipInfo.seen.includes('perk-stack'), tipInfo.text);
      record(area, 'tip strip never overlaps cards and cards stay tappable', tipInfo.tops.every((t) => t >= tipInfo.bottom - 1) && tipInfo.hit.every(Boolean), `tip bottom ${Math.round(tipInfo.bottom)}, card tops ${tipInfo.tops.map(Math.round)}`);
      await shot(page, `${name}-perk-tips`);
      const sp = await page.evaluate(() => { const c = document.querySelector('#cards .card.master'); return c ? { stamp: c.querySelector('.stamp').textContent, why: c.querySelector('.why').textContent } : null; });
      record(area, 'special card shows UNLOCKED and its reason', !!sp && /UNLOCKED/i.test(sp.stamp) && /^because .+ hit 3\/3$/.test(sp.why), JSON.stringify(sp));
      await shot(page, `${name}-special-reason`);
      await page.evaluate(() => __overdue.showCards(['dewey']));
      await page.waitForTimeout(300);
      const lock = await page.evaluate(() => { const c = document.querySelector('#cards .card'); return { lvl: c.querySelector('.lvl').textContent, mw: c.querySelector('.mw').textContent, text: c.textContent, tip: document.querySelector('#perkTip').hidden ? '' : document.querySelector('#perkTip').textContent }; });
      record(area, '2/3 card shows the lock line, "now → after" pips and no Masterwork effect', lock.lvl === '●○○ → ●●○' && /Next level unlocks a Masterwork 🔒/.test(lock.mw) && !/Unlocks [A-Z]/.test(lock.text), `${lock.lvl} | ${lock.mw}`);
      record(area, 'stacking tip does not repeat on the next perk screen', !/Perks stack to/.test(lock.tip), lock.tip);
      if (full) {
      const p2 = await page.context().newPage(); await p2.goto(URL0); await p2.waitForTimeout(500);
      const again = await p2.evaluate(() => { __overdue.startRun('endless'); __overdue.showUpgrades(); const t = document.querySelector('#perkTip'); return { hidden: t.hidden, text: t.textContent }; }); await p2.close();
      record(area, 'stacking tip stays gone after a reload', again.hidden || !/Perks stack to/.test(again.text), again.text);
      // Old saves have no tips key; a damaged one must not break the game either.
      await page.evaluate(() => localStorage.removeItem('overdue.tips.v1'));
      const p3 = await page.context().newPage(); await p3.goto(URL0); await p3.waitForTimeout(500);
      const old = await p3.evaluate(() => { __overdue.startRun('endless'); __overdue.showUpgrades(); return document.querySelector('#perkTip').textContent; });
      await p3.evaluate(() => localStorage.setItem('overdue.tips.v1', '{oops'));
      await p3.reload(); await p3.waitForTimeout(500);
      const bad = await p3.evaluate(() => { __overdue.startRun('endless'); __overdue.showUpgrades(); return document.querySelector('#perkTip').textContent; }); await p3.close();
      record(area, 'old save without tips key (and a damaged one) loads fine', /Perks stack to/.test(old) && /Perks stack to/.test(bad), `${old.slice(0, 20)} | ${bad.slice(0, 20)}`);
      }
      await page.evaluate(() => __overdue.showUpgrades());
      await page.waitForTimeout(300);
    }
    const cardLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#cards .card strong')).color)`);
    record(area, 'card title readable on paper', cardLum < 0.3, `luminance ${cardLum.toFixed(2)}`);
    // Build strip: short names as text, linked chip when a combo partner is offered, popover opens without picking a card
    await page.evaluate(() => __overdue.showCards(['bookmark', 'extendedloan', 'plottwist']));
    await page.waitForTimeout(800);
    const strip = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('#buildStrip .build-item')].map((c) => ({ id: c.dataset.id, text: c.textContent, linked: c.classList.contains('linked'), r: c.getBoundingClientRect() })),
      strip: (() => { const r = document.querySelector('#buildStrip').getBoundingClientRect(); return { b: r.bottom }; })(),
      hint: document.querySelector('#cards .card .hint').textContent,
      vh: innerHeight, owned: JSON.stringify(__overdue.game.owned),
    }));
    record(area, 'build strip shows short names', strip.chips.some((c) => c.id === 'dewey' && /Dewey/.test(c.text)) && strip.chips.some((c) => c.id === 'speedreader' && /Speed Reader/.test(c.text)), strip.chips.map((c) => c.text).join(' | '));
    record(area, 'linked chip when partner offered', strip.chips.find((c) => c.id === 'dewey')?.linked === true && !strip.chips.find((c) => c.id === 'speedreader').linked && /🔗.*🧭 Dewey/.test(strip.hint), strip.hint);
    const rows = new Set(strip.chips.map((c) => Math.round(c.r.top))).size;
    record(area, 'build strip fits in 2 rows and on screen', rows <= 2 && strip.strip.b <= strip.vh + 1, `${rows} rows, bottom ${Math.round(strip.strip.b)} of ${strip.vh}`);
    await shot(page, `${name}-build-strip`);
    await page.locator('#buildStrip .build-item[data-id=dewey]').click();
    await page.waitForTimeout(200);
    const pp = await page.evaluate(() => { const p = document.querySelector('#buildPop'), r = p.getBoundingClientRect(); return { hidden: p.hidden, text: p.textContent, state: __overdue.game.state, l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, n: Object.keys(__overdue.game.owned).length }; });
    record(area, 'chip tap opens popover, picks no card', !pp.hidden && pp.state === 'upgrade' && /Dewey Decimal Guidance/.test(pp.text) && /1\/3/.test(pp.text) && /Choose Your Own Adventure: 🔖 Bookmark needed/.test(pp.text) && /Unlocks/.test(pp.text), pp.text.slice(0, 160));
    record(area, 'popover stays on screen', pp.l >= 0 && pp.t >= 0 && pp.r <= pp.vw && pp.b <= pp.vh, `${Math.round(pp.l)},${Math.round(pp.t)}-${Math.round(pp.r)},${Math.round(pp.b)} in ${pp.vw}x${pp.vh}`);
    await shot(page, `${name}-build-popover`);
    if (full) {
    // Tap away: only closes the popover, never picks the card underneath
    // Pick a point that is on a card but outside the popover (the popover may cover some card centres).
    const tapPoint = await page.evaluate(() => {
      const pr = document.querySelector('#buildPop').getBoundingClientRect();
      const free = (x, y) => !(x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom);
      for (const c of document.querySelectorAll('#cards .card')) {
        const r = c.getBoundingClientRect(), m = 10;
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + m, r.top + m], [r.right - m, r.top + m], [r.left + m, r.bottom - m], [r.right - m, r.bottom - m]];
        for (const [x, y] of pts) if (free(x, y) && document.elementFromPoint(x, y)?.closest('.card') === c) return { x, y };
      }
      return null;
    });
    record(area, 'a card point outside the popover exists to tap', !!tapPoint);
    if (tapPoint) await page.mouse.click(tapPoint.x, tapPoint.y);
    await page.waitForTimeout(250);
    record(area, 'tap outside closes popover without picking a card', await page.evaluate(() => document.querySelector('#buildPop').hidden && __overdue.game.state === 'upgrade' && Object.keys(__overdue.game.owned).length === 2), await page.evaluate(() => JSON.stringify(__overdue.game.owned)));
    await page.locator('#buildStrip .build-item[data-id=dewey]').click();
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    record(area, 'Esc closes popover', await page.evaluate(() => document.querySelector('#buildPop').hidden && __overdue.game.state === 'upgrade'));
    } else await page.keyboard.press('Escape'); // fit pass: just close the popover
    await page.evaluate(() => __overdue.showUpgrades());
    await page.waitForTimeout(800);
    await page.waitForTimeout(400);
    await page.locator('#cards .card').first().click();
    await page.waitForTimeout(300);

    if (full) {
    // Pause + build strip
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');            // pause (Esc toggles; press once only)
    await page.waitForTimeout(300);
    if (await page.isVisible('#pause')) { await shot(page, `${name}-4-pause`); record(area, 'pause shows build', (await page.textContent('#pauseBuild')).includes('Your build'));
      record(area, 'pause shows combos in reach', /Combos in reach[\s\S]*Choose Your Own Adventure/.test(await page.textContent('#pauseCombos'))); await tap('[data-act=resume]'); }
    else record(area, 'pause opens', false);

    // Boss fight renders with name plate
    await page.evaluate(() => { __overdue.startWave(5); __overdue.god(); });
    // v1.12.1: wait on the condition, not the wall clock (slow CI runners spawn the boss late)
    await page.waitForFunction(() => __overdue.enemies.some((e) => e.type === 'boss'), null, { timeout: 30000 }).catch(() => {});
    await shot(page, `${name}-5-boss`);
    record(area, 'boss spawns', await page.evaluate(() => __overdue.enemies.some((e) => e.type === 'boss')));
    }

    // Game over: stats readable, score can be filed
    await page.evaluate(() => { const O = __overdue; O.stats.maxHp = 5; O.player.hp = 1; O.player.inv = 0; O.die(); }); await page.waitForTimeout(2700);
    await shot(page, `${name}-6-gameover`);
    const goLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#goStats dd')).color)`);
    record(area, 'game-over stats readable', goLum > 0.5, `luminance ${goLum.toFixed(2)}`);
    await page.fill('#nameInput', 'QA');
    await page.click('#scoreForm button[type=submit]'); await page.waitForTimeout(500);
    record(area, 'score saves', /Filed|rank/i.test(await page.textContent('#submitMsg')), await page.textContent('#submitMsg'));

    await tap('[data-act=menu]'); await page.waitForTimeout(300);
    if (full) {
    await tap('[data-act=codex]'); await page.waitForTimeout(300);
    await shot(page, `${name}-7-codex`);
    record(area, 'codex opens', /of \d+ discovered/.test(await page.textContent('#codexProgress')));
    await tap('#codex [data-act=back]'); await page.waitForTimeout(250);
    }

    // Late fees (A): the Renovations shop spends fines and the upgrade sticks
    await page.evaluate(() => __overdue.setFines(1000));
    await tap('#title [data-act=shop]'); await page.waitForTimeout(300);
    await shot(page, `${name}-8-shop`);
    const shopLum = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#shopList strong')).color)`);
    record(area, 'shop text readable', shopLum > 0.5, `luminance ${shopLum.toFixed(2)}`);
    // (both tiers buy it: the Catalogue renovation is what makes the story hand 4 cards)
    {
    await tap('#shopList button[data-reno=catalogue]'); await page.waitForTimeout(200);
    const bought = await page.evaluate(() => ({ lvl: __overdue.progress.reno.catalogue, fines: __overdue.progress.fines, saved: JSON.parse(localStorage.getItem('overdue.progress.v1')).reno.catalogue }));
    record(area, 'Renovation bought and saved', bought.lvl === 1 && bought.saved === 1 && bought.fines === 700, JSON.stringify(bought));
    }

    // Story wings (C): wing select, a room, a 4-card hand, an elite room, then clearing the wing unlocks the next
    await tap('#shop [data-act=shopback]'); await page.waitForTimeout(250);
    await tap('#title [data-act=story]'); await page.waitForTimeout(300);
    await shot(page, `${name}-9-story`);
    const tiles = await page.$$eval('#wingGrid .wing', (bs) => bs.map((b) => b.disabled));
    record(area, 'wing select: 10 wings, only wing 1 open', tiles.length === 10 && !tiles[0] && tiles.slice(1).every(Boolean), `${tiles.filter((d) => !d).length} open`);
    await tap('#btnEnterWing'); await page.waitForTimeout(300);
    await page.evaluate(() => __overdue.god()); await page.waitForTimeout(1800);
    await shot(page, `${name}-10-story-room`);
    record(area, 'arena fills screen (story room)', (await page.evaluate(`(${FILL_JS})()`)) >= FILL_MIN, `${Math.round((await page.evaluate(`(${FILL_JS})()`)) * 100)}%`);
    record(area, 'story room starts', await page.evaluate(() => __overdue.game.mode === 'story' && __overdue.game.state === 'playing'));
    const clearRoom = () => page.evaluate(async () => {
      const O = __overdue;
      for (let i = 0; i < 60 && O.game.state === 'playing'; i++) { O.killAll(); await new Promise((r) => setTimeout(r, 100)); }
    });
    await clearRoom(); await page.waitForTimeout(2600);
    const hand = await page.evaluate(() => ({ state: __overdue.game.state, title: document.querySelector('#upgradeTitle').textContent,
      cards: [...document.querySelectorAll('#cards .card')].map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, r: r.right }; }) }));
    await shot(page, `${name}-11-story-perks`);
    record(area, 'room clear offers 4 cards', hand.state === 'upgrade' && hand.cards.length === 4 && /Room 1\/7/.test(hand.title), `${hand.cards.length} cards · ${hand.title}`);
    const vw = await page.evaluate(() => innerWidth);
    record(area, '4 cards fit on screen', hand.cards.every((c) => c.l >= -1 && c.r <= vw + 1));
    // Doors (v1.7.0): after the perk pick, choose the next room from 2 doors
    await page.locator('#cards .card').first().click(); await page.waitForTimeout(900);
    const doorScreen = () => page.evaluate((LUMSRC) => {
      const lum = eval(LUMSRC);
      const s = document.getElementById('doors'), vw = innerWidth, vh = innerHeight;
      const ds = [...s.querySelectorAll('.door')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.door, ok: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1, hit: (() => { const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === b || b.contains(h); })(),
        keyClear: (() => { if (getComputedStyle(b.querySelector('.key')).display === 'none') return true; const k = b.querySelector('.key').getBoundingClientRect(), i = b.querySelector('.icon').getBoundingClientRect(); return k.right <= i.left || k.left >= i.right || k.bottom <= i.top || k.top >= i.bottom; })() }; });
      return { state: __overdue.game.state, visible: !s.hidden, ds, noScroll: s.scrollHeight <= s.clientHeight + 1,
        lum: lum(getComputedStyle(s.querySelector('.door strong')).color), lineLum: lum(getComputedStyle(s.querySelector('.door .line')).color), title: document.getElementById('doorsTitle').textContent };
    }, `(${LUM})`);
    const dr = await doorScreen();
    await shot(page, `${name}-doors`);
    record(area, 'door screen shows 2 different doors after room 1', dr.state === 'doors' && dr.visible && dr.ds.length === 2 && dr.ds[0].id !== dr.ds[1].id, `${dr.state} · ${dr.ds.map((d) => d.id).join(' + ')}`);
    record(area, 'doors fit on screen, nothing covers them, no scrolling', dr.ds.every((d) => d.ok && d.hit) && dr.noScroll, JSON.stringify(dr.ds.map((d) => [d.ok, d.hit])) + ` noScroll ${dr.noScroll}`);
    record(area, 'door key badge does not touch the icon', dr.ds.every((d) => d.keyClear), JSON.stringify(dr.ds.map((d) => d.keyClear)));
    record(area, 'door text readable', dr.lum > 0.5 && dr.lineLum > 0.5, `title ${dr.lum.toFixed(2)} · line ${dr.lineLum.toFixed(2)}`);
    if (full) {
    await page.waitForTimeout(100);
    // Rare Books: more elites in the next room; Break Room: heals 1 when damaged (forced offers keep this deterministic)
    const base = await page.evaluate(() => { const O = __overdue; O.stats.maxHp = 5; O.player.hp = 2; O.showDoors(['rare', 'rest']); return { elite: 0 }; });
    await page.waitForTimeout(700);
    await page.locator('#doorCards .door[data-door=rare]').click(); await page.waitForTimeout(400);
    const rare = await page.evaluate(() => ({ state: __overdue.game.state, door: __overdue.game.door, elite: __overdue.game.diff.eliteChance, hp: __overdue.player.hp, sub: __overdue.game.bannerSub }));
    record(area, 'Rare Books raises the next room\'s elite share, no heal', rare.state === 'playing' && rare.door === 'rare' && rare.elite >= 0.5 && rare.hp === 2 && /Rare Books/.test(rare.sub), JSON.stringify(rare));
    await page.evaluate(() => { const O = __overdue; O.player.hp = 2; O.showDoors(['rest', 'mystery']); });
    await page.waitForTimeout(700);
    await page.keyboard.press('Digit1'); await page.waitForTimeout(400);
    const rest = await page.evaluate(() => ({ state: __overdue.game.state, door: __overdue.game.door, hp: __overdue.player.hp, elite: __overdue.game.diff.eliteChance }));
    record(area, 'Break Room (key 1) heals 1 heart and keeps the fight normal', rest.state === 'playing' && rest.door === 'rest' && rest.hp === 3 && rest.elite < 0.5, JSON.stringify(rest));
    await page.evaluate(() => { __overdue.player.hp = 5; __overdue.showDoors(['rest']); });
    await page.waitForTimeout(700);
    await page.locator('#doorCards .door').click(); await page.waitForTimeout(300);
    record(area, 'Break Room never heals above max', await page.evaluate(() => __overdue.player.hp === 5));
    const intro = await page.evaluate(() => { const O = __overdue; O.startWave(1); return { sub: O.game.bannerSub, want: O.WINGS ? O.WINGS[O.game.wingN - 1].intro : null }; });
    record(area, 'story room 1 banner shows the wing intro', !!intro.sub && intro.sub !== 'Front Desk' && intro.sub.length > 10, intro.sub);
    await page.evaluate(() => { const O = __overdue; O.stats.maxHp = 5; O.player.hp = 5; O.game.wave = 3; O.nextRoom(); }); await page.waitForTimeout(600);
    const d5 = await page.evaluate(() => ({ state: __overdue.game.state, n: document.querySelectorAll('#doors:not([hidden]) #doorCards .door').length, door: __overdue.game.door, toast: /Elite/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden }));
    record(area, 'before the elite room (after room 3) there is no door screen: straight into the elite room with a banner', d5.state === 'playing' && d5.n === 0 && d5.door === 'elite' && d5.toast, JSON.stringify(d5));
    await page.evaluate(() => { __overdue.startWave(1); });
    // v1.7.1: SHHH is ready at the start of every story room; endless keeps its cooldown
    const shhhStory = await page.evaluate(() => { const O = __overdue; O.player.shhhT = 9; O.startWave(2); return O.player.shhhT; });
    record(area, 'story: SHHH ready at the start of the next room', shhhStory === 0, `shhhT ${shhhStory}`);
    const shhhEndless = await page.evaluate(() => { const O = __overdue; O.startRun('endless'); O.player.shhhT = 9; O.startWave(2); const t = O.player.shhhT; O.startRun('story', 1); O.god(); return t; });
    record(area, 'endless: SHHH cooldown carries over', shhhEndless === 9, `shhhT ${shhhEndless}`);
    // v1.7.1: Mystery Shelf's bonus pick says why you get a second perk
    const bonusTitle = await page.evaluate(() => { const O = __overdue; O.game.bonusPicks = 1; O.showUpgrades(); return document.querySelector('#upgradeTitle').textContent; });
    record(area, 'Mystery bonus pick is labelled 1 of 2', /^🎲 Mystery prize: bonus pick \(1 of 2\)/.test(bonusTitle), bonusTitle);
    // v1.12.2: banish re-deals only that card; no hole-punch; free perks show as a card; no "!" on crits
    const bn = await page.evaluate(async () => {
      const O = __overdue; O.game.pickIsBonus = false; O.game.bonusPicks = 0; O.game.afterBonus = false; O.game.banishes = 1; O.game.state = 'upgrade';
      O.showCards(['hardcover', 'speedreader', 'trilogy']);
      const wraps = [...document.querySelectorAll('#cards .card-wrap')]; wraps.forEach((w, i) => { w.dataset.m = 'k' + i; });
      const hole = getComputedStyle(wraps[0].querySelector('.card'), '::after').content;
      await new Promise((r) => setTimeout(r, 650));
      wraps[0].querySelector('.banish')?.click();
      await new Promise((r) => setTimeout(r, 700));
      const after = [...document.querySelectorAll('#cards .card-wrap')];
      return { n: wraps.length, after: after.length, keptOthers: after.slice(1).every((w, i) => w.dataset.m === 'k' + (i + 1)), replaced: !after[0].dataset.m, hole };
    });
    record(area, 'banish re-deals only the banished card; the others keep their place', bn.n === bn.after && bn.keptOthers && bn.replaced, JSON.stringify(bn));
    record(area, 'perk cards have no hole-punch dot', bn.hole === 'none' || bn.hole === 'normal', bn.hole);
    const fp = await page.evaluate(() => { const O = __overdue; O.game.state = 'playing'; O.showFreePerk('hardcover', 'Head Start'); const el = document.querySelector('#freePerks .free-perk'); return { has: !!el, text: el?.textContent || '' }; });
    record(area, 'free perk shows as a card with its label', fp.has && /Head Start/.test(fp.text), fp.text);
    await page.evaluate(() => { document.querySelector('#freePerks .free-perk')?.click(); __overdue.game.state = 'upgrade'; });
    await page.evaluate(() => { __overdue.game.pickIsBonus = false; __overdue.startWave(2); });
    // v1.9.0: Survive rooms (wing 1 room 3): countdown HUD, spawns keep coming, the room clears itself when the timer ends
    await page.evaluate(() => { const O = __overdue; O.startRun('story', 1); O.startWave(3); O.god(); }); await page.waitForTimeout(1500);
    const sv = await page.evaluate(() => { const O = __overdue; return { goal: O.game.diff.goal, t: O.game.surviveT, sub: O.game.bannerSub, state: O.game.state }; });
    await shot(page, `${name}-survive-room`);
    record(area, 'Survive room starts with a 30 s timer and a banner naming the goal', sv.goal === 'survive' && sv.t > 26 && sv.t <= 30 && /Survive 30 seconds/.test(sv.sub) && sv.state === 'playing', JSON.stringify(sv));
    const svSpawn = await page.evaluate(async () => {
      const O = __overdue; let seenLate = 0;
      for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 100)); if (O.game.waveT > 5) seenLate = Math.max(seenLate, O.counts().enemies); }
      return { state: O.game.state, enemies: seenLate, left: O.game.surviveT };
    });
    record(area, 'Survive room is not cleared by killing (spawns continue)', svSpawn.state === 'playing' && svSpawn.left > 15, JSON.stringify(svSpawn));
    await page.evaluate(() => { __overdue.killAll(); __overdue.setSurviveT(0.4); }); await page.waitForTimeout(900);
    const svEnd = await page.evaluate(() => ({ state: __overdue.game.state, left: __overdue.enemies.length }));
    record(area, 'Survive room clears itself when the timer ends', (svEnd.state === 'waveclear' || svEnd.state === 'upgrade') && svEnd.left === 0, JSON.stringify(svEnd));
    await page.waitForTimeout(2300);
    await page.evaluate(() => { __overdue.startWave(4); __overdue.god(); }); await page.waitForTimeout(1200);
    await shot(page, `${name}-12-elite-room`);
    // Watch for 3s and collect every enemy that appears (auto-fire can kill the first ones before a single snapshot).
    const eliteRoom = await page.evaluate(async () => {
      const seen = new Set(), t0 = performance.now();
      await new Promise((res) => { const tick = () => { for (const e of __overdue.enemies) seen.add(e.type + (e.elite ? '★' : '')); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(); }; tick(); });
      return { state: __overdue.game.state, room: __overdue.game.wave, types: [...seen] };
    });
    record(area, 'elite room spawns elites', eliteRoom.types.length > 0 && eliteRoom.types.filter((t) => !t.startsWith('worm')).every((t) => t.endsWith('★')), JSON.stringify(eliteRoom).slice(0, 200));
    }
    // A real build (8 perks) on the way into the boss: the end screen must still fit (iPad bug: buttons fell off-screen)
    await page.evaluate(() => { const O = __overdue; for (const id of ['trilogy', 'trilogy', 'dewey', 'speedreader', 'interlibrary', 'hardcover', 'hardcover', 'hardcover', 'extendedloan', 'footnotes']) O.grant(id); O.startWave(7); O.god(); });
    // v1.12.1: poll every frame until the boss AND its floating taunt exist (the taunt lives 2.5 s, so a late look misses it)
    const TAUNTS = () => __overdue.texts.filter((t) => /: /.test(t.text) && t.size >= 12).map((t) => t.text);
    await page.waitForFunction(() => __overdue.enemies.some((e) => e.type === 'boss'), null, { timeout: 30000, polling: 'raf' }).catch(() => {});
    record(area, 'room 7 boss spawns', await page.evaluate(() => __overdue.enemies.some((e) => e.type === 'boss')));
    const taunt = await page.evaluate(TAUNTS);
    record(area, 'story boss shows its taunt', taunt.length > 0, taunt.join(' | '));
    await clearRoom(); await page.waitForTimeout(3400);
    await shot(page, `${name}-13-wing-cleared`);
    record(area, 'wing-cleared screen shows 7/7', await page.evaluate(() => /7\/7/.test(document.getElementById('gameover').innerText)));
    const won = await page.evaluate(() => ({ title: document.querySelector('#goTitle').textContent, unlocked: __overdue.progress.unlocked, next: !document.querySelector('#btnNextWing').hidden }));
    const cl = await page.evaluate(() => { const e = document.querySelector('#goSub'); return { t: e.textContent, vis: !e.hidden }; });
    record(area, 'wing-cleared screen shows the cleared line', cl.vis && cl.t.length > 10, cl.t);
    record(area, 'clearing wing 1 unlocks wing 2', /cleared/i.test(won.title) && won.unlocked === 2 && won.next, JSON.stringify(won));
    const btns = await page.$$eval('#gameover .menu.row button:not([hidden])', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), ok: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1 }; }));
    record(area, 'end-screen buttons on screen with a big build', btns.length >= 3 && btns.every((b) => b.ok), btns.filter((b) => !b.ok).map((b) => b.t).join(', ') || `${btns.length} buttons visible`);

    const goBad = await page.evaluate(`(${PINNED_CHECK})('gameover')`);
    record(area, 'game over: pinned row covers nothing and fits the column', !goBad.length, goBad.join('; '));

    if (full) {
    // Reset progress (Settings): needs two taps, then fines, Renovations and unlocks are gone
    await tap('#gameover [data-act=menu]'); await page.waitForTimeout(250);
    await tap('#title [data-act=settings]'); await page.waitForTimeout(250);
    await tap('#btnShowTips'); await page.waitForTimeout(150);
    record(area, 'Show tips again resets the tips', await page.evaluate(() => (JSON.parse(localStorage.getItem('overdue.tips.v1') || '{}').seen || []).length === 0));
    await tap('#btnResetProgress'); await page.waitForTimeout(150);
    const afterOne = await page.evaluate(() => __overdue.progress.unlocked);
    await tap('#btnResetProgress'); await page.waitForTimeout(200);
    await shot(page, `${name}-14-settings-reset`);
    const reset = await page.evaluate(() => ({ ...__overdue.progress, saved: JSON.parse(localStorage.getItem('overdue.progress.v1')) }));
    record(area, 'reset progress needs 2 taps and clears progress', afterOne === 2 && reset.fines === 0 && reset.unlocked === 1 && !Object.keys(reset.reno).length && reset.saved.fines === 0,
      `after 1 tap: wing ${afterOne} open · after 2: ${reset.fines} fines, wing ${reset.unlocked}`);
    // Endless stays as it was: no door screen, the next wave just starts
    await page.evaluate(() => { __overdue.startRun('endless'); __overdue.god(); }); await page.waitForTimeout(1500);
    await clearRoom(); await page.waitForTimeout(2600);
    await page.locator('#cards .card').first().click(); await page.waitForTimeout(500);
    record(area, 'endless shows no door screen', await page.evaluate(() => __overdue.game.mode === 'endless' && __overdue.game.state === 'playing' && __overdue.game.wave === 2 && document.getElementById('doors').hidden && __overdue.game.door === null));
    // v1.10.0: Auto-aim setting. Off = no throwing without a second finger; the finger sets the aim.
    {
      const hasBox = await page.evaluate(() => !!document.querySelector('#settings input[data-k=autoaim]'));
      record(area, 'settings has an Auto-aim toggle', hasBox);
      await page.evaluate(() => localStorage.setItem('overdue.settings.v1', JSON.stringify({ sfx: true, music: true, lights: true, motion: true, autofire: false })));
      const p2 = await page.context().newPage(); await p2.goto(URL0); await p2.waitForTimeout(500);
      const oldLoad = await p2.evaluate(() => ({ s: __overdue.settings.autoaim, box: document.querySelector('#settings input[data-k=autoaim]').checked })); await p2.close();
      record(area, 'old settings save (no autoaim) loads with auto-aim on', oldLoad.s === true && oldLoad.box === true, JSON.stringify(oldLoad));
      await page.evaluate(() => { __overdue.startRun('endless'); __overdue.god(); __overdue.touch.enabled = true; __overdue.setSetting('autoaim', false); });
      await page.waitForTimeout(2500);
      const p3 = await page.context().newPage(); await p3.goto(URL0); await p3.waitForTimeout(500);
      const saved = await p3.evaluate(() => __overdue.settings.autoaim); await p3.close();
      record(area, 'auto-aim off persists across reload', saved === false, String(saved));
      // Deterministic: the sim is stepped by hand (real loop paused) and we count THROWS, not books in flight.
      const sim = (body) => page.evaluate(`(async () => { const O = __overdue; O.drive(true); try { ${body} } finally { O.drive(false); } })()`);
      await sim(`O.stepN(300);`); // let the room's enemies materialise
      const idle = await sim(`const t0 = O.player.throws; const en = O.enemies.length; O.stepN(150); return { enemies: en, throws: O.player.throws - t0 };`);
      record(area, 'auto-aim off, no second finger: no throws at enemies', idle.enemies > 0 && idle.throws === 0, JSON.stringify(idle));
      // v1.10.2: floating aim stick. The finger lands far to the RIGHT of the player and drags 60 px LEFT: throws must go left.
      const angOff = `const dd = (l, e) => l ? Math.abs(Math.atan2(Math.sin(l.aim - e), Math.cos(l.aim - e))) : 9;`;
      const down = await sim(`const p = O.player; O.touch.aimId = 99; O.touch.ax0 = O.touch.ax = p.x + 300; O.touch.ay0 = O.touch.ay = p.y; const t0 = p.throws;
        O.stepN(90); O.touch.aimId = null; return { throws: p.throws - t0 };`);
      record(area, 'auto-aim off, finger down but not dragged: no throws', down.throws === 0, JSON.stringify(down));
      const manual = await sim(`${angOff} const p = O.player; O.touch.aimId = 99; O.touch.ax0 = p.x + 300; O.touch.ay0 = p.y; O.touch.ax = O.touch.ax0 - 60; O.touch.ay = O.touch.ay0; const t0 = p.throws;
        O.stepN(60); O.touch.aimId = null; return { throws: p.throws - t0, diff: dd(p.lastThrow, Math.PI) };`);
      record(area, 'auto-aim off, finger right of player dragged 60px left: throws go left', manual.throws >= 1 && manual.diff < 0.15, JSON.stringify(manual));
      const manualUp = await sim(`${angOff} const p = O.player; O.touch.aimId = 99; O.touch.ax0 = p.x - 200; O.touch.ay0 = p.y + 50; O.touch.ax = O.touch.ax0; O.touch.ay = O.touch.ay0 - 60; const t0 = p.throws;
        O.stepN(60); O.touch.aimId = null; return { throws: p.throws - t0, diff: dd(p.lastThrow, -Math.PI / 2) };`);
      record(area, 'auto-aim off, dragged 60px up: throws go up', manualUp.throws >= 1 && manualUp.diff < 0.15, JSON.stringify(manualUp));
      const released = await sim(`const p = O.player; O.touch.aimId = null; const t0 = p.throws; O.stepN(90); return { throws: p.throws - t0 };`);
      record(area, 'auto-aim off, stick released: throwing stops', released.throws === 0, JSON.stringify(released));
      // aim-stick screenshot with both sticks visible (real loop running, fingers faked in state)
      await page.evaluate(() => { const O = __overdue, p = O.player, t = O.touch; t.moveId = 98; t.mx0 = t.mx = 150; t.my0 = t.my = 280; t.mx += 25; t.my -= 15;
        t.aimId = 99; t.ax0 = O.W - 150; t.ay0 = 280; t.ax = t.ax0 - 40; t.ay = t.ay0 - 25; });
      await page.waitForTimeout(300); await shot(page, `${name}-aim-stick`);
      await page.evaluate(() => { const t = __overdue.touch; t.aimId = null; t.moveId = null; });
      const auto = await sim(`O.setSetting('autoaim', true); O.touch.enabled = true; O.touch.aimId = null; const p = O.player; const t0 = p.throws; p.autoAim = { n: 0, nearest: true }; O.stepN(120);
        return { throws: p.throws - t0, aimedFrames: p.autoAim.n, aimedAtNearest: p.autoAim.nearest };`);
      record(area, 'auto-aim on: throws at the nearest enemy with no finger (unchanged)', auto.throws >= 1 && auto.aimedFrames >= 1 && auto.aimedAtNearest, JSON.stringify(auto));
      const over = await sim(`${angOff} const p = O.player; O.touch.aimId = 99; O.touch.ax0 = p.x + 300; O.touch.ay0 = p.y; O.touch.ax = O.touch.ax0 - 60; O.touch.ay = O.touch.ay0; const t0 = p.throws;
        O.stepN(60); O.touch.aimId = null; return { throws: p.throws - t0, diff: dd(p.lastThrow, Math.PI) };`);
      record(area, 'auto-aim on + deflected stick: throws follow the stick', over.throws >= 1 && over.diff < 0.15, JSON.stringify(over));
      const idleStick = await sim(`const p = O.player; O.touch.aimId = 99; O.touch.ax0 = O.touch.ax = p.x + 300; O.touch.ay0 = O.touch.ay = p.y; p.autoAim = { n: 0, nearest: true }; const t0 = p.throws;
        O.stepN(120); O.touch.aimId = null; return { throws: p.throws - t0, aimedFrames: p.autoAim.n };`);
      record(area, 'auto-aim on + stick inside deadzone: auto-aim keeps working', idleStick.throws >= 1 && idleStick.aimedFrames >= 1, JSON.stringify(idleStick));
      await page.evaluate(() => { __overdue.touch.enabled = false; __overdue.setSetting('autoaim', true); });
    }
    }

  } catch (e) {
    record(area, 'flow completed', false, e.message.split('\n')[0]);
  }
  record(area, 'no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  record(area, 'no failed requests', failed.length === 0, failed.slice(0, 3).join(' | '));
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- 3a. menu buttons are always on screen (v1.4.2)
async function menusFlow(name, opts) {
  const record = recorder();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const area = `menus/${name}`;
  try {
    await page.goto(URL0); await page.waitForTimeout(600);
    const check = (id) => page.evaluate((id) => {
      const s = document.getElementById(id);
      const sel = id === 'title' ? '.menu button' : '.menu.row:last-child button';
      const bad = [];
      for (const b of s.querySelectorAll(sel)) {
        if (!b.offsetParent || b.hidden) continue;
        const r = b.getBoundingClientRect();
        const inside = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!inside || !(hit === b || b.contains(hit))) bad.push(`${b.textContent.trim().slice(0, 16)} (${inside ? 'covered' : 'off-screen by ' + Math.round(r.bottom - innerHeight) + 'px'})`);
      }
      return bad;
    }, id);
    record(area, 'title buttons on screen', !(await check('title')).length, (await check('title')).join(', '));
    await page.evaluate(() => __overdue.setFines(1000));
    for (const [id, act, back] of [['howto', 'howto', 'back'], ['settings', 'settings', 'back'], ['leaderboard', 'leaderboard', 'back'],
      ['codex', 'codex', 'back'], ['story', 'story', 'back'], ['shop', 'shop', 'shopback']]) {
      await page.click(`#title [data-act=${act}]`); await page.waitForTimeout(350);
      if (id === 'codex' || id === 'shop' || id === 'howto') await shot(page, `${name}-menu-${id}`);
      const bad = await check(id);
      record(area, `${id}: bottom buttons on screen`, !bad.length, bad.join(', '));
      if (['codex', 'shop', 'settings', 'howto'].includes(id)) {
        const ov = await page.evaluate(`(${PINNED_CHECK})('${id}')`);
        record(area, `${id}: pinned row covers nothing and fits the column`, !ov.length, ov.join('; '));
      }
      if (id === 'howto') {
        const txt = await page.textContent('#howto');
        record(area, 'howto: no keyboard/mouse terms', !/WASD|Arrows|click|Space|Shift|Esc\b/i.test(txt), (txt.match(/WASD|Arrows|click|Space|Shift|Esc\b/i) || [''])[0]);
        record(area, 'howto: mentions second-finger option and controller line', /second finger/.test(txt) && /Controller: left stick/.test(txt));
        const hl = await page.evaluate(`(${LUM})(getComputedStyle(document.querySelector('#howto .controls dd')).color)`);
        record(area, 'howto: text readable', hl > 0.5, `luminance ${hl.toFixed(2)}`);
        const pb = await page.evaluate(() => { const b = document.querySelector('#howto .perks-box'); const r = b.getBoundingClientRect(); const row = document.querySelector('#howto > .menu.row:last-child').getBoundingClientRect(); return { text: b.textContent, w: r.width, vw: innerWidth, right: r.right, lum: getComputedStyle(b).color }; });
        record(area, 'howto: Perks box present and fits the width', /Masterwork/.test(pb.text) && /Collected Work/.test(pb.text) && /once per run/.test(pb.text) && pb.right <= pb.vw + 1, `${Math.round(pb.w)} of ${pb.vw}`);
      }
      await page.click(`#${id} [data-act=${back}]`); await page.waitForTimeout(250);
    }
    // v1.13.1: Backup screen (opened from Settings) fits every size, with its code box and confirm step showing
    await page.click('#title [data-act=settings]'); await page.waitForTimeout(250);
    await page.click('#btnBackup'); await page.waitForTimeout(300);
    await page.click('#btnCopyBackup'); await page.fill('#backupIn', 'OVD1:junk'); await page.click('#btnRestoreBackup'); await page.waitForTimeout(200);
    await shot(page, `${name}-menu-backup`);
    const bkBad = await page.evaluate(`(${PINNED_CHECK})('backup')`);
    record(area, 'backup: pinned row covers nothing and fits the column', !bkBad.length, bkBad.join('; '));
    const bkIn = await page.evaluate(() => { const bad = []; for (const el of document.querySelectorAll('#backup button:not([hidden]), #backup textarea:not([hidden]), #backup .backup-box > p')) { const r = el.getBoundingClientRect(); if (r.width && (r.left < -1 || r.right > innerWidth + 1)) bad.push(el.id || el.tagName); } return bad; });
    record(area, 'backup: controls inside the screen width', !bkIn.length, bkIn.join(', '));
    await page.click('#backup [data-act=backupback]'); await page.waitForTimeout(200);
    await page.click('#settings [data-act=back]'); await page.waitForTimeout(250);
    // v1.12.1: 4 and 5 card hands sit in ONE row, nothing scrolls, the build strip stays on screen (every size)
    await page.evaluate(() => { __overdue.startRun('endless'); __overdue.god(); for (const id of ['trilogy', 'dewey', 'speedreader']) __overdue.grant(id); });
    await page.waitForTimeout(500);
    for (const n of [4, 5]) {
      await page.evaluate((n) => { __overdue.game.cards = n; __overdue.showUpgrades(); }, n); await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const s = document.getElementById('upgrade'), cards = [...document.querySelectorAll('#cards .card')], cs = cards.map((c) => c.getBoundingClientRect());
        const tops = cards.map((c) => c.closest('.card-wrap').offsetTop);
        const strip = document.getElementById('buildStrip'), sb = strip && strip.getBoundingClientRect();
        return { n: cs.length, rows: new Set(tops).size, // offsetTop ignores the deal-in animation transform, so a slow runner can't fake a second row
           scroll: s.scrollHeight - s.clientHeight, inX: cs.every((c) => c.left >= -1 && c.right <= innerWidth + 1),
          strip: !!sb && sb.height > 0 && sb.bottom <= innerHeight + 1 && sb.top >= 0, hasStrip: !!strip };
      });
      if (n === 5) await shot(page, `${name}-perks-5-cards`);
      record(area, `${n}-card hand: one row, no scroll, build strip visible`, r.n === n && r.rows === 1 && r.scroll <= 1 && r.inX && r.strip, JSON.stringify(r));
    }
    // v1.12.1: no toast may sit on the game-over headings
    await page.evaluate(() => { __overdue.game.cards = 3; __overdue.drive(false); __overdue.die(); });
    await page.waitForFunction(() => __overdue.game.state === 'gameover', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const toastOk = await page.evaluate(() => {
      const t = document.getElementById('toast'); if (t.hidden) return true;
      const tr = t.getBoundingClientRect();
      return ![...document.querySelectorAll('#gameover h2, #gameover h3')].filter((h) => h.offsetParent).some((h) => { const r = h.getBoundingClientRect(); return r.bottom > tr.top && r.top < tr.bottom && r.right > tr.left && r.left < tr.right; });
    });
    record(area, 'game over: no toast over the headings', toastOk);
  } catch (e) { record(area, 'menus flow completed', false, e.message.split('\n')[0]); }
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- 3b. portrait phone: rotate overlay (landscape-only since v1.4.0)
async function rotateOverlayFlow() {
  const record = recorder();
  const area = 'screens/iphone-rotate';
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(URL0); await page.waitForTimeout(700);
    await shot(page, 'iphone-rotate-overlay');
    const ov = await page.evaluate(() => {
      const o = document.getElementById('rotate'), r = o.getBoundingClientRect(), t = document.querySelector('.logo').getBoundingClientRect();
      const mid = document.elementFromPoint(innerWidth / 2, t.top + t.height / 2);
      return { visible: !o.hidden && r.width >= innerWidth - 1 && r.height >= innerHeight - 1, covers: o.contains(mid), text: o.textContent };
    });
    record(area, 'rotate overlay visible and covers the title', ov.visible && ov.covers && /landscape/.test(ov.text) && /sideways/.test(ov.text));
    // Start a run in landscape, then rotate to portrait
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(500);
    record(area, 'overlay hidden in landscape', await page.evaluate(() => document.getElementById('rotate').hidden));
    await page.tap('[data-act=play]'); await page.evaluate(() => __overdue.god()); await page.waitForTimeout(1500);
    record(area, 'run started in landscape', await page.evaluate(() => __overdue.game.state === 'playing'));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
    const portrait = await page.evaluate(() => ({ shown: !document.getElementById('rotate').hidden, state: __overdue.game.state }));
    record(area, 'rotating to portrait shows overlay and pauses', portrait.shown && portrait.state === 'paused', JSON.stringify(portrait));
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(600);
    await shot(page, 'iphone-rotate-back');
    const back = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      return { hidden: document.getElementById('rotate').hidden, pause: !document.getElementById('pause').hidden, state: __overdue.game.state, fill: (st.width * st.height) / (innerWidth * innerHeight) };
    });
    record(area, 'rotating back hides overlay, shows pause screen, no auto-resume', back.hidden && back.pause && back.state === 'paused', JSON.stringify(back));
    record(area, 'arena fills screen after rotating back', back.fill >= FILL_MIN, `${Math.round(back.fill * 100)}% of screen`);
  } catch (e) { record(area, 'flow completed', false, e.message.split('\n')[0]); }
  record(area, 'no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- 3c. rotation sequences (v1.11.1): same fill, no title overflow
const ROTATIONS = [
  ['iphone-13', [390, 844], [844, 390], ['portrait→landscape', 'landscape→portrait→landscape', 'app switch (hidden, portrait-sized, back)']],
  ['iphone-se', [375, 667], [667, 331], ['portrait→landscape', 'landscape→portrait→landscape', 'app switch (hidden, portrait-sized, back)']],
  ['iphone-15-pro-max', [430, 932], [932, 430], ['portrait→landscape', 'landscape→portrait→landscape', 'app switch (hidden, portrait-sized, back)']],
].flatMap(([label, port, land, seq]) => seq.map((kind) => [label, port, land, kind]));
async function rotationFlow(label, port, land, kind) {
  const record = recorder();
  const area = `screens/rotate-${label}`;
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: kind.startsWith('portrait') ? port[0] : land[0], height: kind.startsWith('portrait') ? port[1] : land[1] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(URL0); await page.waitForTimeout(600);
    if (kind === 'landscape→portrait→landscape') { await page.setViewportSize({ width: port[0], height: port[1] }); await page.waitForTimeout(400); }
    if (kind.startsWith('app switch')) {
      // v1.12.1: iOS reports a portrait-sized viewport while the page is in the app switcher and may send NO resize on return.
      const setHidden = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
      await setHidden(true);
      await page.setViewportSize({ width: port[0], height: port[1] }); await page.waitForTimeout(300);
      await page.setViewportSize({ width: land[0], height: land[1] }); await page.waitForTimeout(300);
      // Worst case: the page was shown the portrait overlay before the OS hid it
      await page.evaluate(() => { document.body.classList.add('rotate-needed'); document.getElementById('rotate').hidden = false; });
      await setHidden(false); await page.waitForTimeout(700);
    }
    else await page.setViewportSize({ width: land[0], height: land[1] }); await page.waitForTimeout(600);
    const r = await page.evaluate(`({ fill: (${FILL_JS})(), fit: (${TITLE_FIT_JS})(), grid: __overdue.grid(), rot: document.getElementById('rotate').hidden })`);
    if (label === 'iphone-13') await shot(page, `rotate-${kind.startsWith('portrait') ? 'p2l' : kind.startsWith('app') ? 'appswitch' : 'l2p2l'}`);
    record(area, `${kind}: fill ≥ ${FILL_MIN * 100}% and title fits`, r.rot && r.fill >= FILL_MIN && r.fit.length === 0, `${Math.round(r.fill * 100)}% · ${r.grid} · ${r.fit.join(' | ')}`);
  } catch (e) { record(area, `${kind}: flow completed`, false, e.message.split('\n')[0]); }
  record(area, `${kind}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- 4b. one story room per layout shape (iphone-landscape)
async function shapesFlow() {
  const record = recorder();
  const { WINGS, ROOMS_PER_WING, roomShape } = await import(pathToFileURL(join(ROOT, 'src/story.js')).href);
  const { SHAPES } = await import(pathToFileURL(join(ROOT, 'src/arena.js')).href);
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL0); await page.waitForTimeout(500);
  for (const shape of SHAPES) {
    // Prefer a mid-to-late normal room so the shape is at a decent density.
    let pick = null;
    for (const r of [6, 5, 3, 2, 1, 4, 7]) for (let w = 1; w <= WINGS.length && !pick; w++) if (roomShape(w, r) === shape) pick = [w, r];
    if (!pick) { record('shapes', `${shape}: a story room uses it`, shape === 'scatter' ? true : false, 'no wing/room found'); continue; }
    await page.evaluate(([w, r]) => { const O = __overdue; O.unlockAll(); O.startRun('story', w); O.startWave(r); O.god(); }, pick);
    await page.waitForTimeout(1500);
    await shot(page, `shape-${shape}`);
    if (shape === 'bridge') await shot(page, 'iphone-landscape-bridge-room'); // v1.11.2: one continuous wall
    const ok = await page.evaluate(() => __overdue.game.state === 'playing' && Number.isFinite(__overdue.player.x));
    record('shapes', `${shape} room (wing ${pick[0]} room ${pick[1]}) plays`, ok);
  }
  record('shapes', 'no script errors', errs.length === 0, errs.join('; ').slice(0, 200));
  await ctx.close();
  return record.list;
}


// ---------------------------------------------------------------- 4c. app basics (v1.13.1): offline play, update, kill switch, backup code, Home Screen nudge
async function basicsFlow() {
  const record = recorder(); const area = 'basics';
  const dir = join(OUT, 'site-live'); await cp(SITE, dir, { recursive: true });
  // Served under /overdue/ like GitHub Pages, with a 10-minute HTTP cache like GitHub Pages (a worker must not be fooled by it).
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith('/overdue/')) { res.writeHead(404).end(); return; }
    const rel = path.slice(9) || 'index.html';
    try { res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }).end(await readFile(join(dir, rel))); }
    catch { res.writeHead(404).end(); }
  }).listen(0);
  const base = `http://localhost:${srv.address().port}/overdue/`;
  const phone = devices['iPhone 13 landscape'];
  try {
    // ---- offline play ----
    const ctx = await browser.newContext({ ...phone, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${base}?debug=1`); await page.waitForTimeout(400);
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
    const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r?.scope || '', cached: (await caches.keys()).join(',') }; });
    record(area, 'worker registers under /overdue/ and caches the game', reg.scope === base && /^overdue-/.test(reg.cached), JSON.stringify(reg));
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('body.ready', { timeout: 10000 }).catch(() => {});
    const offTitle = await page.evaluate(() => ({ screen: !document.getElementById('title').hidden, label: document.querySelector('.version-label').textContent }));
    await shot(page, 'basics-title-offline');
    record(area, 'offline: reload shows the title screen', offTitle.screen && /v1\./.test(offTitle.label), offTitle.label);
    await page.evaluate(() => __overdue.startRun('endless')); await page.waitForTimeout(700);
    record(area, 'offline: a run starts and plays', await page.evaluate(() => __overdue.game.state === 'playing' && Number.isFinite(__overdue.player.x)));
    const noQuery = await ctx.newPage(); await noQuery.goto(base); await noQuery.waitForSelector('body.ready', { timeout: 10000 }).catch(() => {});
    record(area, 'offline: opening the plain /overdue/ link works too', await noQuery.evaluate(() => !document.getElementById('title').hidden)); await noQuery.close();
    await ctx.setOffline(false);

    // ---- update N -> N+1 ----
    const oldCommit = BUILD.commit, newCommit = 'beef123';
    const sw0 = await page.evaluate(() => fetch('sw.js').then((r) => r.text()));
    await page.reload(); await page.waitForSelector('body.ready');
    for (const f of ['index.html', 'version.json', 'sw.js']) {
      const t = (await readFile(join(dir, f), 'utf8')).split(oldCommit).join(newCommit);
      await writeFile(join(dir, f), f === 'index.html' ? t.replace('<title>', '<title>') : t);
    }
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForSelector('#updateBar:not([hidden])', { timeout: 10000 }).catch(() => {});
    const barOn = await page.evaluate(() => !document.getElementById('updateBar').hidden);
    record(area, 'update: serving N+1 shows the update bar while N is open', barOn && (await page.textContent('#updateBar')).includes(newCommit), (await page.textContent('#updateBar')).slice(0, 60));
    await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r.waiting; }, null, { timeout: 10000 }).catch(() => {});
    record(area, 'update: the new build is fetched in the background (worker waiting)', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting));
    const stayed = await page.evaluate(() => document.querySelector('.version-label').textContent);
    record(area, 'update: the open page keeps running N until the player taps', stayed.includes(oldCommit), stayed);
    await shot(page, 'basics-update-bar');
    await page.tap('#updateBar');
    await page.waitForFunction((c) => document.querySelector('.version-label')?.textContent.includes(c), newCommit, { timeout: 15000 }).catch(() => {});
    const afterLabel = await page.evaluate(() => document.querySelector('.version-label').textContent);
    record(area, 'update: after the tap the title shows N+1', afterLabel.includes(newCommit), afterLabel);
    await ctx.setOffline(true); await page.reload(); await page.waitForSelector('body.ready', { timeout: 10000 }).catch(() => {});
    const offNew = await page.evaluate(() => document.querySelector('.version-label').textContent);
    record(area, 'update: N+1 also opens offline (old cache replaced)', offNew.includes(newCommit), offNew);
    await ctx.setOffline(false);
    const caches2 = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('overdue-')));
    record(area, 'update: only the newest cache is kept', caches2.length === 1 && caches2[0].includes(newCommit), caches2.join(','));

    // ---- kill switch ----
    const killDir = join(OUT, 'kill'); await mkdir(killDir, { recursive: true });
    execSync(`node scripts/build.mjs ${join(killDir, 'overdue.html')}`, { cwd: ROOT, env: { ...process.env, OVERDUE_KILL_SW: '1' }, stdio: 'pipe' });
    const killSw = await readFile(join(killDir, 'sw.js'), 'utf8');
    record(area, 'kill switch: OVERDUE_KILL_SW=1 builds a self-removing worker and no page registration', /const KILL = true;/.test(killSw) && /"sw": false/.test(await readFile(join(killDir, 'version.json'), 'utf8')));
    // The kill release replaces the page too (it stamps sw:false, so it never registers again).
    await writeFile(join(dir, 'sw.js'), killSw); await cp(join(killDir, 'overdue.html'), join(dir, 'index.html')); await cp(join(killDir, 'version.json'), join(dir, 'version.json'));
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    // Poll from node: the page navigates itself when the kill worker takes over, which destroys evaluate contexts.
    let killed = { regs: -1, caches: -1 };
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      try { killed = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length })); } catch { continue; }
      if (killed.regs === 0 && killed.caches === 0) break;
    }
    record(area, 'kill switch: worker unregisters itself and clears its caches', killed.regs === 0 && killed.caches === 0, JSON.stringify(killed));
    record(area, 'worker: no script errors', errs.length === 0, errs.join('; ').slice(0, 200));
    await ctx.close();

    // ---- hosted (--fragment) build never registers a worker ----
    const fragDir = join(OUT, 'frag'); await mkdir(fragDir, { recursive: true });
    execSync(`node scripts/build.mjs --fragment ${join(fragDir, 'frag.html')}`, { cwd: ROOT, stdio: 'pipe' });
    const frag = await readFile(join(fragDir, 'frag.html'), 'utf8');
    record(area, 'fragment build: no worker file, no sw stamp', !existsSync(join(fragDir, 'sw.js')) && !/"sw":/.test(frag));

    // ---- backup code: copy, restore, bad code ----
    const c2 = await browser.newContext({ ...phone, permissions: ['clipboard-read', 'clipboard-write'] });
    const bp = await c2.newPage(); await bp.goto(`http://localhost:${server.address().port}/?debug=1`); await bp.waitForSelector('body.ready');
    await bp.evaluate(() => { localStorage.setItem('overdue.progress.v1', JSON.stringify({ fines: 4321, unlocked: 2 })); localStorage.setItem('overdue.name.v1', JSON.stringify({ name: 'Ada' })); localStorage.setItem('overdue.tips.v1', JSON.stringify({ seen: ['firstrun'] })); });
    await bp.tap('#title [data-act=settings]'); await bp.waitForTimeout(200); await bp.tap('#btnBackup'); await bp.waitForTimeout(200);
    await bp.tap('#btnCopyBackup'); await bp.waitForTimeout(300);
    const code = await bp.evaluate(() => navigator.clipboard.readText());
    record(area, 'backup: copy puts an OVD1 code on the clipboard and shows it', /^OVD1:[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(code) && (await bp.inputValue('#backupOut')) === code, code.slice(0, 24));
    const snap = () => bp.evaluate(() => JSON.stringify(['settings', 'best', 'name', 'halloffame', 'codex', 'progress', 'tips'].map((k) => localStorage.getItem(`overdue.${k}.v1`))));
    const before = await snap();
    for (const bad of [code.slice(0, code.length - 6), code.replace('OVD1:', 'OVD9:'), code.slice(0, 15) + (code[15] === 'a' ? 'b' : 'a') + code.slice(16), 'hello']) {
      await bp.fill('#backupIn', bad); await bp.tap('#btnRestoreBackup'); await bp.waitForTimeout(120);
      const st = await bp.evaluate(() => ({ err: document.getElementById('backupMsg').textContent, confirm: !document.getElementById('restoreConfirm').hidden }));
      if (st.confirm || !/Nothing was changed/.test(st.err) || (await snap()) !== before) { record(area, 'backup: a bad code shows an error and changes nothing', false, `${bad.slice(0, 20)} → ${st.err}`); break; }
    }
    record(area, 'backup: bad, truncated, wrong-version and tampered codes change nothing', true);
    await bp.evaluate(() => { for (const k of ['progress', 'name', 'tips']) localStorage.removeItem(`overdue.${k}.v1`); });
    await bp.fill('#backupIn', `  ${code.slice(0, 30)}\n${code.slice(30)}  `); await bp.tap('#btnRestoreBackup'); await bp.waitForTimeout(150);
    const confirmShown = await bp.evaluate(() => !document.getElementById('restoreConfirm').hidden);
    await shot(bp, 'basics-backup-confirm');
    const untouched = await bp.evaluate(() => localStorage.getItem('overdue.progress.v1'));
    record(area, 'backup: a valid code only asks for confirmation first (nothing written yet)', confirmShown && untouched === null);
    await bp.tap('#btnRestoreYes');
    await bp.waitForFunction(() => document.body.classList.contains('ready') && localStorage.getItem('overdue.progress.v1'), null, { timeout: 10000 }).catch(() => {});
    await bp.waitForTimeout(400);
    const restored = await bp.evaluate(() => ({ p: JSON.parse(localStorage.getItem('overdue.progress.v1') || '{}'), n: JSON.parse(localStorage.getItem('overdue.name.v1') || '{}'), t: JSON.parse(localStorage.getItem('overdue.tips.v1') || '{}') }));
    record(area, 'backup: confirm restores progress, name and tips', restored.p.fines === 4321 && restored.n.name === 'Ada' && restored.t.seen?.includes('firstrun'), JSON.stringify(restored.p).slice(0, 60));
    await c2.close();

    // ---- Home Screen nudge ----
    const nudgeRun = async (init, secs, label, expectShow, setup) => {
      const c = await browser.newContext(phone);
      if (init) await c.addInitScript(init);
      const p = await c.newPage(); await p.goto(`http://localhost:${server.address().port}/?debug=1`); await p.waitForSelector('body.ready');
      if (setup) await p.evaluate(setup);
      await p.evaluate((s) => { __overdue.startRun('endless'); __overdue.game.playTime = s; __overdue.drive(false); }, secs);
      await p.evaluate(() => { __overdue.player.hp = 1; __overdue.die(); });
      await p.waitForFunction(() => __overdue.game.state === 'gameover', null, { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1300);
      const shown = await p.evaluate(() => !document.getElementById('nudge').hidden);
      const tips = await p.evaluate(() => JSON.parse(localStorage.getItem('overdue.tips.v1') || '{}').seen || []);
      return { c, p, shown, tips };
    };
    let r = await nudgeRun(null, 200, 'long run', true);
    await shot(r.p, 'basics-nudge-card');
    const txt = await r.p.textContent('#nudge');
    const fit = await r.p.evaluate(() => { const b = document.querySelector('#nudge .nudge-card').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1; });
    record(area, 'nudge: a 3+ minute first run shows the card once, with the Safari steps', r.shown && /Share/.test(txt) && /Add to Home Screen/.test(txt) && /Got it/.test(txt) && /Don.t show again/.test(txt) && r.tips.includes('a2hs'), r.tips.join(','));
    record(area, 'nudge: card fits the phone screen', fit);
    await r.p.tap('#btnNudgeOk'); await r.p.waitForTimeout(150);
    record(area, 'nudge: Got it closes the card', await r.p.evaluate(() => document.getElementById('nudge').hidden));
    await r.p.evaluate(() => { __overdue.startRun('endless'); __overdue.game.playTime = 400; __overdue.player.hp = 1; __overdue.player.inv = 0; __overdue.die(); });
    await r.p.waitForFunction(() => __overdue.game.state === 'gameover', null, { timeout: 20000 }).catch(() => {});
    await r.p.waitForTimeout(1300);
    record(area, 'nudge: never shown a second time', await r.p.evaluate(() => document.getElementById('nudge').hidden));
    await r.c.close();
    r = await nudgeRun(null, 40, 'short run', false);
    record(area, 'nudge: a short first run does not show it', !r.shown && !r.tips.includes('a2hs')); await r.c.close();
    r = await nudgeRun(null, 200, 'off', true);
    await r.p.tap('#btnNudgeOff'); await r.p.waitForTimeout(150);
    record(area, 'nudge: Don’t show again is remembered', await r.p.evaluate(() => document.getElementById('nudge').hidden && JSON.parse(localStorage.getItem('overdue.tips.v1')).seen.includes('a2hs-off'))); await r.c.close();
    r = await nudgeRun(() => Object.defineProperty(navigator, 'standalone', { get: () => true }), 200, 'ios standalone', false);
    record(area, 'nudge: never shown when running as an installed app (navigator.standalone)', !r.shown && !r.tips.includes('a2hs')); await r.c.close();
    r = await nudgeRun(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q)); }, 200, 'display-mode', false);
    record(area, 'nudge: never shown when display-mode is standalone', !r.shown && !r.tips.includes('a2hs')); await r.c.close();
    const cw = await browser.newContext(phone); const wp = await cw.newPage(); await wp.goto(`http://localhost:${server.address().port}/?debug=1`); await wp.waitForSelector('body.ready');
    record(area, 'nudge: a cleared story wing triggers it (rule check)', await wp.evaluate(() => __overdue.maybeNudge(true, 5) === true)); await cw.close();
  } catch (e) { record(area, 'basics flow completed', false, e.message.split('\n')[0]); }
  srv.close();
  return record.list;
}

// ---------------------------------------------------------------- run everything except perf, N contexts at a time
// Slowest flows first so the pool stays busy. Perf is NOT in the pool: it runs alone afterwards so fps stays comparable.
{
  const tasks = [];
  const fullOn = (name) => FULL || FULL_TARGETS.has(name);
  if (want('screens')) for (const [name, opts] of TARGETS.filter(([n]) => fullOn(n))) tasks.push(() => screensFlow(name, opts, true));
  if (want('screens')) for (const [name, opts] of TARGETS.filter(([n]) => !fullOn(n))) tasks.push(() => screensFlow(name, opts, false));
  if (want('menus')) for (const [name, opts] of TARGETS) tasks.push(() => menusFlow(name, opts));
  if (want('screens')) { tasks.push(() => rotateOverlayFlow()); for (const r of ROTATIONS) tasks.push(() => rotationFlow(...r)); }
  if (want('shapes')) tasks.push(() => shapesFlow());
  if (want('basics')) tasks.unshift(() => basicsFlow());
  const t0 = Date.now();
  // Report order stays stable: screens (full, then fit), menus, rotation, shapes, regardless of finish order.
  for (const list of await pool(tasks, JOBS)) results.push(...list);
  console.log(`(parallel section: ${tasks.length} flows, ${JOBS} at a time, ${Math.round((Date.now() - t0) / 1000)}s)`);
}

// ---------------------------------------------------------------- 4. performance budget
// Late-game boss with a stacked build: this once ran at 0.4x game speed (chained hit-stop) and ~40fps.
if (want('perf')) {
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
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
  // Story late game: wing 10 room 6, a crowd of elites firing fans of pages.
  await page.evaluate(() => { const O = __overdue; O.unlockAll(); O.startRun('story', 10); O.startWave(6); O.god(); });
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
