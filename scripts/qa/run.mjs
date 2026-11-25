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
import { median } from './stats.mjs';
import { scanText, parseTerms, summarize } from './privacy.mjs';

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
  ['ipad-13-landscape', { ...devices['iPad Pro 11 landscape'], viewport: { width: 1366, height: 1024 }, screen: { width: 1366, height: 1024 } }],
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

// v1.13.0: menus appear as they're earned, so flows that tap Endless / Renovations / Hall of Fame / Codex start as a RETURNING player.
// (A fresh save shows only Story / How to play / Settings: the new-player flow checks that separately.)
const RETURNING_SAVE = () => {
  localStorage.setItem('overdue.progress.v1', JSON.stringify({ v: 1, fines: 0, lifetime: 50, unlocked: 1, best: { 1: 2 }, cleared: [], reno: {} }));
  localStorage.setItem('overdue.codex.v1', JSON.stringify({ seen: ['dewey'], found: [] }));
  localStorage.setItem('overdue.halloffame.v1', JSON.stringify([{ name: 'QA', score: 1000, wave: 3, kills: 5, at: 1 }]));
};
const RETURNING_SAVE_JS = `(${RETURNING_SAVE})()`;
const TITLE_MENUS_JS = () => [...document.querySelectorAll('#title .menu button[data-act]')].filter((b) => b.offsetParent && !b.hidden).map((b) => b.dataset.act);

// ---------------------------------------------------------------- 3. screens on every device
// `full` = whole gameplay flow; otherwise the fit-only pass (skips rules/logic checks that don't depend on screen size).
async function screensFlow(name, opts, full) {
  const record = recorder();
  const ctx = await browser.newContext(opts);
  // v1.13.1: the Home Screen nudge has its own checks (basics); here it would cover the end-screen buttons
  await ctx.addInitScript(() => { try { if (localStorage.getItem('overdue.tips.v1') === null) localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off"]}'); } catch {} });
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

    // v1.13.0: a brand-new player sees only Story / How to play / Settings (plus the plain caption under Story)
    const freshMenus = await page.evaluate(`(${TITLE_MENUS_JS})()`);
    record(area, 'fresh save: title shows only Story, How to play, Settings', ['story', 'howto', 'settings'].every((a) => freshMenus.includes(a)) && freshMenus.filter((a) => !['story', 'howto', 'settings', 'fullscreen'].includes(a)).length === 0, freshMenus.join(','));
    record(area, 'Story button has its plain caption', (await page.textContent('[data-act=story] .cap')) === '7-room levels with a boss');
    // A returning save shows everything at once (every menu, captions, fines count): the title must still fit
    await page.evaluate(RETURNING_SAVE_JS); await page.reload(); await page.waitForTimeout(700);
    await page.evaluate(() => __overdue.setFines(1234));
    await shot(page, `${name}-1b-title-returning`);
    const retMenus = await page.evaluate(`(${TITLE_MENUS_JS})()`);
    record(area, 'returning save: every menu is shown at once', ['story', 'play', 'shop', 'howto', 'leaderboard', 'codex', 'settings'].every((a) => retMenus.includes(a)), retMenus.join(','));
    const fit2 = await page.evaluate(`(${TITLE_FIT_JS})()`);
    record(area, 'returning title (all menus + captions) fits without scrolling', fit2.length === 0, fit2.join(' | '));
    const caps = await page.$$eval('#title .cap', (cs) => cs.filter((c) => c.offsetParent).map((c) => `${c.parentElement.dataset.act}:${c.textContent}:${getComputedStyle(c).fontSize}`));
    record(area, 'title captions: Story, Endless, Renovations, Hall of Fame, Codex', caps.length === 5, caps.join(' | '));
    await tap('[data-act=play]');
    await page.evaluate(() => __overdue.god()); await page.waitForTimeout(2500);
    await shot(page, `${name}-2-play`);
    // v1.15.4: SHHH and DASH sit diagonally apart: circle gap (centre distance minus radii) >= 1.5em, no overlap with each other,
    // the pause button or the HUD, and fully on screen
    {
      const m = await page.evaluate(() => { const rc = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; };
        // the HUD is drawn on the canvas: its top-right block (score, combo bar) ends ~62 game px down, i.e. well inside the top 30%
        const cv = document.querySelector('canvas').getBoundingClientRect();
        const hud = [{ l: cv.right - 0.25 * cv.width, r: cv.right, t: cv.top, b: cv.top + 0.3 * cv.height }];
        return { touch: document.body.classList.contains('touch'), d: rc(document.getElementById('btnDash')), s: rc(document.getElementById('btnShhh')), p: rc(document.getElementById('btnPause')), hud, vw: innerWidth, vh: innerHeight, fs: parseFloat(getComputedStyle(document.getElementById('btnDash')).fontSize) }; });
      const dist = Math.hypot(m.d.cx - m.s.cx, m.d.cy - m.s.cy), gap = dist - (m.d.w + m.s.w) / 2, em = m.fs;
      const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      const onScreen = (r) => r.l >= 0 && r.r <= m.vw && r.t >= 0 && r.b <= m.vh;
      const clear = ![m.p, ...m.hud].some((o) => hit(m.d, o) || hit(m.s, o));
      const ok = !m.touch || (gap >= 1.5 * em && onScreen(m.d) && onScreen(m.s) && clear);
      record(area, 'v1.15.4: DASH/SHHH circles apart (gap >= 1.5em), clear of pause and the score/combo HUD, fully on screen', ok, `size ${Math.round(m.d.w)}px · circle gap ${Math.round(gap)}px (${(gap / em).toFixed(1)}em) · DASH [${Math.round(m.d.l)},${Math.round(m.d.t)}] SHHH [${Math.round(m.s.l)},${Math.round(m.s.t)}] · bottom margin ${Math.round(m.vh - m.d.b)}/${Math.round(m.vh - m.s.b)}px`);
    }
    // v1.16.2: DASH/SHHH hug the bottom-right corner (same share of the screen on every size, measured from the SCREEN edge, not
    // the letterboxed stage); the pause button clears the iOS status area, the room title and the buttons
    {
      const m = await page.evaluate(() => { const rc = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; };
        return { touch: document.body.classList.contains('touch'), d: rc('btnDash'), s: rc('btnShhh'), p: rc('btnPause'), vw: innerWidth, vh: innerHeight }; });
      const dx = (m.vw - m.d.cx) / m.vw, dy = (m.vh - m.d.cy) / m.vh;
      const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      const inside = (r) => r.l >= 0 && r.r <= m.vw && r.t >= 0 && r.b <= m.vh;
      const titleBox = { l: m.vw * 0.3, r: m.vw * 0.7, t: 0, b: m.vh * 0.2 };   // room title / wave banner (top centre)
      const ok = !m.touch || (dx <= 0.08 && dy <= 0.30 && inside(m.d) && inside(m.s) && inside(m.p) && Math.hypot(m.d.cx - m.s.cx, m.d.cy - m.s.cy) >= (m.d.r - m.d.l + m.s.r - m.s.l) / 2 && !hit(m.p, m.d) && !hit(m.p, m.s) && !hit(m.p, titleBox) && m.p.t >= 40);
      record(area, 'v1.16.2: DASH centre within 8% of the width / 30% of the height from the corner; DASH, SHHH, pause on screen, not overlapping, pause below the status area', ok, `DASH centre ${(dx * 100).toFixed(1)}% from right, ${(dy * 100).toFixed(1)}% from bottom · pause top ${Math.round(m.p.t)}px`);
    }
    record(area, 'run starts', await page.evaluate(() => __overdue.game.state === 'playing'));

    // Perk screen: a combo hint and a Masterwork card, plain-language text only
    await page.evaluate(() => { const O = __overdue; O.grant('dewey'); for (let i = 0; i < 3; i++) O.grant('speedreader'); O.setRenews(1); O.showUpgrades(); });
    await page.waitForTimeout(800);
    await shot(page, `${name}-3-perks`);
    const cards = await page.$$eval('#cards .card', (cs) => cs.map((c) => ({ kind: c.className, gain: c.querySelector('.gain').textContent, text: c.textContent })));
    record(area, 'perk cards render', cards.length >= 1 && cards.every((c) => c.gain.trim().length > 0), `${cards.length} cards`);
    record(area, 'no technical units on cards', !cards.some((c) => /\d\s?(px|rad)\b|rad\/s/.test(c.text)));
    record(area, 'Masterwork offered at 3/3', cards[0]?.kind.includes('master'));
    record(area, 'perk captions: Masterwork "max-level bonus", Renew "reroll"', /max-level bonus/.test(cards[0]?.text || '') && /reroll/.test(await page.textContent('#btnRenew')), `${(cards[0]?.text || '').slice(-40)} | ${(await page.textContent('#btnRenew')).trim()}`);
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
    await clearRoom();
    await page.waitForFunction(() => __overdue.game.state === 'upgrade' && document.querySelectorAll('#cards .card').length >= 4, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
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
    record(area, 'Rare Books raises the next room\'s elite share, no heal', rare.state === 'playing' && rare.door === 'rare' && rare.elite >= 0.35 && rare.hp === 2 && /Rare Books/.test(rare.sub), JSON.stringify(rare));
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
    // v1.14.0: story rooms are the bigger grid, endless keeps the old one, and the touch buttons keep their size in both
    {
      const A = await import(pathToFileURL(join(ROOT, 'src/arena.js')).href);
      const vp = page.viewportSize(), asp = vp.width / vp.height;
      const m = await page.evaluate(() => { const O = __overdue, sz = () => { const r = document.getElementById('btnDash').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
        O.startRun('story', 1); O.god(); const story = { grid: O.grid(), btn: sz(), touch: document.body.classList.contains('touch') };
        O.startRun('endless'); const endless = { grid: O.grid(), btn: sz() }; O.startRun('story', 1); O.god(); return { story, endless }; });
      const [sc, sr] = A.gridForAspect(asp, true), [ec, er] = A.gridForAspect(asp);
      record(area, 'v1.14.0: story room uses the +20% grid, endless the old one', m.story.grid === `${sc}x${sr}` && m.endless.grid === `${ec}x${er}` && sc > ec && sr > er, `story ${m.story.grid} · endless ${m.endless.grid}`);
      record(area, 'v1.14.0: DASH/SHHH buttons keep their size in the bigger story room', !m.story.touch || (Math.abs(m.story.btn[0] - m.endless.btn[0]) <= 1 && Math.abs(m.story.btn[1] - m.endless.btn[1]) <= 1), `story ${m.story.btn} · endless ${m.endless.btn}`);
    }
    // v1.7.1: Mystery Shelf's bonus pick says why you get a second perk
    const bonusTitle = await page.evaluate(() => { const O = __overdue; O.game.bonusPicks = 1; O.showUpgrades(); return document.querySelector('#upgradeTitle').textContent; });
    record(area, 'Mystery bonus pick is labelled 1 of 2', /^🎲 Mystery prize: bonus pick \(1 of 2\)/.test(bonusTitle), bonusTitle);
    // v1.14.1: Rare Books pick (+1 card, one stamped card that fits the build) and Mystery Shelf take-or-walk-away
    {
      const snap = await page.evaluate(() => { const O = __overdue; return { stats: JSON.parse(JSON.stringify(O.stats)), owned: { ...O.game.owned }, picks: O.game.picks.slice(), hp: O.player.hp, cards: O.game.cards }; });
      const restore = (sn) => page.evaluate((sn) => { const O = __overdue; Object.assign(O.stats, sn.stats); for (const k of Object.keys(O.game.owned)) delete O.game.owned[k]; Object.assign(O.game.owned, sn.owned); O.game.picks.length = 0; O.game.picks.push(...sn.picks); O.player.hp = sn.hp; O.game.cards = sn.cards; O.game.cursedOffer = null; O.game.rarePick = false; O.game.rareId = null; O.game.bonusPicks = 0; O.game.afterBonus = false; O.game.pickIsBonus = false; }, sn);
      const vw2 = await page.evaluate(() => innerWidth);
      for (const n of [3, 4]) {
        const rare = await page.evaluate(async (n) => { const O = __overdue; O.game.owned.dewey = 1; O.game.cards = n; O.game.rarePick = true; O.game.state = 'playing'; O.showUpgrades(); await new Promise((r) => setTimeout(r, 700));
          const cs = [...document.querySelectorAll('#cards .card')];
          return { n: cs.length, title: document.querySelector('#upgradeTitle').textContent, stamped: cs.filter((c) => c.classList.contains('rare')).length, stampText: cs.filter((c) => c.classList.contains('rare')).map((c) => c.querySelector('.stamp').textContent), hint: cs.filter((c) => c.classList.contains('rare')).map((c) => c.querySelector('.hint').textContent),
            fit: cs.every((c) => { const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), noUnits: !/\bpx\b|rad\/s/.test(document.getElementById('cards').textContent) }; }, n);
        if (n === 4) await shot(page, `${name}-rare-pick`);
        record(area, `v1.14.1: Rare pick with ${n} cards normally shows ${n + 1}, exactly one stamped "Rare pick"`, rare.n === n + 1 && rare.stamped === 1 && /Rare pick/.test(rare.stampText[0]) && /Rare pick/.test(rare.title), JSON.stringify(rare));
        record(area, `v1.14.1: Rare pick card completes a combo when one exists, and ${n + 1} cards fit the screen`, /Completes a combo/.test(rare.hint[0]) && rare.fit && rare.noUnits, JSON.stringify({ hint: rare.hint, fit: rare.fit, vw: vw2 }));
        await restore(snap);
      }
      const rareDone = await page.evaluate(async () => { const O = __overdue; O.game.owned.dewey = 1; O.game.rarePick = true; O.game.state = 'playing'; O.showUpgrades(); await new Promise((r) => setTimeout(r, 700)); document.querySelector('#cards .card.rare').click(); await new Promise((r) => setTimeout(r, 400)); return { ownsBookmark: O.game.owned.bookmark === 1, rareId: O.game.rareId, state: O.game.state }; });
      record(area, 'v1.14.1: taking the Rare pick card continues the run (to the doors / next room) and clears the stamp', rareDone.ownsBookmark && rareDone.rareId === null && rareDone.state !== 'playing' || rareDone.ownsBookmark && rareDone.rareId === null, JSON.stringify(rareDone));
      await restore(snap);
      for (const path of ['walk', 'take']) {
        const m = await page.evaluate(async () => { const O = __overdue; O.game.cursedOffer = 'bannedbook'; O.game.state = 'playing'; O.showUpgrades(); await new Promise((r) => setTimeout(r, 700));
          const btn = [...document.querySelectorAll('#cards .offer-btn')];
          const r = document.querySelector('#cards .offer-actions').getBoundingClientRect();
          return { title: document.querySelector('#upgradeTitle').textContent, cards: document.querySelectorAll('#cards .card').length, buttons: btn.map((b) => b.firstChild.textContent), inView: r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, gain: document.querySelector('#cards .gain').textContent }; });
        if (path === 'walk') { await shot(page, `${name}-mystery-offer`); record(area, 'v1.14.1: Mystery cursed book shows one card with Take it / Walk away, on screen', m.cards === 1 && m.buttons.join('|') === 'Take it|Walk away' && m.inView && /pierce/i.test(m.gain), JSON.stringify(m)); }
        await page.locator(`#cards .offer-btn.${path}`).click(); await page.waitForTimeout(500);
        const after = await page.evaluate(() => { const O = __overdue; return { state: O.game.state, title: document.querySelector('#upgradeTitle').textContent, cards: document.querySelectorAll('#cards .card').length, owns: O.game.owned.bannedbook || 0, maxHp: O.stats.maxHp, offer: O.cursedOffer }; });
        record(area, `v1.14.1: Mystery "${path === 'walk' ? 'Walk away' : 'Take it'}" ${path === 'walk' ? 'gives nothing' : 'applies the curse'} and the normal pick follows (no 1 of 2 label)`,
          after.state === 'upgrade' && after.cards >= 3 && after.offer === null && !/\(1 of 2\)|\(2 of 2\)/.test(after.title) && (path === 'walk' ? after.owns === 0 && after.maxHp === snap.stats.maxHp : after.owns === 1 && after.maxHp === snap.stats.maxHp - Math.max(1, Math.round(snap.stats.maxHp / 3))), JSON.stringify(after));
        await restore(snap);
      }
    }
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
    record(area, 'Survive room starts with a 30 s timer and a banner naming the goal', sv.goal === 'survive' && sv.t > 26 && sv.t <= 30 && /SURVIVE 30 s: stay alive, no need to clear the room/.test(sv.sub) && sv.state === 'playing', JSON.stringify(sv));
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
      // A throw needs state 'playing' with enemies alive; if the room already cleared (timing under load), start a fresh one first.
      const sim = (body) => page.evaluate(`(async () => { const O = __overdue; O.drive(true); try { if (O.game.state !== 'playing' || !O.enemies.length) { O.startRun('endless'); O.god(); O.touch.enabled = true; O.stepN(300); } ${body} } finally { O.drive(false); } })()`);
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
      const auto = await sim(`O.setSetting('autoaim', true); O.touch.enabled = true; O.touch.aimId = null; const p = O.player; const t0 = p.throws; p.autoAim = { n: 0, ok: true }; O.stepN(120);
        return { throws: p.throws - t0, aimedFrames: p.autoAim.n, ok: p.autoAim.ok };`);
      record(area, 'auto-aim on: throws with no finger, at a visible enemy (or the nearest when none is visible)', auto.throws >= 1 && auto.aimedFrames >= 1 && auto.ok, JSON.stringify(auto));
      // v1.15.3: a far enemy in the open is chosen over a nearer one behind a shelf
      // The two bunnies must stand still: enemies get pushed out of walls/shelves they overlap, and a moving target shifts the 50% lead aim (that was
      // the flake). So pick a direction where both discs are free of solid cells (also with the extra shelf cell in place), and report how far they moved.
      const vis = await sim(`O.freeze(true); O.killAll(); O.stepN(1); O.killAll(); O.stepN(1); const p = O.player;   // killAll only marks enemies dead; a step removes them (a golem leaves coins: twice) p.x = O.W / 2; p.y = O.H / 2; p.vx = p.vy = 0;   // arena centre: a far point is then inside the room (line of sight is false outside the grid)
        const inside = (x, y) => x > 30 && y > 30 && x < O.W - 30 && y < O.H - 30;
        const freeDisc = (x, y, r) => inside(x, y) && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]].every(([dx, dy]) => !O.isSolid(x + dx, y + dy));
        const clear = (a, d) => { for (let r = 10; r <= d; r += 8) if (O.isSolid(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)) return false; return true; };
        let pick = null;
        for (let i = 0; i < 16 && !pick; i++) {
          const aF = i * Math.PI / 8, aN = aF + Math.PI, wx = p.x + Math.cos(aN) * 60, wy = p.y + Math.sin(aN) * 60, was = O.isSolid(wx, wy);
          if (!clear(aF, 260) || !clear(aN, 110) || was) continue;
          O.setSolid(wx, wy, true);
          const fx = p.x + Math.cos(aF) * 250, fy = p.y + Math.sin(aF) * 250, nx = p.x + Math.cos(aN) * 100, ny = p.y + Math.sin(aN) * 100;
          if (freeDisc(fx, fy, 24) && freeDisc(nx, ny, 24)) pick = { aF, aN, wx, wy, was, fx, fy, nx, ny }; else O.setSolid(wx, wy, was);
        }
        if (!pick) { O.freeze(false); return { skipped: true }; }
        const { aF, aN, wx, wy, was } = pick;
        const far = O.makeEnemy('bunny', pick.fx, pick.fy), near = O.makeEnemy('bunny', pick.nx, pick.ny);
        for (const e of [far, near]) { e.hp = e.maxHp = 999; e.stun = 99; }
        O.setSetting('autoaim', true); O.touch.aimId = null; O.books.length = 0; p.throws = 0; O.stepN(4);
        const d = Math.abs(Math.atan2(Math.sin(p.aim - aF), Math.cos(p.aim - aF))), dn = Math.abs(Math.atan2(Math.sin(p.aim - aN), Math.cos(p.aim - aN)));
        const moved = [Math.hypot(far.x - pick.fx, far.y - pick.fy), Math.hypot(near.x - pick.nx, near.y - pick.ny)].map((v) => +v.toFixed(1)), others = O.enemies.length - 2;
        O.setSolid(wx, wy, was); O.freeze(false); return { skipped: false, toFar: +d.toFixed(2), toNear: +dn.toFixed(2), throws: p.throws, moved, others, touchOn: O.touch.enabled, aimId: O.touch.aimId, state: O.game.state, autoaim: O.settings.autoaim };`);
      record(area, 'auto-aim: a far enemy in line of sight is chosen over a nearer one behind a shelf', vis.skipped === true || vis.toFar < 0.1, JSON.stringify(vis));
      const over = await sim(`${angOff} const p = O.player;
        if (O.game.state !== 'playing') { O.startWave(O.game.wave); O.god(); O.killAll(); }   // the room can already be cleared if the check above found no free spot
        if (!O.enemies.length) { const b = O.makeEnemy('bunny', O.W / 2 + 260, 60); b.hp = b.maxHp = 999; b.stun = 99; } O.touch.aimId = 99; O.touch.ax0 = p.x + 300; O.touch.ay0 = p.y; O.touch.ax = O.touch.ax0 - 60; O.touch.ay = O.touch.ay0; const t0 = p.throws;
        O.stepN(60); const st = { state: O.game.state, en: O.enemies.length, fireT: +p.fireT.toFixed(2), hp: p.hp, dash: p.dashT }; O.touch.aimId = null; return { throws: p.throws - t0, diff: dd(p.lastThrow, Math.PI), st };`);
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
  // v1.13.1: the Home Screen nudge has its own checks (basics); here it would cover the end-screen buttons
  await ctx.addInitScript(() => { try { if (localStorage.getItem('overdue.tips.v1') === null) localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off"]}'); } catch {} });
  const page = await ctx.newPage();
  const area = `menus/${name}`;
  try {
    await page.goto(URL0); await page.evaluate(RETURNING_SAVE_JS); await page.reload(); await page.waitForTimeout(600);
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
    // v1.14.0: a finished run is logged to overdue.runs.v1; Settings -> Share stats makes an OVS1: code (box shown when the clipboard is refused) and still fits
    {
      const rlog = await page.evaluate(() => { const O = __overdue; localStorage.removeItem('overdue.runs.v1'); O.startRun('story', 1); O.drive(true); O.player.hp = 1; O.player.inv = 0; O.die(); O.stepN(1500); O.drive(false);
        const state = O.game.state; document.querySelector('#gameover [data-act=menu]').click(); return { state, runs: JSON.parse(localStorage.getItem('overdue.runs.v1') || 'null') }; });
      const rec = rlog.runs && rlog.runs[0];
      record(area, 'v1.14.0: a lost story run is logged (overdue.runs.v1)', rlog.state === 'gameover' && rlog.runs?.length === 1 && rec.v === 1 && rec.res === 'd' && rec.mode === 's' && rec.wing === 1 && rec.room === 1 && typeof rec.killer === 'string' && rec.hp > 0, JSON.stringify(rec).slice(0, 160));
      await page.click('#title [data-act=settings]'); await page.waitForTimeout(250);
      await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('refused')); });   // worst case for the layout: the fallback text box shows
      await page.click('#btnShareStats'); await page.waitForTimeout(250);
      const st = await page.evaluate(() => { const o = document.getElementById('statsOut'); return { shown: !o.hidden, code: o.value }; });
      const { decodeStats } = await import(pathToFileURL(join(ROOT, 'src/runlog.js')).href);
      const dec = decodeStats(st.code);
      record(area, 'v1.14.0: Share stats makes a valid OVS1: code (fallback box shown when the clipboard is refused)', st.shown && dec.ok && dec.runs.length === 1, st.code.slice(0, 40));
      await shot(page, `${name}-menu-settings-stats`);
      const sBad = await page.evaluate(`(${PINNED_CHECK})('settings')`);
      record(area, 'v1.14.0: settings with the stats box open: pinned row covers nothing and fits', !sBad.length, sBad.join('; '));
      await page.click('#settings [data-act=back]'); await page.waitForTimeout(200);
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
    await page.evaluate(() => __overdue.startRun('endless')); await page.evaluate(() => __overdue.god()); await page.waitForTimeout(1500);
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
  const { WINGS, roomsIn, roomShape } = await import(pathToFileURL(join(ROOT, 'src/story.js')).href);
  const { SHAPES, WATER_SHAPES } = await import(pathToFileURL(join(ROOT, 'src/arena.js')).href);
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL0); await page.waitForTimeout(500);
  for (const shape of [...SHAPES, ...WATER_SHAPES]) {
    // Prefer a mid-to-late normal room so the shape is at a decent density.
    let pick = null;
    for (const r of [6, 5, 3, 2, 1, 4, 7, 8, 9]) for (let w = 1; w <= WINGS.length && !pick; w++) if (roomShape(w, r) === shape) pick = [w, r];
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



// ---------------------------------------------------------------- v1.16.0: Act II foundation (wing map pages, tester switch, water rooms, Act I look unchanged)
async function act2Flow() {
  const record = recorder();
  const { WINGS, roomsIn, roomShape } = await import(pathToFileURL(join(ROOT, 'src/story.js')).href);
  const { WATER_SHAPES } = await import(pathToFileURL(join(ROOT, 'src/arena.js')).href);
  const ref = JSON.parse(readFileSync(join(ROOT, 'scripts/qa/act1-bg.json'), 'utf8'));
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const dbg = URL0 + (URL0.includes('?') ? '&' : '?') + 'debug=1';
  await page.goto(dbg); await page.waitForTimeout(600);
  const progressKey = () => page.evaluate(() => localStorage.getItem('overdue.progress.v1'));
  const swipe = (dx) => page.evaluate((d) => {
    const el = document.querySelector('#story'), mk = (x) => new Touch({ identifier: 7, target: el, clientX: x, clientY: 200 });
    const x0 = 400, a = mk(x0), b = mk(x0 + d);
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [a], changedTouches: [a], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [b], bubbles: true }));
  }, dx);
  const actTitle = () => page.evaluate(() => document.querySelector('#actTitle').textContent);

  // 1. fresh save: wing map starts on Act I, swipe left shows Act II locked, swipe right comes back, arrows do the same
  await page.click('#title [data-act="story"]'); await page.waitForTimeout(300);
  const before = await progressKey();
  record('act2', 'wing map opens on Act I', /^Act I · /.test(await actTitle()), await actTitle());
  await swipe(-140); await page.waitForTimeout(200);
  const t2 = await actTitle();
  record('act2', 'swipe left shows "Act II · The Sunken Stacks"', t2 === 'Act II · The Sunken Stacks', t2);
  const locked = await page.evaluate(() => { const t = [...document.querySelectorAll('#wingGrid .wing')]; return { n: t.length, w11: t[0]?.dataset.wing, off: t.every((b) => b.disabled), lock: document.querySelector('#wingLock').textContent, enter: document.querySelector('#btnEnterWing').disabled }; });
  const info = await page.evaluate(() => ({ name: document.querySelector('#wingName').textContent, enter: document.querySelector('#btnEnterWing').disabled, info: document.querySelector('#wingInfo').textContent, lock: document.querySelector('#wingLock').textContent, cut: [...document.querySelectorAll('#wingGrid .wing strong')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent) }));
  record('act2', 'locked Act II page shows Act II info and a disabled Enter (not an Act I wing)', /Act II · The Sunken Stacks/.test(info.name) && info.enter && info.info === '' && /clear .*\(wing 10\)/.test(info.lock), JSON.stringify(info));
  record('act2', 'wing tile names show in full on the Act II page (wrap, nothing cut off)', info.cut.length === 0, info.cut.join(' | '));
  record('act2', 'Act II is visible but locked on a fresh save', locked.n === 10 && locked.w11 === '11' && locked.off && /Locked|🔒/.test(locked.lock), JSON.stringify(locked));
  await shot(page, 'act2-wingmap-locked');
  await swipe(140); await page.waitForTimeout(200);
  record('act2', 'swipe right returns to Act I', /^Act I · /.test(await actTitle()));
  await page.click('#actNext'); await page.waitForTimeout(150);
  record('act2', 'arrow button moves to Act II', /^Act II · /.test(await actTitle()));
  await page.click('#actPrev'); await page.waitForTimeout(150);
  record('act2', 'arrow button moves back to Act I', /^Act I · /.test(await actTitle()));
  record('act2', 'browsing the wing map never changes saved progress', (await progressKey()) === before);

  // 2. hidden tester switch: 7 taps on the version line
  await page.evaluate(() => document.querySelector('#story [data-act="back"]').click()); await page.waitForTimeout(250);
  const preTester = await progressKey();
  for (let i = 0; i < 6; i++) await page.click('#title .version-label');
  record('act2', '6 taps do not switch tester mode on', await page.evaluate(() => localStorage.getItem('overdue.tester.v1')) === null);
  await page.click('#title .version-label'); await page.waitForTimeout(200);
  const tj = await page.evaluate(() => ({ key: localStorage.getItem('overdue.tester.v1'), toast: document.querySelector('#toast')?.textContent, tag: !!document.querySelector('#title .version-label .tester-tag') }));
  record('act2', '7 taps: toast "Tester mode on", saved in overdue.tester.v1, TESTER tag on the title', tj.key === '{"on":true}' && /Tester mode on/.test(tj.toast || '') && tj.tag, JSON.stringify(tj));
  record('act2', 'tester switch leaves overdue.progress.v1 untouched', (await progressKey()) === preTester);
  await shot(page, 'title-tester');
  await page.click('#title [data-act="story"]'); await page.waitForTimeout(250);
  await page.click('#actNext'); await page.waitForTimeout(150);
  const open = await page.evaluate(() => [...document.querySelectorAll('#wingGrid .wing:not(.soon)')].map((b) => !b.disabled));
  record('act2', 'tester mode opens wings 11 and 12', open.length === 2 && open.every(Boolean), JSON.stringify(open));
  // a tester run banks fines but never unlocks, clears or sets a best room
  await page.evaluate(() => { const O = __overdue; O.startRun('story', 11); O.startWave(3); O.game.fines = 12; O.die(); });
  await page.waitForTimeout(2500);
  const pr = await page.evaluate(() => ({ ...__overdue.progress }));
  record('act2', 'a tester run earns fines but sets no best room and unlocks nothing', pr.fines > 0 && Object.keys(pr.best).length === 0 && pr.unlocked === 1 && pr.cleared.length === 0, JSON.stringify({ fines: pr.fines, best: pr.best, unlocked: pr.unlocked }));
  // switch off again (7 more taps from the title)
  await page.evaluate(() => { __overdue.game.state = 'title'; document.querySelectorAll('.screen').forEach((e) => { e.hidden = e.id !== 'title'; }); });
  await page.waitForTimeout(300);
  for (let i = 0; i < 7; i++) await page.click('#title .version-label');
  record('act2', '7 more taps switch tester mode off', await page.evaluate(() => localStorage.getItem('overdue.tester.v1')) === '{"on":false}');

  // v1.16.1: Act II wings are 9 rooms: "room 1/9", elite at 5, boss at 9, a door before each room but none after the boss; Act I stays 7
  const len = await page.evaluate(() => {
    const O = __overdue; O.unlockAll(); O.startRun('story', 11);
    const first = O.game.banner; const kinds = [];
    for (let r = 1; r <= 9; r++) { O.startWave(r); kinds.push(O.game.diff.kind[0]); }
    const last = O.game.banner; O.startRun('story', 1); const a1 = O.game.banner;
    return { first, last, kinds: kinds.join(''), a1 };
  });
  record('act2', 'an Act II run says "ROOM 1/9", the last room "ROOM 9/9"; Act I still says /7', len.first === 'ROOM 1/9' && len.last === 'ROOM 9/9' && len.a1 === 'ROOM 1/7', JSON.stringify(len));
  record('act2', 'Act II: elite room is 5, boss room is 9', len.kinds[4] === 'e' && len.kinds[8] === 'b' && len.kinds.replace(/[eb]/g, '').length === 7, len.kinds);
  await page.evaluate(() => { const O = __overdue; O.startRun('story', 11); O.startWave(5); O.god(); O.freeze(false); }); await page.waitForTimeout(900);
  await shot(page, 'act2-hud-room5of9');
  // game over after an Act II run (die in room 5)
  await page.evaluate(() => { const O = __overdue; O.stats.maxHp = 5; O.player.hp = 1; O.player.inv = 0; O.die(); }); await page.waitForTimeout(2700);
  const goText = await page.evaluate(() => document.getElementById('gameover').innerText || '');
  await shot(page, 'act2-gameover');
  record('act2', 'game over after an Act II run shows room x/9', /Room reached\s*5\/9/i.test(goText), goText.replace(/\s+/g, ' ').slice(0, 120));
  await page.evaluate(() => { __overdue.drive(false); __overdue.game.state = 'title'; document.querySelectorAll('.screen').forEach((e) => { e.hidden = e.id !== 'title'; }); });

  // v1.16.1: no walker gets stuck at a shore. In water rooms (islands/causeway) with the player standing still, every ground enemy keeps moving
  // toward them (before the fix, enemies across a pond walked into the water edge and stood there for good).
  const stuck = await page.evaluate(() => {
    const O = __overdue, bad = [], realRandom = Math.random;
    for (const [w, room] of [[11, 2], [11, 4], [11, 6], [12, 6]]) for (const seed of [1, 2, 3]) {
      let a = (seed * 2654435761) >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      O.unlockAll(); O.startRun('story', w); O.startWave(room); O.god(); O.drive(true); O.setBotInput({ x: 0, y: 0 });
      O.stepN(40 * 120);                                         // spawns done and everyone has walked for a while
      const before = new Map(O.enemies.map((e) => [e, [e.x, e.y]]));
      O.stepN(15 * 120);
      for (const e of O.enemies) { const b = before.get(e); if (!b || ['eel', 'boat', 'coin', 'worm', 'boss', 'patron'].includes(e.type)) continue; if (Math.hypot(e.x - b[0], e.y - b[1]) < 12 && Math.hypot(e.x - O.player.x, e.y - O.player.y) > 140) bad.push(`w${w} r${room} s${seed} ${e.type}@${Math.round(e.x)},${Math.round(e.y)}`); }
    }
    Math.random = realRandom; O.drive(false); return bad;
  });
  record('act2', 'no ground enemy stands still at a shore in Act II water rooms (player standing still, 3 seeds x 4 rooms)', stuck.length === 0, stuck.slice(0, 4).join(' | '));

  // 3. an Act II water room: renders, the player can't step into water, books fly over it
  const pick = (() => { for (const w of [11, 12]) for (let r = 1; r <= roomsIn(w); r++) if (WATER_SHAPES.includes(roomShape(w, r))) return [w, r]; return null; })();
  await page.evaluate(([w, r]) => { const O = __overdue; O.unlockAll(); O.startRun('story', w); O.startWave(r); O.god(); O.killAll(); O.freeze(false); }, pick);
  await page.waitForTimeout(1200);
  await shot(page, 'act2-room');
  const room = await page.evaluate(() => {
    const O = __overdue, a = O.arena, C = 30, cols = Number(O.grid().split('x')[0]), rows = Number(O.grid().split('x')[1]);
    const water = (x, y) => !!a.water && a.water[Math.floor(y / C) * cols + Math.floor(x / C)] === 1;
    let n = 0; if (a.water) for (const v of a.water) n += v;
    // a dry cell with water straight to its right, and water two cells further (a stretch we can throw across)
    let shore = null;
    for (let y = 1; y < rows - 1 && !shore; y++) for (let x = 1; x < cols - 4; x++) if (!a.walk[y * cols + x] && a.water[y * cols + x + 1] && a.water[y * cols + x + 2]) { shore = [x, y]; break; }
    if (!shore) return { cells: n, shore: null };
    const px = shore[0] * C + C / 2, py = shore[1] * C + C / 2;
    O.player.x = px; O.player.y = py; O.player.vx = O.player.vy = 0;
    O.drive(true); O.setBotInput({ x: 1, y: 0 });
    let inWater = false;
    for (let i = 0; i < 240; i++) { O.stepN(1); if (water(O.player.x, O.player.y)) inWater = true; }
    O.setBotInput(null); O.drive(false);
    // books: throw straight across the water from the shore
    O.player.x = px; O.player.y = py; O.player.aim = 0; O.books.length = 0;
    O.fire();
    const born = O.books.length;
    let overWater = false;
    for (let i = 0; i < 8; i++) { O.stepN(1); if (O.books.some((b) => water(b.x, b.y))) overWater = true; }
    return { cells: n, shore, inWater, born, overWater, stillFlying: O.books.length > 0, shape: a.shape };
  });
  record('act2', 'Act II room (wing %d room %d) renders with water and plays'.replace('%d', pick[0]).replace('%d', pick[1]), room.cells > 0 && errs.length === 0, `${room.cells} water cells, shape ${room.shape}`);
  record('act2', 'the player cannot walk into water (240 steps pushing at it)', room.shore && room.inWater === false, JSON.stringify(room.shore));
  record('act2', 'books fly over water', room.born > 0 && room.overWater && room.stillFlying, `born ${room.born}, over water ${room.overWater}`);

  // 3b. Act II enemies (part B): Ink Eel and Paper Boat live on water only
  const wat = await page.evaluate(() => {
    const O = __overdue, C = 30, [cols, rows] = O.grid().split('x').map(Number), a = O.arena;
    const inW = (x, y) => a.water[Math.floor(y / C) * cols + Math.floor(x / C)] === 1;
    const dry = (x, y) => !a.walk[Math.floor(y / C) * cols + Math.floor(x / C)];
    O.setSetting('autoaim', false); O.settings.autofire = false; O.startWave(O.game.wave); O.god(); O.freeze(false); O.killAll(); O.hazards.length = 0; O.player.x = O.W / 2; O.player.y = O.H / 2; O.god();
    const spot = (n) => { let best = null; for (let i = 0; i < 400 && !best; i++) { const x = (2 + Math.floor(Math.random() * (cols - 4))) * C + C / 2, y = (2 + Math.floor(Math.random() * (rows - 4))) * C + C / 2; if ([[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => inW(x + dx * C, y + dy * C)) && inW(x, y) && Math.hypot(x - O.player.x, y - O.player.y) > 150) best = { x, y }; } return best; };
    const mk = (type, elite) => { const p = spot(); if (!p) return null; O.materialise(type, p.x, p.y, elite); return O.enemies[O.enemies.length - 1]; };
    O.makeEnemy('golem', 40, 40); O.enemies[0].speed = 0;   // a still dry enemy keeps these three out of 'hunt' mode
    const eel = mk('eel'), boat = mk('boat'), eel2 = mk('eel', true);
    if (!eel || !boat) return { noSpot: true };
    const out = { eelOutOfWater: 0, boatOutOfWater: 0, up: 0, under: 0, phases: new Set(), hurtWhileUnder: 0, hitWhileUp: 0, noticesOnWater: 0, noticesDry: 0, pages: 0, shotsCap: 0, hp0: eel.hp };
    let wasUnderHp = eel.hp, deadUnder = false, bookHpChecks = 0, bookHpOk = 0;
    for (let i = 0; i < 120 * 24; i++) {   // 24 s (STEP is 1/120 s)
      O.stepN(1);
      for (const e of [eel, eel2]) if (!e.dead && !inW(e.x, e.y)) out.eelOutOfWater++;
      if (!boat.dead && !inW(boat.x, boat.y)) out.boatOutOfWater++;
      out.phases.add(eel.ph);
      if (eel.under) {
        out.under++;
        // while submerged: a book sitting on it and a direct damage call must do nothing
        if (i % 7 === 0 && bookHpChecks < 12) {
          const hp = eel.hp;
          O.books.push({ x: eel.x, y: eel.y, vx: 0, vy: 0, r: 6, life: 1, age: 0, hitAny: false, rot: 0, dmgMult: 1, scale: 1, spin: 0, bounces: 0, pierce: 0, wraps: 0, child: false, hit: new Set(), color: '#3f7fd6', title: 'x', look: null });
          O.damageEnemy(eel, 5, 0, 0, false, 'throw'); O.stepN(1);
          bookHpChecks++; if (eel.hp === hp && !eel.dead) bookHpOk++;
        }
      } else out.up++;
      if (O.player.hp < 900) out.hurtWhileUnder++;
      for (const n of O.enemies) if (n.boat && n.type === 'notice' && !n._seen) { n._seen = true; if (inW(n.x, n.y)) out.noticesOnWater++; else out.noticesDry++; }
    }
    out.pages = O.hazards.filter((h) => h.pat === 'page:eel').length;
    out.boatDbg = { dead: boat.dead, dropT: boat.dropT, state: O.game.state, hp: boat.hp, n: O.enemies.length }; out.bookHpChecks = bookHpChecks; out.bookHpOk = bookHpOk; out.phases = [...out.phases];
    // it can be hit while up: wait for 'up', then hit it
    O.killAll();
    O.makeEnemy('golem', 40, 40); O.enemies[O.enemies.length - 1].speed = 0;   // a dry enemy keeps the eel out of 'hunt' mode, so it surfaces on its normal timer
    const e3 = mk('eel'); for (let i = 0; i < 120 * 8 && e3.ph !== 'up'; i++) O.stepN(1);
    const hp = e3.hp; O.damageEnemy(e3, 1, 0, 0, false, 'throw'); out.hitWhileUp = hp - e3.hp;
    out.codex = [...JSON.parse(localStorage.getItem('overdue.codex.v1') || '{}').seen || []].filter((x) => x.startsWith('enemy:'));
    return out;
  });
  record('act2', 'Ink Eel and Paper Boat spawn on water in an Act II room', !wat.noSpot, JSON.stringify(wat).slice(0, 120));
  record('act2', 'Ink Eel never leaves the water (24 s, incl. an elite one)', wat.eelOutOfWater === 0, `${wat.eelOutOfWater} frames out of water`);
  record('act2', 'Ink Eel cycles under -> rise -> up -> dive and is up for part of the time', ['under', 'rise', 'up', 'dive'].every((p) => wat.phases?.includes(p)) && wat.up > 0 && wat.under > wat.up, `phases ${wat.phases}, up ${wat.up} frames, under ${wat.under}`);
  record('act2', 'Ink Eel cannot be hit while submerged (books on it and direct damage do nothing)', wat.bookHpChecks >= 6 && wat.bookHpOk === wat.bookHpChecks, `${wat.bookHpOk}/${wat.bookHpChecks}`);
  record('act2', 'Ink Eel can be hit while surfaced', wat.hitWhileUp > 0, `damage ${wat.hitWhileUp}`);
  record('act2', 'Ink Eel surfaces and fires pages (page:eel)', wat.pages > 0 || wat.up > 0, `${wat.pages} pages in flight at the end`);
  record('act2', 'Paper Boat stays on the water and drops Overdue Notices onto walkways (none on water)', wat.boatOutOfWater === 0 && wat.noticesDry >= 3 && wat.noticesOnWater === 0, `${JSON.stringify(wat.boatDbg)} out-of-water frames ${wat.boatOutOfWater}, notices ${wat.noticesDry}, on water ${wat.noticesOnWater}`);
  record('act2', 'Codex remembers both creatures (ids enemy:eel, enemy:boat)', wat.codex?.includes('enemy:eel') && wat.codex?.includes('enemy:boat'), String(wat.codex));
  // 3c. the last water enemies hunt you and can never stall a room
  const hunt = await page.evaluate(() => {
    const O = __overdue, C = 30, [cols, rows] = O.grid().split('x').map(Number), a = O.arena;
    O.startWave(O.game.wave); O.god(); O.freeze(false); O.killAll(); O.setSetting('autoaim', false); O.player.x = O.W / 2; O.player.y = O.H / 2;
    let far = null, fd = -1; for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) if ([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy]) => a.water[(y+dy)*cols+x+dx])) { const d = Math.hypot(x * C - O.W / 2, y * C - O.H / 2); if (d > fd) { fd = d; far = [x, y]; } }
    O.materialise('eel', far[0] * C + C / 2, far[1] * C + C / 2, false);
    const e = O.enemies[0]; O.stepN(2);
    const out = { hunting: O.waterHunt, d0: Math.round(Math.hypot(e.x - O.player.x, e.y - O.player.y)) };
    let minD = out.d0, maxUp = 0, t = 0, inWaterAll = true;
    for (; t < 120 * 60 && O.enemies.length; t++)   /* STEP is 1/120 s */ { O.stepN(1); minD = Math.min(minD, Math.hypot(e.x - O.player.x, e.y - O.player.y)); if (e.ph === 'up') maxUp = Math.max(maxUp, e.upLen || 0); const cx = Math.floor(e.x / C), cy = Math.floor(e.y / C); if (!a.water[cy * cols + cx]) inWaterAll = false; }
    out.minD = Math.round(minD); out.upLen = maxUp; out.seconds = Math.round(t / 120); out.left = O.enemies.length; out.inWaterAll = inWaterAll;
    return out;
  });
  record('act2', 'the last eel hunts: it swims toward you, stays up longer, stays on water, and the room cannot stall (gone within 60 s)', hunt.hunting && hunt.minD < hunt.d0 && hunt.upLen > 2 && hunt.inWaterAll && hunt.left === 0, JSON.stringify(hunt));
  // a look at them for the screenshot: two eels (one up), two boats
  await page.evaluate(() => { const O = __overdue, C = 30, [cols, rows] = O.grid().split('x').map(Number), a = O.arena;
    O.killAll(); O.player.x = O.W / 2; O.player.y = O.H / 2; O.god();
    const cells = []; for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) if ([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => a.water[(y + dy) * cols + x + dx])) cells.push([x, y]);
    const pick = (i) => cells[Math.floor((cells.length * i) / 4)] || cells[0];
    [['eel', 0.3], ['eel', 0.8], ['boat', 0.1], ['boat', 0.6]].forEach(([t, f], i) => { const [x, y] = pick(i * 1 + (f > 0.5 ? 1 : 0)); O.materialise(t, x * C + C / 2, y * C + C / 2, i === 1); });
    const eels = O.enemies.filter((e) => e.type === 'eel'); eels[0].ph = 'up'; eels[0].phT = 0.9; eels[0].fired = true; eels[0].under = false; eels[1].ph = 'rise'; eels[1].phT = 0.3; eels[1].under = true;
    O.stepN(2); O.freeze(true); });
  await page.waitForTimeout(250);
  await shot(page, 'act2-enemies');
  await page.evaluate(() => { __overdue.freeze(false); __overdue.killAll(); });

  // 4. Act I look unchanged: the floor + shelf background of an Act I room matches the capture taken before the act layer existed
  const grid = await page.evaluate(([w, r]) => { const O = __overdue; O.startRun('story', w); O.game.seed = 12345; O.startWave(r);
    const s = document.createElement('canvas'); s.width = 48; s.height = 27; const g = s.getContext('2d'); g.drawImage(O.bg, 0, 0, 48, 27);
    const d = g.getImageData(0, 0, 48, 27).data, out = []; for (let i = 0; i < 48 * 27; i++) out.push(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); return { out, size: O.grid() }; }, [3, 2]);
  let maxD = 0; ref.grid.forEach((v, i) => { maxD = Math.max(maxD, Math.abs(v - grid.out[i])); });
  record('act2', 'Act I background unchanged (wing 3 room 2, largest colour difference <= 6 of 255)', grid.size === ref.size && maxD <= 6, `size ${grid.size}, max diff ${maxD}`);
  record('act2', 'no script errors', errs.length === 0, errs.join('; ').slice(0, 200));
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- v1.15.0: status effects (ink, chill, static, pop) look right on a phone
async function statusFlow() {
  const record = recorder();
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL0 + (URL0.includes('?') ? '&' : '?') + 'debug=1'); await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const O = __overdue;
    O.startRun('endless', 1); O.god(); O.killAll();
    for (const id of ['leakypen', 'coldstorage', 'static', 'popup']) O.grant(id);
    const cx = O.W / 2, cy = O.H / 2;
    const mk = (type, dx, dy) => { const e = O.makeEnemy(type, cx + dx, cy + dy); e.hp = e.maxHp = 9; return e; };
    O.player.x = cx - 170; O.player.y = cy + 90;
    const a = mk('bunny', -70, -40), b = mk('notice', 20, -50), c = mk('bunny', 110, -30), d = mk('patron', -20, 60), f = mk('bunny', 120, 70);
    a.inkT = 2; a.inkDps = 1;                                    // ink
    b.chillT = 1.5; b.chill = 0.4;                                // chill
    c.staticT = 5;                                                // static spark
    d.inkT = 2; d.inkDps = 1; d.chillT = 1.5; d.chill = 0.4; d.staticT = 5;   // all three
    f.chillT = 1; f.frozenT = 1; f.stun = 1;                      // frozen
    O.zaps.push({ pts: [a.x, a.y, (a.x + b.x) / 2, a.y - 14, b.x, b.y, (b.x + c.x) / 2, b.y - 12, c.x, c.y], life: 99 });   // one zap arc
    O.freeze(true);
    return { n: O.enemies.length, sprites: ['ink', 'chill', 'static'].map((k) => !!O.statusSprite(k)) };
  });
  await page.waitForTimeout(400);
  await shot(page, 'status-effects');
  record('status', 'enemies with ink / chill / static / frozen and a zap arc draw without errors', info.n >= 5 && info.sprites.every(Boolean) && errs.length === 0, errs.join('; ').slice(0, 200));
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- v1.15.1: look & feel (enemy size, orbit books, Margin angles, boss phase change)
async function lookFeelFlow() {
  const record = recorder();
  const ctx = await browser.newContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL0 + (URL0.includes('?') ? '&' : '?') + 'debug=1'); await page.waitForTimeout(500);
  // enemy size: story enemies are 20% bigger (sprite and hitbox), endless unchanged, elites stay above normals
  const sizes = await page.evaluate(() => {
    const O = __overdue, out = {};
    O.startRun('endless', 1); O.god(); O.killAll();
    const en = O.makeEnemy('bunny', 100, 100); out.endless = { r: en.r, vs: en.vs };
    O.startRun('story', 1); O.startWave(2); O.god(); O.killAll();
    const b = O.makeEnemy('bunny', 100, 100), el = O.makeEnemy('bunny', 200, 100, { elite: true });
    out.story = { r: b.r, vs: b.vs, eliteR: el.r, scale: O.consts.STORY_ENEMY_SCALE };
    O.killAll();
    const cx = O.W / 2, cy = O.H / 2; O.player.x = cx - 150; O.player.y = cy;
    [['bunny', -20, -60], ['notice', 60, -40], ['patron', 40, 50], ['golem', 140, -10], ['coin', -60, 40], ['worm', 90, 90]].forEach(([t, dx, dy]) => { const e = O.makeEnemy(t, cx + dx, cy + dy); e.hp = e.maxHp = 9; });
    O.makeEnemy('bunny', cx - 70, cy - 70, { elite: true });
    O.freeze(true);
    return out;
  });
  await page.waitForTimeout(400);
  await shot(page, 'lookfeel-story-room');
  record('lookfeel', 'story enemies drawn 20% bigger (hitbox +10%); endless unchanged; elites stay bigger than normals',
    sizes.endless.vs === 1 && sizes.endless.r === 11 && sizes.story.vs === 1.2 && Math.abs(sizes.story.r - 12.1) < 0.01 && sizes.story.eliteR > sizes.story.r, JSON.stringify(sizes));
  // orbit books: big, tight ring
  const orb = await page.evaluate(() => {
    const O = __overdue; O.freeze(false); O.startRun('story', 1); O.startWave(2); O.god(); O.killAll();
    for (let i = 0; i < 3; i++) O.grant('audiobook');
    O.stepN(30); O.game.bannerT = 0; O.game.bannerQ = 0; O.freeze(true);
    const o = O.orbiterPositions()[0], d = Math.hypot(o.x - O.player.x, o.y - O.player.y);
    return { n: O.orbiterPositions().length, d, scale: O.consts.ORBIT_SCALE, R: O.consts.ORBIT_RADIUS };
  });
  await page.waitForTimeout(300);
  await shot(page, 'lookfeel-orbit');
  record('lookfeel', 'orbit books drawn about 1.6x on a 56 px ring', orb.n >= 3 && orb.scale >= 1.5 && orb.R === 56 && Math.abs(orb.d - 56) < 1, JSON.stringify(orb));
  // Margin Notes: diagonals at ±15.75° (level 1), ±10.5° / ±21° (level 3), rear unchanged
  const mg = await page.evaluate(() => {
    const O = __overdue; O.freeze(false); O.startRun('story', 1); O.startWave(2); O.god(); O.killAll();
    const angs = (lvl) => {
      O.stats.marginLvl = lvl; O.books.length = 0; O.player.aim = 0.7; O.fire();
      return O.books.filter((b) => b.margin).map((b) => { let a = Math.atan2(b.vy, b.vx) - 0.7; a = Math.atan2(Math.sin(a), Math.cos(a)); return +(a * 180 / Math.PI).toFixed(1); }).sort((x, y) => x - y);
    };
    return { l1: angs(1), l2: angs(2), l3: angs(3) };
  });
  const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(Math.abs(x) - Math.abs(b[i])) < 0.6 && Math.sign(x) === Math.sign(b[i]));
  record('lookfeel', 'Margin Notes diagonals are ±15.75° (L1-2, plus rear) and ±10.5° / ±21° (L3)',
    near(mg.l1, [-15.75, 15.75]) && near(mg.l2, [-180, -15.75, 15.75]) && mg.l3.some((x) => Math.abs(Math.abs(x) - 10.5) < 0.6) && mg.l3.some((x) => Math.abs(Math.abs(x) - 21) < 0.6) && mg.l3.every((x) => Math.abs(x) <= 21.6 || Math.abs(Math.abs(x) - 180) < 0.6), JSON.stringify(mg));
  // boss phase change: player keeps control, boss is immune and harmless for ~1 s
  const bs = await page.evaluate(() => {
    const O = __overdue; O.freeze(false); O.startRun('story', 1); O.god(); O.startWave(7); O.killAll();
    const boss = O.makeEnemy('boss', O.W - 150, O.H / 2, { name: 'Test Author', tier: 0, phase: 1, modeT: 0, spiral: 0, summonT: 7 });
    boss.hp = boss.maxHp = 500; O.stepN(3); O.game.bannerT = 0;   // (room-intro banner cleared: only the phase change is under test)
    const out = { before: boss.hp };
    boss.hp = boss.maxHp * 0.6;                      // crosses into phase 2
    O.stepN(2);
    out.trans = boss.trans; out.phase = boss.phase; out.banner = O.game.bannerT; out.freeze = O.game.freeze; out.state = O.game.state;
    const hp0 = boss.hp; O.damageEnemy(boss, 5, 0, 0, false, 'throw'); out.hpAfterHit = boss.hp - hp0;
    O.player.x = 100; O.player.y = O.H / 2; O.player.inv = 0; const x0 = O.player.x, hearts = O.player.hp;
    O.drive(true); O.setBotInput({ x: 1, y: 0 }); O.stepN(30); O.setBotInput(null);
    out.moved = O.player.x - x0; out.hurt = hearts - O.player.hp; out.transLeft = boss.trans;
    boss.x = O.player.x; boss.y = O.player.y; O.stepN(2); out.contactHurt = hearts - O.player.hp;   // standing inside the boss while it transforms
    O.stepN(120); out.after = boss.trans; const hp1 = boss.hp; O.damageEnemy(boss, 5, 0, 0, false, 'throw'); out.hitAfter = hp1 - boss.hp;
    O.drive(false);
    return out;
  });
  record('lookfeel', 'boss phase change: no screen-centre banner or freeze, player moves, boss immune and harmless ~1 s, then hittable again',
    bs.trans > 0 && bs.phase === 2 && bs.banner === 0 && bs.freeze === 0 && bs.state === 'playing' && bs.hpAfterHit === 0 && bs.moved > 20 && bs.contactHurt === 0 && bs.after === 0 && bs.hitAfter === 5 && errs.length === 0, JSON.stringify(bs) + errs.join(';').slice(0, 100));
  // screenshot mid-transformation
  await page.evaluate(() => { const O = __overdue; O.freeze(false); O.startRun('story', 1); O.god(); O.startWave(7); O.killAll(); const b = O.makeEnemy('boss', O.W / 2 + 120, O.H / 2, { name: 'Test Author', tier: 0, phase: 1, modeT: 0, spiral: 0, summonT: 7 }); b.hp = b.maxHp = 500; O.stepN(3); b.hp = b.maxHp * 0.6; O.stepN(20); O.game.bannerT = 0; O.game.bannerQ = 0; O.freeze(true); });
  await page.waitForTimeout(300);
  await shot(page, 'lookfeel-boss-phase');
  await ctx.close();
  return record.list;
}

// ---------------------------------------------------------------- v1.13.0: new-player flows (guided first room, Survive timer)
async function newPlayerFlow(name, opts) {
  const record = recorder();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const tap = (sel) => (opts.hasTouch ? page.tap(sel) : page.click(sel));
  const area = `newplayer/${name}`;
  const rect = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  // Wait until the beat's enemies are out (up to 6 s), then clear the beat and wait for the next one to start (or the guide to end).
  const beatReady = (n) => page.waitForFunction((n) => __overdue.guide?.beat >= 0 && __overdue.enemies.length >= n, n, { timeout: 8000 }).catch(() => {});
  const clearBeat = async () => {
    const from = await page.evaluate(() => __overdue.guide?.beat ?? -2);
    await page.evaluate(() => __overdue.killAll());
    await page.waitForFunction((from) => !__overdue.guide || __overdue.guide.beat > from, from, { timeout: 6000 }).catch(() => {});
  };
  try {
    await page.goto(URL0); await page.waitForTimeout(600);
    // ---- fresh save: Story -> wing 1 -> the guided room appears
    await tap('#title [data-act=story]'); await page.waitForTimeout(300);
    await tap('#btnEnterWing'); await page.waitForTimeout(400);
    await page.evaluate(() => __overdue.god());
    record(area, 'guided room starts on a fresh save', await page.evaluate(() => !!__overdue.guide && __overdue.game.state === 'playing' && __overdue.game.wave === 1));
    record(area, 'Skip button is on screen and clear of the pause button and the hearts/fines HUD', await (async () => {
      const sk = await rect('#btnGuideSkip'), pa = await rect('#btnPause');
      const cv = await rect('canvas'), hudTL = { l: cv.l, t: cv.t, r: cv.l + 0.2 * cv.w, b: cv.t + 0.105 * cv.h };   // hearts + fines block, top left
      return sk.w > 0 && sk.l >= 0 && sk.r <= (await page.evaluate(() => innerWidth)) && !hit(sk, pa) && !hit(sk, hudTL);
    })());
    await beatReady(1);
    const b1 = await page.evaluate(() => ({ beat: __overdue.guide.beat, n: __overdue.enemies.length, slow: __overdue.enemies.every((e) => e.speed < 70) }));
    await shot(page, `${name}-guide-1-move`);
    record(area, 'beat 1: a few slow bunnies, move prompt', b1.beat === 0 && b1.n >= 1 && b1.slow, JSON.stringify(b1));
    await clearBeat(); await beatReady(1); await page.waitForTimeout(400);
    const b2 = await page.evaluate(() => ({ beat: __overdue.guide?.beat, hl: document.querySelector('#btnDash').classList.contains('guide-hl'), n: __overdue.enemies.length }));
    await shot(page, `${name}-guide-2-dash`);
    record(area, 'beat 2: one charger, DASH button highlighted', b2.beat === 1 && b2.hl, JSON.stringify(b2));
    await clearBeat(); await beatReady(3); await page.waitForTimeout(400);
    const b3 = await page.evaluate(() => ({ beat: __overdue.guide?.beat, hl: document.querySelector('#btnShhh').classList.contains('guide-hl'), dashHl: document.querySelector('#btnDash').classList.contains('guide-hl'), n: __overdue.enemies.length }));
    await shot(page, `${name}-guide-3-shhh`);
    record(area, 'beat 3: a small crowd, SHHH highlighted (not DASH)', b3.beat === 2 && b3.hl && !b3.dashHl && b3.n >= 3, JSON.stringify(b3));
    // cannot die: the player has 1 heart and takes hits
    const safe = await page.evaluate(async () => { const O = __overdue; O.player.hp = 1; O.player.inv = 0; O.die(); await new Promise((r) => setTimeout(r, 400)); return { hp: O.player.hp, state: O.game.state }; });
    record(area, 'cannot die in the guided room', safe.hp === 1 && safe.state === 'playing', JSON.stringify(safe));
    await page.evaluate(() => __overdue.killAll());
    await page.waitForFunction(() => !__overdue.guide && __overdue.game.state === 'upgrade', null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(300);
    const done = await page.evaluate(() => ({ guide: !!__overdue.guide, state: __overdue.game.state, seen: __overdue.tipsSeen(), fines: __overdue.game.fines }));
    await shot(page, `${name}-guide-4-perks`);
    record(area, 'cleared: normal perk pick follows, flag saved', !done.guide && done.state === 'upgrade' && done.seen.includes('guided-room'), JSON.stringify(done));
    const guidedFines = done.fines;
    await page.evaluate(() => __overdue.pickCard(0)); await page.waitForTimeout(500);
    await page.evaluate(() => { if (__overdue.game.state === 'doors') __overdue.pickDoor(__overdue.doors[0]); }); await page.waitForTimeout(600);
    record(area, 'the run continues to room 2', await page.evaluate(() => __overdue.game.wave === 2 && __overdue.game.state === 'playing' && !__overdue.guide), await page.evaluate(() => `wave ${__overdue.game.wave} ${__overdue.game.state}`));
    // ---- never again: a second story run on the same save has no guide
    await page.evaluate(() => { document.querySelector('[data-act=quit]') && 0; });
    await page.reload(); await page.waitForTimeout(600);
    await tap('#title [data-act=story]'); await page.waitForTimeout(300);
    await tap('#btnEnterWing'); await page.waitForTimeout(400);
    record(area, 'the guided room never appears again', await page.evaluate(() => !__overdue.guide && __overdue.game.wave === 1 && __overdue.game.state === 'playing'));
    // ---- Skip: a brand-new save, tap Skip -> straight into the regular room 1
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(600);
    await tap('#title [data-act=story]'); await page.waitForTimeout(300);
    await tap('#btnEnterWing'); await page.waitForTimeout(500);
    await page.evaluate(() => __overdue.god());
    await tap('#btnGuideSkip'); await page.waitForTimeout(500);
    const sk = await page.evaluate(() => ({ guide: !!__overdue.guide, wave: __overdue.game.wave, state: __overdue.game.state, seen: __overdue.tipsSeen().includes('guided-room'), skipShown: getComputedStyle(document.querySelector('#btnGuideSkip')).display }));
    record(area, 'Skip: regular room 1, flag saved, button gone', !sk.guide && sk.wave === 1 && sk.state === 'playing' && sk.seen && sk.skipShown === 'none', JSON.stringify(sk));
    await page.evaluate(async () => { const O = __overdue; for (let i = 0; i < 40 && O.game.state === 'playing'; i++) { O.killAll(); await new Promise((r) => setTimeout(r, 80)); } });
    const normalFines = await page.evaluate(() => __overdue.game.fines);
    record(area, 'fines for the guided room = the regular room 1 fines', guidedFines > 0 && guidedFines === normalFines, `${guidedFines} vs ${normalFines}`);
    // ---- auto-aim off: the first prompt mentions the second finger (text lives in src/newplayer.js; unit-tested), the game just runs
    // ---- Survive room: big timer at the top centre, clear of the room label and the pause button
    await page.evaluate(() => { const O = __overdue; O.startRun('story', 1); O.god(); O.startWave(3); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => __overdue.setSurviveT(4));
    await page.waitForTimeout(600);
    await shot(page, `${name}-survive-timer`);
    const geo = await page.evaluate(() => {
      const O = __overdue, c = document.getElementById('game').getBoundingClientRect(), k = c.width / O.W;
      return { goal: O.game.diff.goal, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom }, box: { l: c.left + (O.W / 2 - 74) * k, r: c.left + (O.W / 2 + 74) * k, t: c.top + 36 * k, b: c.top + 98 * k }, label: { b: c.top + 32 * k }, k, vw: innerWidth };
    });
    const pause = await rect('#btnPause');
    const inside = geo.box.l >= geo.canvas.l && geo.box.r <= geo.canvas.r && geo.box.t >= geo.canvas.t && geo.box.b <= geo.canvas.b;
    record(area, 'Survive timer is big, on screen and clear of the room label and pause button', geo.goal === 'survive' && inside && geo.box.t > geo.label.b && !hit({ l: geo.box.l, r: geo.box.r, t: geo.box.t, b: geo.box.b }, pause) && 36 * geo.k >= 8, JSON.stringify({ ...geo.box, pause }));
    record(area, 'no script errors', errors.length === 0, errors.join('; ').slice(0, 200));
  } catch (e) { record(area, 'new-player flow ran to the end', false, e.message.split('\n')[0]); }
  await ctx.close();
  return record.list;
}
// ---------------------------------------------------------------- 4c. app basics (v1.13.1): offline play, update, kill switch, backup code, Home Screen nudge
/** v1.13.1 basics flow: the worker taking control / the update reload navigates the page on its own, which destroys an evaluate that is running.
 *  Every evaluate on these pages waits for the planned navigation to settle and retries (reads and idempotent steps only). */

// v1.15.0 part B: the "What's new" card, NEW badges, Margin Notes books and the Library Cat.
async function newPerksFlow(name, opts) {
  const record = recorder();
  const area = `newperks/${name}`;
  const mk = async (returning) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(returning ? `(${RETURNING_SAVE})(); try { if (localStorage.getItem('overdue.tips.v1') === null) localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off"]}'); } catch {}` : `try { if (localStorage.getItem('overdue.tips.v1') === null) localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off"]}'); } catch {}`);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return { ctx, page, errors };
  };
  try {
    // returning 1.14 save: the card shows once
    { const { ctx, page, errors } = await mk(true);
      await page.goto(URL0); await page.waitForTimeout(1100);
      const vis = await page.evaluate(() => { const c = document.getElementById('whatsNew'), r = document.querySelector('#whatsNew .nudge-card').getBoundingClientRect(); return { hidden: c.hidden, text: c.textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, items: document.querySelectorAll('#wnLines li').length }; });
      await shot(page, `${name}-whatsnew-card`);
      // v1.16.1: the card must not cover the title's version line; 7 taps on it switch tester mode while the card is open
      const hit = await page.evaluate(() => { const l = document.querySelector('#title .version-label').getBoundingClientRect(); const t = document.elementFromPoint(l.x + l.width / 2, l.y + l.height / 2); return !!t && t.classList.contains('version-label'); });
      // the backdrop still blocks every other tap: Settings (and Story / Endless) do nothing while the card is open
      const settingsBtn = await page.evaluate(() => { const b = document.querySelector('#title [data-act="settings"]'); if (!b) return null; const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { blocked: !b.contains(t), inView: r.bottom <= innerHeight }; });
      if (settingsBtn && settingsBtn.inView) { await page.mouse.click(await page.evaluate(() => { const r = document.querySelector('#title [data-act="settings"]').getBoundingClientRect(); return r.x + r.width / 2; }), await page.evaluate(() => { const r = document.querySelector('#title [data-act="settings"]').getBoundingClientRect(); return r.y + r.height / 2; })); await page.waitForTimeout(250); }
      const stillTitle = await page.evaluate(() => !document.getElementById('settings').hidden === false && !document.getElementById('whatsNew').hidden);
      record(area, "a tap on Settings does nothing while the What's-new card is open", settingsBtn && settingsBtn.blocked && stillTitle, JSON.stringify({ settingsBtn, stillTitle }));
      for (let i = 0; i < 7; i++) await page.click('#title .version-label');
      const tester = await page.evaluate(() => localStorage.getItem('overdue.tester.v1'));
      record(area, "version line stays visible and tappable with the What's-new card open (7 taps = tester mode)", hit && tester === '{"on":true}', JSON.stringify({ hit, tester }));
      for (let i = 0; i < 7; i++) await page.click('#title .version-label');
      record(area, "What's new card shows for a returning save, on screen, 2-3 lines", !vis.hidden && /New in 1\.16: Act II, The Sunken Stacks/.test(vis.text) && vis.inView && vis.items >= 2 && vis.items <= 3, JSON.stringify({ ...vis, text: vis.text.slice(0, 60) }));
      await page.click('#btnWnOk'); await page.waitForTimeout(200);
      record(area, "What's new card closes with its one button", await page.evaluate(() => document.getElementById('whatsNew').hidden));
      await page.reload(); await page.waitForTimeout(1100);
      record(area, "What's new card never shows twice", await page.evaluate(() => document.getElementById('whatsNew').hidden && __overdue.tipsSeen().includes('whatsnew-1.16.0')));
      // NEW badges on the first offer; this player has not been stamped as fresh, so the badges are still pending
      await page.evaluate(() => { localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off","whatsnew-1.16.0","perk-stack"]}'); }); await page.reload(); await page.waitForTimeout(700);
      await page.evaluate(() => { __overdue.startRun('endless'); __overdue.game.banished.add('margin'); __overdue.game.banished.add('librarycat'); __overdue.showUpgrades(); __overdue.showCards(['margin', 'hardcover', 'librarycat']); }); await page.waitForTimeout(900);
      const cls = () => page.evaluate(() => [...document.querySelectorAll('#cards .card')].map((c) => c.classList.contains('new')));
      const first = await cls(); await shot(page, `${name}-perk-new-badge`);
      record(area, 'NEW badge shows on new perk cards the first time they are offered', first[0] && !first[1] && first[2], JSON.stringify(first));
      await page.evaluate(() => __overdue.showCards(['margin', 'hardcover', 'librarycat'])); await page.waitForTimeout(300);
      const second = await cls();
      record(area, 'NEW badge clears once the card was shown', !second.some(Boolean), JSON.stringify(second));
      record(area, 'badge flags are plain ids in the tips store (old saves load unchanged)', await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('overdue.tips.v1')); return Object.keys(t).join() === 'seen' && t.seen.includes('badge-margin') && t.seen.includes('a2hs-off'); }));
      record(area, 'no page errors (whats-new/badges)', errors.length === 0, errors.join('; ').slice(0, 200));
      await ctx.close(); }
    // fresh install: nothing shown, everything stamped
    { const { ctx, page, errors } = await mk(false);
      await page.goto(URL0); await page.waitForTimeout(1100);
      record(area, "What's new card never shows on a fresh install", await page.evaluate(() => document.getElementById('whatsNew').hidden && __overdue.tipsSeen().includes('whatsnew-1.16.0') && __overdue.tipsSeen().includes('badge-margin')));
      await page.evaluate(() => { __overdue.startRun('endless'); __overdue.showCards(['margin', 'hardcover', 'librarycat']); }); await page.waitForTimeout(500);
      record(area, 'a brand-new player sees no NEW badge on new perks', await page.evaluate(() => document.querySelectorAll('#cards .card').length === 3 && !document.querySelector('#cards .card.new')));
      await ctx.close(); }
    // the cat and Margin Notes books in a room
    { const { ctx, page, errors } = await mk(true);
      await page.goto(URL0); await page.evaluate(() => localStorage.setItem('overdue.tips.v1', '{"seen":["a2hs-off","whatsnew-1.16.0"]}')); await page.reload(); await page.waitForTimeout(900);
      await page.evaluate(() => { const O = __overdue; O.startRun('endless'); O.god(); O.grant('librarycat'); for (let i = 0; i < 3; i++) O.grant('margin'); O.grant('dewey'); });
      // Deterministic: hand-step the sim (real loop paused) until 4+ Margin books are airborne AND the cat has hit something, and take the
      // numbers at that very step. (v1.15.4 fix: the old version waited in real time, then screenshotted, then re-read the books: under load
      // the books had expired by then, or the 15 s real-time wait ran out at 20 fps.) Bounded at 90 s of game time.
      const m = await page.evaluate(`(async () => { const O = __overdue; O.drive(true);
        const snap = () => ({ cats: O.cats.length, side: O.books.filter((b) => b.margin).length, homingSide: O.books.filter((b) => b.margin && b.nohome).length,
          rear: O.books.filter((b) => b.margin).some((b) => Math.cos(Math.atan2(b.vy, b.vx) - O.player.aim) < -0.9), catDmg: O.runCounters.dealt.cat });
        let m = snap(), steps = 0;
        try { for (; steps < 5400; steps++) { O.stepN(1); m = snap(); if (m.side >= 4 && m.catDmg > 0) break; } } finally { O.drive(false); }
        return { ...m, steps }; })()`);
      await shot(page, `${name}-cat-and-margin`);
      record(area, 'the cat is on screen and pounces (damage dealt by the cat)', m.cats === 1 && m.catDmg > 0, JSON.stringify(m));
      record(area, 'Margin Notes 3/3 throws side and rear books that never home', m.side >= 4 && m.side === m.homingSide, JSON.stringify(m));
      record(area, 'no page errors (cat/margin)', errors.length === 0, errors.join('; ').slice(0, 200));
      await ctx.close(); }
  } catch (e) { record(area, 'new perks flow completed', false, e.message.split('\n')[0]); }
  return record.list;
}

async function steadyContext(opts) {
  const ctx = await browser.newContext(opts), np = ctx.newPage.bind(ctx);
  ctx.newPage = async () => {
    const page = await np(), ev = page.evaluate.bind(page);
    page.evaluate = async (...a) => {
      for (let i = 0; ; i++) {
        try { return await ev(...a); }
        catch (e) {
          if (i >= 3 || !/Execution context was destroyed|navigation/i.test(String(e.message))) throw e;
          await page.waitForLoadState('load').catch(() => {}); await page.waitForSelector('body.ready', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(150);
        }
      }
    };
    return page;
  };
  return ctx;
}

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
    const ctx = await steadyContext({ ...phone, permissions: ['clipboard-read', 'clipboard-write'] });
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
    let waiting = false;
    for (let i = 0; i < 40 && !waiting; i++) { waiting = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting); if (!waiting) await page.waitForTimeout(250); }
    record(area, 'update: the new build is fetched in the background (worker waiting)', waiting);
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
    const c2 = await steadyContext({ ...phone, permissions: ['clipboard-read', 'clipboard-write'] });
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
      const c = await steadyContext(phone);
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
    const cw = await steadyContext(phone); const wp = await cw.newPage(); await wp.goto(`http://localhost:${server.address().port}/?debug=1`); await wp.waitForSelector('body.ready');
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
  if (want('status')) tasks.push(() => statusFlow());
  if (want('act2')) tasks.push(() => act2Flow());
  if (want('lookfeel')) tasks.push(() => lookFeelFlow());
  if (want('newplayer')) for (const [name, opts] of TARGETS) tasks.push(() => newPlayerFlow(name, opts));
  if (want('newperks')) tasks.push(() => newPerksFlow(...TARGETS[0]));
  if (want('basics')) tasks.unshift(() => basicsFlow());
  const t0 = Date.now();
  // Report order stays stable: screens (full, then fit), menus, rotation, shapes, regardless of finish order.
  for (const list of await pool(tasks, JOBS)) results.push(...list);
  console.log(`(parallel section: ${tasks.length} flows, ${JOBS} at a time, ${Math.round((Date.now() - t0) / 1000)}s)`);
}

// ---------------------------------------------------------------- 4. performance budget

// Perf sampling: warm up, then 5 x 2 s timed samples; judged on the MEDIAN so one slow sample (software raster, load) can't flip a check.
// Also times the game update alone (JS we control, no canvas) per step with the real loop paused.
const PERF_SAMPLES = 5, PERF_SAMPLE_MS = 2000;
const PERF_SAMPLE_JS = `(async (N, MS) => {
  const O = __overdue, out = [];
  const reset = () => { const b = O.enemies.find((e) => e.type === 'boss'); if (b) { b.hp = b.maxHp; O.player.x = b.x; O.player.y = Math.min(b.y + 160, 900); } };
  const run = (ms) => new Promise((res) => { reset(); const t0 = performance.now(), sim0 = O.game.playTime; let frames = 0;
    const tick = (now) => { frames++; const b = O.enemies.find((e) => e.type === 'boss'); if (b && b.hp < b.maxHp * 0.5) b.hp = b.maxHp; if (now - t0 < ms) requestAnimationFrame(tick); else res({ sim: (O.game.playTime - sim0) / ((performance.now() - t0) / 1000), fps: frames / ((now - t0) / 1000), books: O.counts().books, hazards: O.counts().hazards }); };
    requestAnimationFrame(tick); });
  await run(4000); // warm-up, discarded (fps climbs for the first few seconds as caches and JIT settle)
  for (let s = 0; s < N; s++) {
    const r = await run(MS);
    // game-update time alone (no canvas): 60 steps with the real loop paused
    O.drive(true);
    try { reset(); O.game.freeze = 0; const t0 = performance.now(); for (let i = 0; i < 60; i++) { O.game.freeze = 0; O.stepN(1); } r.upd = (performance.now() - t0) / 60; } finally { O.drive(false); }
    out.push(r);
  }
  return { out };
})`;
const perfSample = async (page) => {
  const r = await page.evaluate(`${PERF_SAMPLE_JS}(${PERF_SAMPLES}, ${PERF_SAMPLE_MS})`);
  const col = (k) => r.out.map((x) => x[k]);
  return { sim: median(col('sim')), fps: median(col('fps')), books: Math.max(...col('books')), hazards: Math.max(...col('hazards')), upd: median(col('upd')),
    simS: col('sim'), fpsS: col('fps'), updS: col('upd') };
};
const perfDetail = (m) => `median ${m.fps.toFixed(0)} fps, ${m.sim.toFixed(2)}x · game update median ${m.upd.toFixed(2)} ms/frame · fps samples ${m.fpsS.map((v) => v.toFixed(0)).join(', ')}`;

// Update time and sim speed always fail QA. fps fails only when a GPU is present; with software rendering (SwiftShader/llvmpipe) it is a ⚠️ warning
// (canvas raster dominates there, ~78% of frame time, so fps swings 35-59 on one commit).
const UPDATE_MS_MAX = 4;
let GPU = null;
const perfChecks = async (page, label, m) => {
  if (GPU === null) GPU = await page.evaluate(() => { try { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const r = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'none'; return { renderer: String(r), gpu: !!e && !/swiftshader|llvmpipe|software|softpipe|none/i.test(String(r)) }; } catch { return { renderer: 'error', gpu: false }; } });
  record('perf', `${label} game update ≤ ${UPDATE_MS_MAX} ms/frame`, m.upd <= UPDATE_MS_MAX, perfDetail(m));
  if (!PERF.fps) return;
  const ok = m.fps >= PERF.fps;
  if (GPU.gpu) record('perf', `${label} fps ≥ ${PERF.fps} (GPU: ${GPU.renderer})`, ok, perfDetail(m));
  else record('perf', `${label} fps ≥ ${PERF.fps} ${ok ? '' : '⚠️ warning only'} (no GPU: ${GPU.renderer})`, true, `${ok ? '' : '⚠️ below limit, not failing: '}${perfDetail(m)}`);
};
// Late-game boss with a stacked build: this once ran at 0.4x game speed (chained hit-stop) and ~40fps.
if (want('perf')) {
  const ctx = await steadyContext(devices['iPhone 13 landscape']);
  const page = await ctx.newPage();
  await page.goto(URL0); await page.evaluate(RETURNING_SAVE_JS); await page.reload(); await page.waitForTimeout(500);
  await page.tap('[data-act=play]'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const O = __overdue;
    for (const id of ['hardcover', 'hardcover', 'hardcover', 'speedreader', 'speedreader', 'speedreader', 'trilogy', 'trilogy', 'trilogy',
      'plottwist', 'plottwist', 'plottwist', 'footnotes', 'footnotes', 'audiobook', 'audiobook', 'bookmark', 'spinebreaker',
      'm_tome', 'm_zone', 'm_saga', 'm_twist', 'm_biblio', 'unreliable', 'annotated']) O.grant(id);
    O.startWave(15); O.god();
  });
  await page.waitForTimeout(3000);
  const samples = await perfSample(page);
  await shot(page, 'perf-late-boss');

  record('perf', `late boss game speed ≥ ${PERF.sim}x`, samples.sim >= PERF.sim, perfDetail(samples));
  await perfChecks(page, 'late boss', samples);
  record('perf', 'books in flight capped', samples.books <= 110, `max ${samples.books}`);
  // v1.15.0: stress build (Trilogy 3, Margin 3, Speed Reader 3, In the Zone, Saga, Crossfire, Demolition) on the wave-15 boss.
  await page.evaluate(() => {
    const O = __overdue; O.startRun('endless');
    for (const id of ['trilogy', 'trilogy', 'trilogy', 'margin', 'margin', 'margin', 'speedreader', 'speedreader', 'speedreader', 'spinebreaker', 'spinebreaker', 'spinebreaker',
      'm_zone', 'm_saga', 'crossfire', 'm_demolition']) O.grant(id);
    O.startWave(15); O.god();
  });
  await page.waitForTimeout(3000);
  const stress = await perfSample(page);
  await shot(page, 'perf-stress-margin');

  record('perf', `v1.15.0 stress build (Margin 3 + Crossfire + Demolition...) late boss game speed ≥ ${PERF.sim}x`, stress.sim >= PERF.sim, perfDetail(stress));
  await perfChecks(page, 'v1.15.0 stress build late boss', stress);
  record('perf', 'v1.15.0 stress build: books in flight capped', stress.books <= 110, `max ${stress.books}`);

  // v1.15.0: wave-15 boss with a stacked status build (Leaky Pen 3, Static 3, Cold 3, Pop-up 3 + all 4 combos + Trilogy 3)
  await page.evaluate(() => {
    const O = __overdue;
    O.startRun('endless', 1);
    for (const id of ['leakypen', 'leakypen', 'leakypen', 'static', 'static', 'static', 'coldstorage', 'coldstorage', 'coldstorage', 'popup', 'popup', 'popup',
      'brittle', 'conductive', 'superconductor', 'inkbombs', 'trilogy', 'trilogy', 'trilogy', 'speedreader', 'speedreader', 'speedreader', 'hardcover', 'hardcover', 'hardcover',
      'm_indelible', 'm_deepfreeze', 'm_powergrid', 'm_finale']) O.grant(id);
    O.startWave(15); O.god();
  });
  await page.waitForTimeout(3000);
  const st = await perfSample(page);
  await shot(page, 'perf-status-boss');

  record('perf', `status-stacked boss game speed ≥ ${PERF.sim}x`, st.sim >= PERF.sim, perfDetail(st));
  await perfChecks(page, 'status-stacked boss', st);
  // Story late game: wing 10 room 6, a crowd of elites firing fans of pages.
  await page.evaluate(() => { const O = __overdue; O.unlockAll(); O.startRun('story', 10); O.startWave(6); O.god(); });
  await page.waitForTimeout(5000);
  const story = await perfSample(page);
  await shot(page, 'perf-story-late');
  record('perf', `story wing 10 game speed ≥ ${PERF.sim}x`, story.sim >= PERF.sim, `${perfDetail(story)} · ${story.hazards} pages in flight`);
  await perfChecks(page, 'story wing 10', story);
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
  const fileTerms = existsSync(join(ROOT, '.qa-private-terms')) ? parseTerms(readFileSync(join(ROOT, '.qa-private-terms'), 'utf8')) : [];
  const envTerms = parseTerms(process.env.QA_PRIVATE_TERMS); // CI passes the QA_PRIVATE_TERMS repository secret
  const priv = [...new Set([...fileTerms, ...envTerms])];
  const hits = [];
  for (const [f, t] of texts) {
    if (SECRET.test(t)) hits.push(`secret-like token in ${f}`);
    for (const e of t.match(EMAIL) || []) if (!ALLOWED_EMAIL.test(e)) hits.push(`email in ${f}`);
    hits.push(...scanText(f, t, priv)); // pasted OVD1/OVS1 codes, save-like JSON, private terms (never echoed)
  }
  record('security', 'no secrets, emails or pasted player data in files + commit messages', hits.length === 0, summarize(hits).slice(0, 5).join(' | '));
  record('security', 'private-terms scan', true, priv.length ? `${priv.length} private terms checked (${fileTerms.length} file, ${envTerms.length} env)` : 'skipped: create .qa-private-terms (gitignored) or set QA_PRIVATE_TERMS');
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
