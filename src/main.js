// OVERDUE! — Night Shift at the Meme Library
// Engine: fixed-timestep loop, flow-field AI, dynamic lighting, procedural audio, roguelite perks.
import { chooseTarget, leadPoint } from './autoaim.js';
import { W, H, CELL, COLS, ROWS, SAFE, PORTRAIT, setGrid, gridForAspect, areaK, generateArena, isSolidPx, cellOf, edgeCells, idx } from './arena.js';
import { themeOf, ACTS } from './themes.js';
import { RUN_KEY, newCounters, addDealt, addTaken, bookEnded, sampleFlight, buildRecord, pushRun, normalizeRuns, encodeStats } from './runlog.js';
import { createBackend } from './backend.js';
import { BUILD, versionLabel, fetchLatestBuild } from './version.js';
import { CATALOGUE } from './catalogue.js';
import { computeFlowField, lineOfSight, wallRadius } from './flowfield.js';
import { composeWave } from './waves.js';
import { isWaterType, DRY_SWAP, EEL, BOAT, eelInit, eelStep, boatInit, boatStep, moveInWater, discInWater, inWater, waterSpawn, nearestWalkway, hasWater, HUNT, huntActive, labelPonds, nearestInPond } from './water-enemies.js';
import { NEW_IN_1_15, baseStats, rollUpgrades, UPGRADES, byId, masterworkFor, gainText, comboPartners, combosInReach, pips, buildChips, specialReason, levelInfo, perkTip, normalizeTips, TIPS } from './upgrades.js';
import { Rng, clamp, lerp, TAU, hashString, angleDiff, pushCircleOutOfRect, cornerAssist, aimSource, aimStick } from './util.js';
import { PLAYER, bookLook } from './palette.js';
import { isStatusSource, canProc, procChance, freeze, chillFactor, applyChill, applyInk, tickInk, shouldShatter, statusDamageMult, makeBurstBudget, deepFreezeHit, zapChain, makeMetrics, tickMetrics, ZAP_REACH, ZAP_POOL, ZAP_LIFE, DEEP_FREEZE_TIME, SUPER_FREEZE_TIME, SPLASH_RADIUS, SPLASH_STRENGTH, POP_CHAIN_HITS } from './status.js';
import { BURST, shadowK, drawEnemy as drawArtEnemy, drawWorms } from './enemy-art.js';
import { SoundEngine } from './audio.js';
import { actOf, WINGS_PER_ACT, WINGS, roomsIn, bossRoom, eliteRoom, SURVIVE_SECONDS, curveRoom, difficulty, composeRoom, layoutSeed, roomShape, roomReward } from './story.js';
import { DOORS, soleDoor, doorOffer, applyDoor, doorReward, mysteryPrize, rarePick } from './doors.js';
import { GUIDE_FLAG, UNLOCK_FLAG, MENUS, unlockToast, hasPlayed, unlockedMenus, newUnlocks, shouldGuide, GUIDE_BEATS, guidePrompt, WHATS_NEW, whatsNewAction, whatsNewFlag, badgeFlag, badgedCards } from './newplayer.js';
import { BACKUP_KEYS, encodeBackup, decodeBackup, describeBackup } from './backup.js';
import { PROGRESS_KEY, RENOVATIONS, normalizeProgress, applyRenovations, runBonuses, recordRun, level, nextCost, canBuy, buy, renoText } from './meta.js';

// ======================================================================
// Setup, settings, content
// ======================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');
const LEGACY_ROOMS = DEBUG && new URLSearchParams(location.search).has('legacyrooms');   // balance bot: play story at the pre-1.14.0 room size

const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const SETTINGS_KEY = 'overdue.settings.v1';
const settings = Object.assign({ sfx: true, music: true, lights: true, motion: true, autofire: false, autoaim: true }, loadJSON(SETTINGS_KEY));

const sound = new SoundEngine();
sound.sfxOn = settings.sfx; sound.musicOn = settings.music;

const content = CATALOGUE;

// Late fees: permanent progression (fines + Renovations + story unlocks). Its own key; no old save is touched.
let progress = normalizeProgress(loadJSON(PROGRESS_KEY));
const saveProgress = () => saveJSON(PROGRESS_KEY, progress);
// Hidden tester switch (v1.16.0): 7 taps on the title's version line. Its own additive key; progress is never touched.
// In tester mode every wing is playable, but runs don't count for first-clear bonuses, best rooms or unlocks (fines still bank).
const TESTER_KEY = 'overdue.tester.v1';
let tester = { on: !!loadJSON(TESTER_KEY).on };
const effUnlocked = () => (tester.on ? WINGS.length : progress.unlocked);
const isStory = () => game.mode === 'story';
const wingDef = () => WINGS[(game.wingN || 1) - 1];
const backend = createBackend();

function updateSourceBadge() {
  const el = $('#source');
  if (el) el.textContent = `📚 ${content.books.length} titles on the shelves · ${content.authors.length} rogue authors at large`;
}
const pickBook = () => content.books[(Math.random() * content.books.length) | 0];
const pickAuthor = () => {
  const a = content.authors && content.authors.length ? content.authors[(Math.random() * content.authors.length) | 0] : null;
  return (a && a.name) || 'The Anonymous Author';
};
const short = (s, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ======================================================================
// Canvas sizing (logical 960x540 or 540x960 on portrait phones, letterboxed, HiDPI aware)
// ======================================================================
let dpr = 1, viewScale = 1;
// v1.14.0: story rooms are bigger than the screen-fitting legacy grid, so the world draws smaller. uiK (>= 1) is how much
// smaller; HUD, touch sticks and floating text are scaled up by it so they keep exactly their v1.13.1 on-screen size.
// UW x UH is the screen-space "UI canvas" (equal to W x H whenever uiK is 1).
let uiK = 1, UW = W, UH = H, layoutStory = false;
const isPortraitScreen = () => innerHeight > innerWidth * 1.15;
/** Pick the arena shape for the current screen. Only called between runs. */
function applyLayout(force = false) {
  const [cols, rows] = gridForAspect(innerWidth / innerHeight, layoutStory);
  if (force || cols !== COLS || rows !== ROWS) {
    setGrid(cols, rows);
    LAMPS = lampPositions();
    lightCanvas.width = W * LS; lightCanvas.height = H * LS;
    arena = generateArena(game.seed, Math.max(1, game.wave));
    player.x = W / 2; player.y = H / 2;
    buildBackground();
    flow = null;
  }
  document.body.classList.toggle('portrait', PORTRAIT);
  resize();
}
function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  const [lc, lr] = gridForAspect(innerWidth / innerHeight);   // the legacy (v1.13.1) grid for this screen
  uiK = Math.max(1, Math.min(innerWidth / (lc * CELL), innerHeight / (lr * CELL)) / scale);
  UW = W / uiK; UH = H / uiK;
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  stage.style.setProperty('--ui-scale', String(Math.max(0.55, Math.min(1.25, scale * uiK))));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  viewScale = cw / W;
}
/** Touch devices held in portrait get a full-screen "turn your phone" overlay (desktop never does). */
function updateRotateOverlay(canPause = false) {
  const need = touch.enabled && isPortraitScreen();
  const was = document.body.classList.contains('rotate-needed');
  document.body.classList.toggle('rotate-needed', need);
  $('#rotate').hidden = !need;
  // Pause a run in progress; no auto-resume on rotating back, so the player isn't hit while turning the phone.
  if (canPause && need && !was && game.state === 'playing') pause();
}
/** Re-check orientation and layout. iOS fires a portrait-sized resize while the page is hidden (app switcher) and
 *  often none on return, so this also runs on visibility / pageshow / orientation changes and once more shortly after. */
function relayout(canPause = false) {
  if (document.hidden) return; // sizes reported while hidden are not the real ones
  // Re-shape the arena on rotation only while no run is in progress.
  if (game.state === 'title' || game.state === 'gameover') applyLayout(); else resize();
  updateRotateOverlay(canPause);
}
let relayoutTimer = 0;
function relayoutSoon(canPause = false) {
  relayout(canPause);
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => relayout(canPause), 300);
}
addEventListener('resize', () => relayout(true));
addEventListener('orientationchange', () => relayoutSoon(true));
addEventListener('pageshow', () => relayoutSoon());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { relayoutSoon(); sound.resume(); } });
addEventListener('pageshow', () => sound.resume());
// Any touch/click/key also resumes a context iOS left suspended (the only reliable way: it needs a user gesture)
for (const ev of ['touchend', 'pointerdown', 'keydown']) addEventListener(ev, () => sound.resume(), { passive: true, capture: true });
try { matchMedia('(orientation: portrait)').addEventListener('change', () => relayoutSoon(true)); } catch { /* old browsers */ }

// ======================================================================
// Input: keyboard + mouse, touch (virtual stick), gamepad
// ======================================================================
const keys = new Set();
const actions = { dash: false, shhh: false };
const mouse = { x: W / 2, y: H / 2, down: false, seen: false };
const touch = { enabled: false, moveId: null, mx0: 0, my0: 0, mx: 0, my: 0, aimId: null, ax0: 0, ay0: 0, ax: 0, ay: 0, dead: 10, aimed: false };
const pad = { connected: false, mx: 0, my: 0, ax: 0, ay: 0, fire: false, prev: [] };

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && game.state === 'playing') e.preventDefault();
  if (!keys.has(k)) onKeyPress(k);
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = false; if (game.state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });

function onKeyPress(k) {
  sound.init();
  if (game.state === 'playing') {
    if (k === 'Space' || k === 'ShiftLeft' || k === 'ShiftRight') actions.dash = true;
    if (k === 'KeyE' || k === 'KeyQ') actions.shhh = true;
    if (k === 'KeyP' || k === 'Escape') pause();
  } else if (game.state === 'paused' && (k === 'KeyP' || k === 'Escape')) resume();
  else if (game.state === 'upgrade' && /^Digit[1-4]$/.test(k)) {
    const b = document.querySelectorAll('#cards .card')[+k.slice(5) - 1];
    if (b && cardsArmed()) b.click();
  } else if (game.state === 'doors' && /^Digit[1-2]$/.test(k)) {
    const b = document.querySelectorAll('#doorCards .door')[+k.slice(5) - 1];
    if (b) b.click();
  } else if (game.state === 'title' && (k === 'Enter') && !document.activeElement?.matches('button')) startRun();
  if (k === 'KeyM') { const on = !(settings.sfx || settings.music); setSetting('sfx', on); setSetting('music', on); toast(on ? '🔊 Sound on' : '🔇 Muted'); }
  if (k === 'KeyF' && game.state === 'playing') { setSetting('autofire', !settings.autofire); toast(`Auto-fire ${settings.autofire ? 'ON' : 'OFF'}`); }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sound.init();
  const p = toLogical(e);
  if (e.pointerType === 'touch') {
    e.preventDefault();
    enableTouch();
    if (touch.moveId === null) { touch.moveId = e.pointerId; touch.mx0 = touch.mx = p.x; touch.my0 = touch.my = p.y; }
    else if (touch.aimId === null) { touch.aimId = e.pointerId; touch.ax0 = touch.ax = p.x; touch.ay0 = touch.ay = p.y; touch.dead = 10 * W / canvas.getBoundingClientRect().width; } // aim stick: origin = where the finger lands; deadzone ~10 CSS px
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    return;
  }
  if (touch.enabled) { touch.enabled = false; document.body.classList.remove('touch'); }
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
  mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
  if (e.button === 0) mouse.down = true;
  if (e.button === 2 && game.state === 'playing') actions.shhh = true;
});
canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  if (e.pointerType === 'touch') {
    if (e.pointerId === touch.moveId) { touch.mx = p.x; touch.my = p.y; }
    if (e.pointerId === touch.aimId) { touch.ax = p.x; touch.ay = p.y; }
    return;
  }
  mouse.x = p.x; mouse.y = p.y; mouse.seen = true;
});
const endPointer = (e) => {
  if (e.pointerId === touch.moveId) touch.moveId = null;
  if (e.pointerId === touch.aimId) touch.aimId = null;
  if (e.pointerType !== 'touch' && e.button === 0) mouse.down = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' && e.button === 0) mouse.down = false; });

function enableTouch() {
  if (touch.enabled) return;
  touch.enabled = true;
  document.body.classList.add('touch');
  updateRotateOverlay();
}
// Show touch controls from the first touch anywhere on the page (e.g. tapping "Start shift").
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') enableTouch(); }, { capture: true });
if (window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches) enableTouch();
const btnDash = $('#btnDash'), btnShhh = $('#btnShhh');
$('#btnDash').addEventListener('pointerdown', (e) => { e.preventDefault(); actions.dash = true; });
$('#btnShhh').addEventListener('pointerdown', (e) => { e.preventDefault(); actions.shhh = true; });
$('#btnPause').addEventListener('click', () => (game.state === 'playing' ? pause() : null));

function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of gps) if (g) { gp = g; break; }
  if (!gp) { pad.connected = false; pad.fire = false; return; }
  pad.connected = true;
  const dz = (v) => (Math.abs(v || 0) < 0.22 ? 0 : v);
  pad.mx = dz(gp.axes[0]); pad.my = dz(gp.axes[1]);
  pad.ax = dz(gp.axes[2]); pad.ay = dz(gp.axes[3]);
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  pad.fire = Math.hypot(pad.ax, pad.ay) > 0.35 || b(7);
  for (const i of [0, 1, 4, 5, 9, 12, 13, 14, 15]) {
    if (b(i) && !pad.prev[i]) onPadPress(i);
    pad.prev[i] = b(i);
  }
}
function onPadPress(i) {
  sound.init();
  if (game.state === 'playing') {
    if (i === 0 || i === 5) actions.dash = true;
    if (i === 1 || i === 4) actions.shhh = true;
    if (i === 9) pause();
    return;
  }
  if (game.state === 'paused' && i === 9) return resume();
  // Menu navigation: move focus between visible buttons, A to activate.
  const btns = [...document.querySelectorAll('.screen:not([hidden]) button:not([disabled])')];
  if (!btns.length) return;
  const cur = btns.indexOf(document.activeElement);
  if (i === 12 || i === 14) btns[(cur - 1 + btns.length) % btns.length].focus();
  else if (i === 13 || i === 15) btns[(cur + 1) % btns.length].focus();
  else if (i === 0) (cur >= 0 ? btns[cur] : btns[0]).click();
}

// ======================================================================
// World state
// ======================================================================
const game = {
  state: 'title', wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, time: 0, playTime: 0,
  seed: 1, freeze: 0, timeScale: 1, trauma: 0, flash: 0, banner: '', bannerSub: '', bannerT: 0,
  owned: {}, noHitWave: true, clearT: 0, boss: null, deathT: 0, waveT: 0, surviveT: 0, ammoT: 0, ammo: null,
  mode: 'endless', wingN: 1, diff: null, fines: 0, cards: 3, banked: null, wingCleared: false,
  door: null, bonusPicks: 0, pickIsBonus: false, rarePick: false, rareId: null, cursedOffer: null, picks: [], doorLog: [], banished: new Set(), lastHit: null, lastHitElite: false, lastRun: null,
};
let stats = baseStats();
let rl = newCounters();          // run log counters (damage by source, book stats); reset every run
let hazPat = 'page';             // which attack the next hazard comes from (for 'what killed you')
let player = makePlayer();
let arena = generateArena(1, 1);
let flow = null, flowCell = -1, flowT = 0;
let bg = null;
let rng = new Rng(1);
let spawnQueue = [];
const enemies = [], books = [], hazards = [], rings = [], particles = [], texts = [], pickups = [], telegraphs = [], flashes = [];

function makePlayer() {
  return { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 11, hp: 5, aim: 0, fireT: 0, dashT: 0, dashCd: 0, dashStock: 1, throws: 0, streak: 0, amnesty: false, dx: 1, dy: 0, revives: 0,
    inv: 0, shhhT: 0, rapidT: 0, walk: 0, trail: [] };
}

const comboMult = () => Math.min(4, 1 + Math.floor(game.combo / 5) * 0.5);

// ======================================================================
// Run / wave flow
// ======================================================================
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* refused */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && game.state === 'playing') keepAwake(); });

/** mode 'endless' (classic waves) or 'story' (one wing of ROOMS_PER_WING rooms). */
function startRun(mode = 'endless', wing = 1, opts = {}) {
  sound.init();
  keepAwake();
  layoutStory = mode === 'story' && !LEGACY_ROOMS;   // endless keeps the legacy grid (same waves for the same seed)
  applyLayout();
  touch.aimed = false;
  game.seed = (Math.random() * 1e9) | 0;
  rng = new Rng(game.seed);
  const bonus = runBonuses(progress);
  Object.assign(game, { wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, playTime: 0, owned: {}, renews: bonus.renews, banishes: bonus.banishes, banished: new Set(),
    freeze: 0, timeScale: 1, trauma: 0, flash: 0, boss: null, mode, wingN: mode === 'story' ? clamp(wing, 1, WINGS.length) : 1, diff: null,
    guide: null, fines: 0, cards: bonus.cards, banked: null, wingCleared: false, door: null, bonusPicks: 0, pickIsBonus: false, afterBonus: false, rarePick: false, rareId: null, cursedOffer: null });
  stats = applyRenovations(baseStats(), progress);
  rl = newCounters(); sm = makeMetrics(); zaps.length = 0; popGen = 0;
  Object.assign(game, { picks: [], doorLog: [], lastHit: null, lastHitElite: false, lastRun: null });
  player = makePlayer();
  player.hp = stats.maxHp;
  player.revives = bonus.revives;
  // Head Start: free random perks (never specials) before room/wave 1.
  const head = bonus.startPerks ? rollUpgrades(rng, game.owned, bonus.startPerks, rollOpts({ noSpecial: true })) : [];
  freeQueue.length = 0; hideFreePerk();
  for (const u of head) { queueFreePerk(u, 'Head Start'); game.owned[u.id] = (game.owned[u.id] || 0) + 1; game.picks.push(u.id); u.apply(stats, player); }
  // v1.13.0: the very first story run opens with a short guided room (skippable). Debug hooks pass noGuide.
  if (!opts.noGuide && shouldGuide(playerSaves(), mode, game.wingN)) game.guide = { beat: -1, t: 0, gap: 0.8, used: false, done: false };
  startWave(1);
  if (touch.enabled && settings.autoaim === false && !game.guide) setTimeout(() => toast('Auto-aim off: drag a second finger to aim and throw'), 0);
}

function clearWorld() {
  for (const arr of [enemies, books, hazards, rings, telegraphs, pickups, particles, texts, flashes, cats]) arr.length = 0;
  spawnQueue = [];
  game.boss = null; game.bannerT = 0; bannerQueue.length = 0;
}

function startWave(n) {
  game.wave = n;
  clearWorld();
  game.diff = isStory() ? applyDoor(difficulty(game.wingN, n), game.door) : null;
  // Story rooms keep the same shelf layout every time you play them, like handmade levels.
  arena = isStory() ? generateArena(layoutSeed(game.wingN, n), n, Math.round(game.diff.shelvesPerHalf * areaK()), roomShape(game.wingN, n)) : generateArena(game.seed, n);
  buildBackground();
  flowCell = -1;
  player.x = W / 2; player.y = H / 2; player.vx = player.vy = 0;
  if (n !== 1) game.guide = null;
  spawnQueue = game.guide ? [] : (isStory() ? composeRoom(game.wingN, n, rng, game.diff) : composeWave(n, rng)).spawns;   // guided room: beats add their own spawns
  game.waveT = 0; game.noHitWave = true; game.boss = null;
  game.surviveT = isSurvive() ? SURVIVE_SECONDS : 0;
  game.ammo = pickBook(); game.ammoT = 0;
  player.dashStock = stats.dashCharges; player.dashCd = 0; player.amnesty = stats.amnesty;
  if (isStory()) player.shhhT = 0;   // story: SHHH is ready at the start of every room (endless keeps its cooldown)
  if (isStory()) {
    const kind = game.diff.kind;
    const door = DOORS[game.door]?.banner;
    const sub = game.guide ? 'Quick training: you can skip it' : kind === 'boss' ? 'A rogue author approaches…' : kind === 'elite' ? '★ Elite room: they fight back' : n === 1 ? wingDef().intro : door || wingDef().name;
    banner(`ROOM ${n}/${roomsIn(game.wingN)}`, isSurvive() ? `SURVIVE ${SURVIVE_SECONDS} s: stay alive, no need to clear the room${door && kind === 'normal' && n > 1 ? ' · ' + door.replace(/:.*/, '') : ''}` : sub);
    if (isSurvive() && !tipSeen('survive-room')) { markTip('survive-room'); setTimeout(() => { if (game.state === 'playing' && isSurvive()) toast('⏱️ Survive rooms: the timer ends the room. Dodge, throw, stay alive.', 3600, true); }, 1800); }
  } else banner(`WAVE ${n}`, n % 5 === 0 ? 'A rogue author approaches…' : '');
  sound.setIntensity(1); sound.setMuffled(false);
  game.state = 'playing';
  showScreen(null);
  document.body.classList.toggle('guiding', !!game.guide);
  flushFreePerks();
}

// One big banner at a time: later ones wait their turn instead of stacking.
const bannerQueue = [];
function banner(text, sub = '') {
  if (game.bannerT > 0.5 && game.banner !== text) { if (bannerQueue.length < 3) bannerQueue.push([text, sub]); return; }
  game.banner = text; game.bannerSub = sub; game.bannerT = 2.4;
}

/** Is this story room a Survive room (timer instead of "kill everything")? */
const isSurvive = () => isStory() && game.diff?.goal === 'survive';

/** The timer ran out: whatever is left vanishes in a SHHH-style wave (no score), then the room clears. */
function endSurvive() {
  game.surviveT = 0;
  for (const e of enemies) burst(e.x, e.y, e.type === 'boss' ? 30 : 8, ['#9be7dc', '#fff'], 90, 0.4);
  enemies.length = 0; telegraphs.length = 0; spawnQueue.length = 0;
  rings.push({ x: player.x, y: player.y, r: 8, max: Math.max(W, H), speed: 900, friendly: true, life: 1 });
  addLight(W / 2, H / 2, Math.max(W, H), 0.6, '#9be7dc');
  floatText(player.x, player.y - 26, 'SHHH!', '#9be7dc', 22, 1);
  sound.play('shhh');
  waveCleared();
}

function waveCleared() {
  const bonus = Math.round((250 * game.wave + (game.noHitWave ? 500 : 0)) * stats.scoreMult);
  game.score += bonus;
  // Fines for the clear: story rooms pay by room type; endless pays more every 5 waves and for bosses.
  const fine = isStory() ? Math.round(doorReward(game.wingN, game.wave, game.door) * stats.fineMult) : 1 + Math.floor(game.wave / 5) + (game.wave % 5 === 0 ? 15 : 0);
  game.fines += fine;
  const wingDone = isStory() && game.wave >= bossRoom(game.wingN);
  banner(wingDone ? 'WING CLEARED!' : 'SHELF CLEARED!', `${isStory() ? '' : `+${bonus.toLocaleString()} · `}+${fine} 🪙 fines${game.noHitWave ? ' · flawless!' : ''}`);
  if (stats.regenPerWave && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + stats.regenPerWave);
    floatText(player.x, player.y - 24, '+1 ♥ Lifetime Membership', '#ff6b81', 13, 1.4);
  }
  // Reading break after the elite room: a heart back before the second half of the wing.
  if (isStory() && game.wave === eliteRoom(game.wingN) && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + 1);
    floatText(player.x, player.y - 40, '+1 ♥ Reading break', '#ff6b81', 13, 1.4);
  }
  if (isStory() && game.door === 'mystery') resolveMystery();
  if (isStory() && game.door === 'rare') game.rarePick = true;   // v1.14.1: the next perk pick is the Rare pick
  game.wingCleared = wingDone;
  sound.play('wave');
  for (const h of hazards) burst(h.x, h.y, 3, ['#ff6b6b', '#fff'], 60, 0.3);
  hazards.length = 0; rings.length = 0;
  game.state = 'waveclear';
  game.clearT = wingDone ? 2.6 : 1.8;
  // Vacuum up leftover pickups for convenience.
  for (const p of pickups) p.magnet = true;
}

/** Mystery Shelf prize: 50% a cursed book you don't own (offered: take it or walk away), otherwise a bonus perk pick before the normal one. */
function resolveMystery() {
  const prize = mysteryPrize(game.seed, game.wingN, game.wave, game.owned, { banned: game.banished, lights: settings.lights });
  if (prize.kind === 'cursed') {
    game.cursedOffer = prize.id;   // v1.14.1: shown before the perk pick as Take it / Walk away
  } else {
    game.bonusPicks++;   // the bonus pick screen is labelled "1 of 2" / "2 of 2"
  }
}

function showUpgrades() {
  if (game.cursedOffer) return showCursedOffer();
  game.state = 'upgrade';
  game.bannerT = 0; texts.length = 0;
  sound.setMuffled(true);
  const bonus = game.bonusPicks > 0;
  if (bonus) game.bonusPicks--;
  const second = !bonus && game.afterBonus;   // the normal pick that follows a Mystery bonus pick
  if (bonus) game.afterBonus = true; else game.afterBonus = false;
  game.pickIsBonus = bonus;
  const rare = game.rarePick && !bonus; game.rarePick = false; game.rareId = null;
  let choices;
  if (rare) {
    // Rare Books: one more card than usual, and one of them is guaranteed to fit the build (combo / Masterwork path).
    const g = rarePick(rng, game.owned, { banned: game.banished, lights: settings.lights });
    choices = rollUpgrades(rng, game.owned, game.cards || 3, rollOpts(g ? { exclude: new Set([g.id]) } : {}));
    if (g) { choices.splice(rng.int(0, choices.length), 0, g); game.rareId = g.id; }
    else choices = rollUpgrades(rng, game.owned, (game.cards || 3) + 1, rollOpts());
  } else choices = rollUpgrades(rng, game.owned, game.cards || 3, rollOpts());
  if (!choices.length) return bonus ? showUpgrades() : nextRoom();
  const title = $('#upgradeTitle');
  title.textContent = rare ? `Room ${game.wave}/${roomsIn(game.wingN)} cleared — 💰 Rare pick: one extra card` : bonus ? '🎲 Mystery prize: bonus pick (1 of 2)' : second ? `Room ${game.wave} cleared — your normal pick (2 of 2)` : isStory() ? `Room ${game.wave}/${roomsIn(game.wingN)} cleared — choose a perk` : `Wave ${game.wave} cleared — choose a perk`;
  if (bonus || second) { const p = document.createElement('span'); p.className = 'pick-pips'; p.textContent = bonus ? '●○' : '●●'; p.setAttribute('aria-hidden', 'true'); title.appendChild(p); }
  renderCards(choices);
  showScreen('upgrade');
  if (!touch.enabled) $('#cards button').focus();
}

/** Mystery Shelf cursed book: one card, "Take it" or "Walk away" (nothing happens), then the normal pick. */
function showCursedOffer() {
  const u = byId(game.cursedOffer);
  game.state = 'upgrade';
  game.bannerT = 0; texts.length = 0;
  sound.setMuffled(true);
  const title = $('#upgradeTitle');
  title.textContent = '🎲 Mystery prize: a cursed book';
  const box = $('#cards');
  box.textContent = '';
  cardsArmedAt = performance.now() + 550;
  box.classList.remove('dealing'); void box.offsetWidth; box.classList.add('dealing');
  codex.seen.add(u.id); saveCodex();
  const wrap = buildCard(u, 0, 'offer');
  box.appendChild(wrap);
  $('#perkTip').hidden = true;
  $('#btnRenew').hidden = true;
  renderBuild($('#buildStrip'), []);
  showScreen('upgrade');
  if (!touch.enabled) wrap.querySelector('[data-act="take"]').focus();
}

function resolveCursedOffer(take) {
  if (!cardsArmed() || game.state !== 'upgrade' || !game.cursedOffer) return;
  const u = byId(game.cursedOffer);
  game.cursedOffer = null;
  if (take) {
    game.owned[u.id] = 1; game.picks.push(u.id); u.apply(stats, player);
    freeFresh.add(u.id);
    sound.play('upgrade');
    toast(`💀 ${u.name} taken`);
  } else { sound.play('click'); toast(`🚶 Walked away from ${u.name}`); }
  showUpgrades();
}

/** After a perk pick: a bonus pick first if one is owed, then (story) the door screen, then the next room. */
function afterPick() {
  if (game.pickIsBonus) { game.pickIsBonus = false; return showUpgrades(); }
  nextRoom();
}

function nextRoom() {
  game.pickIsBonus = false; game.afterBonus = false; game.rareId = null;
  const full = player.hp >= stats.maxHp;
  const offer = isStory() ? doorOffer(game.seed, game.wingN, game.wave, { atFullHp: full }) : [];
  if (!offer.length) { game.door = null; return startWave(game.wave + 1); }
  const only = soleDoor(offer);
  if (only) return enterDoor(only, true);   // fixed Elite / Author door: nothing to choose, so skip the screen
  showDoors(offer);
}

// ---- Doors (story): choose the next room ----
let currentDoors = [];
function showDoors(offer) {
  game.state = 'doors';
  game.bannerT = 0; texts.length = 0;
  sound.setMuffled(true);
  currentDoors = offer;
  const box = $('#doorCards');
  box.textContent = '';
  box.classList.toggle('single', offer.length === 1);
  cardsArmedAt = performance.now() + 550;
  box.classList.remove('dealing'); void box.offsetWidth; box.classList.add('dealing');
  $('#doorsTitle').textContent = `Room ${game.wave}/${roomsIn(game.wingN)} cleared — ${offer.length > 1 ? 'pick your next door' : 'the next door'}`;
  offer.forEach((id, i) => {
    const d = DOORS[id];
    const b = document.createElement('button');
    b.className = `door ${d.fixed ? 'fixed' : id}`;
    b.dataset.door = id;
    b.innerHTML = '<span class="key"></span><span class="icon"></span><strong></strong><span class="line"></span>';
    b.querySelector('.key').textContent = String(i + 1);
    b.querySelector('.icon').textContent = d.icon;
    b.querySelector('strong').textContent = d.name;
    b.querySelector('.line').textContent = d.line;
    b.addEventListener('click', () => chooseDoor(id));
    box.appendChild(b);
  });
  showScreen('doors');
  if (!touch.enabled) box.querySelector('.door').focus();
}

function chooseDoor(id) {
  if (!cardsArmed() || game.state !== 'doors') return;
  sound.play('click');
  enterDoor(id, false);
}

/** Walk through a door: apply it and start the next room. `auto` = no screen was shown, so announce it. */
function enterDoor(id, auto) {
  const d = DOORS[id];
  game.door = id; game.doorLog.push(id);
  startWave(game.wave + 1);
  if (auto) toast(d.banner, 2600);
  // Break Room: a heart back on entering (never above max).
  if (d.heal && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + d.heal);
    floatText(player.x, player.y - 24, `+${d.heal} ♥ Break Room`, '#ff6b81', 13, 1.4);
  }
}

const KIND_LABEL = { combo: 'Unlocked', cursed: 'Banned', master: 'Unlocked' };

// ---- Tips: each one shows once per player ever (v1.11.0). Own key; additive. ----
const TIPS_KEY = 'overdue.tips.v1';
let tips = normalizeTips(loadJSON(TIPS_KEY));
const saveTips = () => saveJSON(TIPS_KEY, tips);
const tipSeen = (id) => tips.seen.includes(id);
function markTip(id) { if (!tipSeen(id)) { tips.seen.push(id); saveTips(); } }

// ---- Codex: what this player has ever seen / discovered (per device) ----
const CODEX_KEY = 'overdue.codex.v1';
const codex = (() => { const c = loadJSON(CODEX_KEY); return { seen: new Set(c.seen || []), found: new Set(c.found || []) }; })();
const saveCodex = () => saveJSON(CODEX_KEY, { seen: [...codex.seen], found: [...codex.found] });

// Cards ignore taps for a moment after appearing, so a thumb still steering can't pick one by accident.
let cardsArmedAt = 0;
const cardsArmed = () => performance.now() >= cardsArmedAt;

let currentChoices = [];
function rollOpts(extra = {}) { return { lights: settings.lights, banned: game.banished, ...extra }; }

/** One short tip strip above the cards (never covers them). Marked seen when shown. */
function showPerkTip(choices) {
  const el = $('#perkTip');
  const tip = perkTip(choices, game.owned, tips.seen);
  const pulse = !!tip && tip.id === 'combo-pair';
  $('#cards').querySelectorAll('.hint').forEach((h) => h.classList.remove('pulse'));
  if (!tip) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = tip.text; el.dataset.tip = tip.id;
  if (pulse) { const h = $('#cards .hint.ready') || [...$('#cards').querySelectorAll('.hint')].find((x) => x.textContent); if (h) h.classList.add('pulse'); }
  markTip(tip.id);
}

/** Ids of cards this player had never seen when dealt; the NEW ribbon shows only when some (not all) cards are new. */
let newIds = new Set();
let badgeIds = new Set();   // v1.15.0: cards on screen that carry the NEW badge for a release-new perk (shown once per id)
function applyNew() {
  const all = currentChoices.length > 0 && currentChoices.every((u) => newIds.has(u.id));
  document.querySelectorAll('#cards .card').forEach((b, i) => { const id = currentChoices[i]?.id; b.classList.toggle('new', badgeIds.has(id) || (!all && newIds.has(id))); });
}
/** Mark these cards' NEW badges as shown (cleared for next time). */
function badgeShown(cards) {
  badgeIds = new Set(badgedCards(cards.map((u) => u.id), NEW_IN_1_15, tips.seen));
  for (const id of badgeIds) markTip(badgeFlag(id));
}

function renderCards(choices) {
  currentChoices = choices;
  const box = $('#cards');
  box.textContent = '';
  cardsArmedAt = performance.now() + 550;
  box.classList.remove('dealing'); void box.offsetWidth; box.classList.add('dealing');
  newIds = new Set(choices.filter((u) => !codex.seen.has(u.id)).map((u) => u.id));
  choices.forEach((u, i) => box.appendChild(buildCard(u, i)));
  for (const u of choices) codex.seen.add(u.id);
  badgeShown(choices);
  applyNew();
  saveCodex();
  showPerkTip(choices);
  const renew = $('#btnRenew');
  renew.hidden = !(game.renews > 0);
  renew.innerHTML = '';
  renew.append(`↻ Renew (${game.renews || 0})`, cap('reroll'));
  renderBuild($('#buildStrip'), choices);
}

/** Banish one card: only that card leaves (✕ stamp) and the replacement deals into the same slot. */
function banishCard(wrap, u) {
  if (!cardsArmed() || !(game.banishes > 0) || $('#cards .leaving')) return;
  game.banishes--; game.banished.add(u.id);
  const i = currentChoices.indexOf(u);
  const keep = new Set(currentChoices.map((c) => c.id));
  const [repl] = rollUpgrades(rng, game.owned, 1, rollOpts({ exclude: keep, noSpecial: true }));
  const next = currentChoices.slice();
  if (repl) next[i] = repl; else next.splice(i, 1);
  sound.play('click');
  toast(`✕ ${u.name} banished for this run`);
  cardsArmedAt = performance.now() + 150;
  const done = () => {
    currentChoices = next;
    const box = $('#cards');
    if (repl) {
      if (!codex.seen.has(repl.id)) newIds.add(repl.id);
      codex.seen.add(repl.id); saveCodex();
      for (const id of badgedCards([repl.id], NEW_IN_1_15, tips.seen)) { badgeIds.add(id); markTip(badgeFlag(id)); }
      const fresh = buildCard(repl, i);
      fresh.classList.add('dealt-one');
      wrap.replaceWith(fresh);
    } else wrap.remove();
    box.querySelectorAll('.card .key').forEach((k, n) => { k.textContent = String(n + 1); });
    cardsArmedAt = Math.max(cardsArmedAt, performance.now() + 150);
    applyNew(); showPerkTip(next); renderBuild($('#buildStrip'), next);
  };
  currentChoices = next;
  wrap.classList.add('leaving');
  const stamp = wrap.querySelector('.card .stamp'); if (stamp) stamp.textContent = '✕';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 320);
}

/** A small plain-words caption under (or beside) a fun term. */
function cap(text, inline = false) { const c = document.createElement('small'); c.className = inline ? 'cap inl' : 'cap'; c.textContent = text; return c; }

function buildCard(u, i, mode = '') {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap';
  const b = document.createElement('button');
  b.className = `card ${u.kind}`;
  const lvl = (game.owned[u.id] || 0) + 1;
  b.innerHTML = '<span class="key"></span><span class="stamp"></span><span class="icon"></span><strong></strong><span class="why"></span><span class="gain"></span><span class="hint"></span><span class="lvl"></span><span class="mw"></span>';
  b.querySelector('.key').textContent = String(i + 1);
  b.querySelector('.icon').textContent = u.icon;
  b.querySelector('.stamp').textContent = u.id === game.rareId && mode === '' ? '💰 Rare pick' : (KIND_LABEL[u.kind] || '');
  if (u.id === game.rareId && mode === '') { b.classList.add('rare'); b.dataset.rare = '1'; }
  b.querySelector('strong').textContent = u.name;
  // Option B: just the gain, in plain words. Specials describe their unique effect instead.
  const gain = u.kind === 'perk' || u.kind === 'cursed' ? gainText(u, stats, player) : [];
  b.querySelector('.gain').textContent = gain.length ? gain.join(' · ') : u.desc;
  // Combo hints: loud when this card completes a combo now, quiet when it just has a partner to look for.
  const partners = comboPartners(u, game.owned), hint = b.querySelector('.hint');
  if (partners[0]?.partnerOwned) { hint.textContent = `🔗 Completes a combo! + your ${partners[0].partner.icon} ${partners[0].partner.short} → ${partners[0].combo.icon} ${partners[0].combo.name}`; hint.classList.add('ready'); }
  else if (partners.length) hint.textContent = `🔗 Combos with ${partners.map((x) => `${x.partner.icon} ${x.partner.short}`).join(' or ')}`;
  else hint.textContent = '';
  const mw = u.kind === 'perk' && lvl === u.max ? masterworkFor(u.id) : null;
  // v1.11.0: say why a special card is here, show "now → after" pips, and tease Masterworks without revealing them.
  b.querySelector('.why').textContent = specialReason(u, game.owned);
  const info = levelInfo(u, game.owned);
  b.querySelector('.lvl').textContent = info.pips;
  b.querySelector('.mw').textContent = info.mwText;
  if (u.kind === 'master') b.querySelector('.lvl').append(cap('max-level bonus', true));
  else if (u.kind === 'combo') b.querySelector('.lvl').append(cap('perk combo', true));
  else if (/Masterwork/.test(info.mwText)) b.querySelector('.mw').append(cap('max-level bonus', true));
  if (info.mw) b.classList.add(info.mw === 'finale' ? 'finale' : 'near');
  b.addEventListener('click', () => {
    if (mode === 'offer') return;   // the offer card is read-only: use its two buttons
    if (!cardsArmed() || game.state !== 'upgrade' || wrap.classList.contains('leaving')) return;
    game.owned[u.id] = lvl; game.picks.push(u.id);
    u.apply(stats, player);
    sound.play('upgrade');
    if (u.kind === 'combo' || u.kind === 'master') { codex.found.add(u.id); saveCodex(); }
    if (u.kind === 'combo') toast(`📚 ${u.name} added to your Collected Works`);
    else if (u.kind === 'master') toast(`🏆 Masterwork: ${u.name}`);
    if ((u.kind === 'combo' || u.kind === 'master') && !tipSeen('codex')) setTimeout(() => { if (game.state === 'gameover' || tipSeen('codex')) return; markTip('codex'); toast(TIPS.codex); }, 1700);
    if (u.kind === 'perk' && mw) toast(`🏆 ${u.name} mastered! ${mw.name} will be offered next`);
    afterPick();
  });
  wrap.appendChild(b);
  if (mode === 'offer') {
    b.querySelector('.key').textContent = '';
    const row = document.createElement('div'); row.className = 'offer-actions';
    for (const [act, label, small] of [['take', 'Take it', 'gain and curse'], ['walk', 'Walk away', 'nothing changes']]) {
      const x = document.createElement('button'); x.type = 'button'; x.dataset.act = act; x.className = `offer-btn ${act}`;
      x.append(label, cap(small)); x.addEventListener('click', () => resolveCursedOffer(act === 'take'));
      row.appendChild(x);
    }
    wrap.appendChild(row);
    return wrap;
  }
  // Banish: remove a normal perk from this run's pool, and deal a replacement.
  if (game.banishes > 0 && (u.kind === 'perk' || u.kind === 'cursed')) {
    const x = document.createElement('button');
    x.className = 'banish';
    x.type = 'button';
    x.append('✕ Banish', cap('never offer again'));
    x.title = `Never offer ${u.name} again this run`;
    x.addEventListener('click', () => banishCard(wrap, u));
    wrap.appendChild(x);
  } else {
    const slot = document.createElement('span'); slot.className = 'banish-slot'; slot.setAttribute('aria-hidden', 'true'); wrap.appendChild(slot);
  }
  return wrap;
}

// ---- Free perks (Head Start, Mystery Shelf cursed book): a small card for ~3 s, never blocks play ----
const freeQueue = [];
let freeTimer = 0, freeEl = null;
const freeFresh = new Set();   // chips to pulse the next time the build strip is drawn
function queueFreePerk(u, label) {
  const gain = gainText(u, stats, player);   // read before the perk is applied: it is the gain this perk gives
  freeQueue.push({ id: u.id, icon: u.icon, name: u.name, gain: gain.length ? gain.join(' · ') : u.desc, label });
  freeFresh.add(u.id);
}
function flushFreePerks() { if (!freeEl && freeQueue.length) showNextFree(); }
function hideFreePerk() { clearTimeout(freeTimer); freeTimer = 0; if (freeEl) { freeEl.remove(); freeEl = null; } }
function showNextFree() {
  hideFreePerk();
  const f = freeQueue.shift();
  if (!f) return;
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'free-perk';
  el.innerHTML = '<span class="fp-label"></span><span class="fp-icon"></span><strong></strong><span class="fp-gain"></span>';
  el.querySelector('.fp-label').textContent = f.label;
  el.querySelector('.fp-icon').textContent = f.icon;
  el.querySelector('strong').textContent = f.name;
  el.querySelector('.fp-gain').textContent = f.gain;
  el.addEventListener('click', (e) => { e.stopPropagation(); showNextFree(); });
  $('#freePerks').appendChild(el);
  freeEl = el;
  sound.play('upgrade');
  freeTimer = setTimeout(showNextFree, 3000);
}

/** Title-screen hint is for brand-new players only: gone once a first run has finished (or saves show they have played). */
function hasFinishedRun() {
  return tipSeen('firstrun') || progress.lifetime > 0 || Object.keys(progress.best).length > 0 || !!loadJSON(BEST_KEY).score;
}
function updateFirstHint() { const h = $('#firstHint'); if (h) h.hidden = hasFinishedRun(); }

/**
 * "Your build": one chip per owned upgrade (icon + short name + pips). `offered` = the cards on screen, so chips
 * that pair with one of them glow and show 🔗. Tapping a chip opens a details popover (never picks a card).
 */
function renderBuild(el, offered = []) {
  closeBuildPop();
  el.textContent = '';
  const chips = buildChips(game.owned, offered);
  if (!chips.length) { el.hidden = true; return; }
  el.hidden = false;
  const label = document.createElement('span'); label.className = 'build-label'; label.textContent = 'Your build';
  el.appendChild(label);
  for (const c of chips) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `build-item ${c.kind}${c.linked ? ' linked' : ''}${el.id === 'buildStrip' && freeFresh.has(c.id) ? ' fresh' : ''}`;
    item.dataset.id = c.id;
    item.title = c.name;
    item.setAttribute('aria-label', `${c.name}, tap for details`);
    const ic = document.createElement('span'); ic.className = 'bi-icon'; ic.textContent = c.icon;
    const nm = document.createElement('span'); nm.className = 'bi-name'; nm.textContent = c.short;
    const sub = document.createElement('small');
    sub.textContent = c.kind === 'perk' ? pips(c.lvl, c.max) : c.kind === 'cursed' ? 'cursed' : c.kind === 'combo' ? 'combo' : 'master';
    item.append(ic, nm, sub);
    if (c.linked) { const l = document.createElement('span'); l.className = 'bi-link'; l.textContent = '🔗'; l.setAttribute('aria-hidden', 'true'); item.appendChild(l); }
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (game.state === 'upgrade' && !cardsArmed()) return;
      if (pop.item === item) closeBuildPop(); else openBuildPop(item, c);
    });
    el.appendChild(item);
  }
  if (el.id === 'buildStrip') freeFresh.clear();
}

// ---- Build chip details popover ----
const pop = { el: $('#buildPop'), item: null };
function closeBuildPop() {
  if (pop.item) pop.item.classList.remove('open');
  pop.item = null; pop.el.hidden = true;
}
function openBuildPop(item, c) {
  closeBuildPop();
  const u = byId(c.id), p = pop.el;
  p.textContent = '';
  const add = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; p.appendChild(n); return n; };
  add('strong', 'bp-title', `${u.icon} ${u.name}`);
  add('span', 'bp-desc', u.desc);
  if (u.kind === 'perk') {
    add('span', 'bp-lvl', `${pips(c.lvl, u.max)} ${c.lvl}/${u.max}`);
    const mw = c.lvl < u.max ? masterworkFor(u.id) : null;
    if (mw) add('span', 'bp-note', `Unlocks ${mw.icon} ${mw.name} at ${u.max}/${u.max}`);
    for (const cb of UPGRADES.filter((x) => x.kind === 'combo' && x.requires.includes(u.id))) {
      const partner = byId(cb.requires.find((r) => r !== u.id));
      const state = game.owned[cb.id] ? 'owned' : game.owned[partner.id] ? '✓' : 'needed';
      add('span', `bp-combo ${state === 'needed' ? 'need' : 'have'}`, `${cb.icon} ${cb.name}: ${partner.icon} ${partner.short} ${state}`);
    }
  } else if (u.kind === 'combo') {
    add('span', 'bp-note', `Made from ${u.requires.map((r) => `${byId(r).icon} ${byId(r).short}`).join(' + ')}`);
  } else if (u.kind === 'master') {
    add('span', 'bp-note', `${byId(u.requires[0]).icon} ${byId(u.requires[0]).short} mastered`);
  }
  p.hidden = false;
  // Place it just above the chip (below if there is no room), kept inside the stage.
  const sr = stage.getBoundingClientRect(), ir = item.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  const left = Math.max(4, Math.min(sr.width - pw - 4, ir.left - sr.left + ir.width / 2 - pw / 2));
  const above = ir.top - sr.top - ph - 6;
  p.style.left = `${left}px`;
  p.style.top = `${above >= 4 ? above : Math.min(sr.height - ph - 4, ir.bottom - sr.top + 6)}px`;
  item.classList.add('open'); pop.item = item;
}
// A tap outside the popover only closes it: the click that follows is swallowed so nothing underneath (a card, Renew, Resume) fires.
let swallowClickUntil = 0;
document.addEventListener('pointerdown', (e) => {
  if (pop.item && !e.target.closest('#buildPop, .build-item')) { closeBuildPop(); swallowClickUntil = performance.now() + 600; }
}, true);
document.addEventListener('click', (e) => {
  if (performance.now() < swallowClickUntil) { swallowClickUntil = 0; e.stopPropagation(); e.preventDefault(); }
}, true);
addEventListener('keydown', (e) => { if (e.code === 'Escape' && pop.item) { e.stopImmediatePropagation(); closeBuildPop(); } }, true);

$('#btnRenew').addEventListener('click', () => {
  if (!(game.renews > 0) || game.state !== 'upgrade' || !cardsArmed()) return;
  game.renews--;
  sound.play('pickup');
  renderCards(rollUpgrades(rng, game.owned, game.cards || 3, rollOpts()));
  $('#cards button').focus();
});

/** Pause screen: combos you're half-way to ("Annotated Edition: Hardcover ✓ + Footnotes"). */
function renderReach(el) {
  const rows = combosInReach(game.owned);
  el.textContent = '';
  el.hidden = !rows.length;
  if (!rows.length) return;
  const h = document.createElement('p'); h.className = 'reach-label'; h.textContent = 'Combos in reach'; el.appendChild(h);
  for (const { combo, have, need } of rows) {
    const li = document.createElement('div'); li.className = 'reach-row';
    const name = document.createElement('strong'); name.textContent = `${combo.icon} ${combo.name}`;
    const recipe = document.createElement('span');
    recipe.append(...[...have.map((u) => ['have', `${u.icon} ${u.name} ✓`]), ...need.map((u) => ['need', `${u.icon} ${u.name}`])]
      .flatMap(([cls, t], i) => { const s = document.createElement('span'); s.className = cls; s.textContent = t; return i ? [' + ', s] : [s]; }));
    li.append(name, recipe);
    el.appendChild(li);
  }
}

/** Library Codex: every combo and Masterwork, found or still a mystery. */
/** Creatures met (Act II): ids `enemy:<type>` in codex.seen (same saved shape, just new ids). */
const CREATURES = [
  { id: 'enemy:eel', icon: '🐍', name: 'Ink Eel', how: 'Swims under the water, then surfaces and spits a fan of pages. Only hittable while it is up.', hint: 'Lives in Act II water' },
  { id: 'enemy:boat', icon: '⛵', name: 'Paper Boat', how: 'Drifts on the water and drops an Overdue Notice on the walkway every few seconds. Fragile.', hint: 'Lives in Act II water' },
];
function renderCodex() {
  const cl = $('#codexCreatures');
  cl.textContent = '';
  for (const c of CREATURES) {
    const has = codex.seen.has(c.id);
    const li = document.createElement('li'); li.className = has ? 'found' : 'locked';
    const ic = document.createElement('span'); ic.className = 'icon'; ic.textContent = has ? c.icon : '?';
    const body = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = has ? c.name : '???';
    const how = document.createElement('small'); how.textContent = has ? c.how : c.hint;
    body.append(name, how); li.append(ic, body); cl.appendChild(li);
  }
  const specials = UPGRADES.filter((u) => u.kind === 'combo' || u.kind === 'master');
  const found = specials.filter((u) => codex.found.has(u.id)).length;
  $('#codexProgress').textContent = `${found} of ${specials.length} discovered`;
  for (const [kind, listId] of [['combo', '#codexCombos'], ['master', '#codexMasters']]) {
    const list = $(listId);
    list.textContent = '';
    for (const u of specials.filter((x) => x.kind === kind)) {
      const has = codex.found.has(u.id);
      const li = document.createElement('li');
      li.className = has ? 'found' : 'locked';
      const ic = document.createElement('span'); ic.className = 'icon'; ic.textContent = has ? u.icon : '?';
      const body = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = has ? u.name : '???';
      const how = document.createElement('small');
      how.textContent = has ? u.desc
        : kind === 'combo' ? `Recipe: ${u.requires.map((r) => `${byId(r).icon} ${byId(r).name}`).join(' + ')}` : `Take ${byId(u.requires[0]).name} to 3/3`;
      body.append(name, how);
      li.append(ic, body);
      list.appendChild(li);
    }
  }
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  sound.setMuffled(true);
  mouse.down = false;
  renderBuild($('#pauseBuild'));
  renderReach($('#pauseCombos'));
  showScreen('pause');
  $('#pause button').focus();
}
function resume() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  sound.setMuffled(false);
  showScreen(null);
}

function die() {
  game.state = 'dying';
  game.deathT = 1.8;
  game.timeScale = 0.25;
  sound.play('death');
  sound.setIntensity(0);
  burst(player.x, player.y, 60, ['#2bb3a3', '#f1c27d', '#fff'], 260, 1.2);
  addLight(player.x, player.y, 300, 1.2, null, true);
  shake(1);
}

// ======================================================================
// Spawning
// ======================================================================
/** Story only: every enemy (boss and elites too, so they keep their size above normals) is drawn 20% bigger; the hitbox grows 10% (20% made the bot stall on elites in the elite room: see ROADMAP). */
const STORY_ENEMY_SCALE = 1.2, STORY_HIT_SCALE = 1.1;
const DEF = {
  bunny: { r: 11, hp: 2, speed: 88, score: 50 },
  notice: { r: 10, hp: 1, speed: 150, score: 70 },
  patron: { r: 14, hp: 5, speed: 70, score: 150 },
  worm: { r: 9, hp: 2, speed: 105, score: 40 },
  golem: { r: 22, hp: 14, speed: 42, score: 300 },
  coin: { r: 7, hp: 1, speed: 140, score: 20 },
  eel: { r: 13, hp: 5, speed: 100, score: 160 },   // Act II: swims under water, surfaces to spit (src/water-enemies.js)
  boat: { r: 12, hp: 1, speed: 36, score: 90 },    // Act II: drifts on water, drops Overdue Notices on the walkways (hp is set in materialise)
  boss: { r: 40, hp: 1, speed: 60, score: 2000 },
};

/** Enemy HP multiplier for the current wave/room (story wings multiply on top of the room curve). */
const hpScaleNow = () => (game.diff ? game.diff.hpMult : 1 + Math.max(0, game.wave - 1) * 0.08);
function makeEnemy(type, x, y, extra = {}) {
  const d = DEF[type];
  const hpScale = hpScaleNow();
  // Story: even 1-HP enemies toughen up in later wings (only the wing part of the curve).
  const oneHp = game.diff ? Math.max(1, Math.floor(1 + 0.22 * (game.wingN - 1))) : 1;
  const hp = Math.max(1, Math.round(d.hp > 1 ? d.hp * hpScale : oneHp));
  const speedScale = game.diff ? game.diff.speedMult : 1 + Math.min(0.35, game.wave * 0.015);
  const e = { type, x, y, vx: 0, vy: 0, r: d.r, hp, maxHp: hp, speed: d.speed * speedScale * stats.enemySpeedMult,
    score: d.score, t: Math.random() * 10, stun: 0, flash: 0, dead: false, leader: null, atkT: 1.5 + Math.random() * 1.5, orbitHit: 0, vs: 1, trans: 0, ...extra };
  // Story rooms are ~20% bigger than 1.13 (everything draws smaller on a phone): enemies are drawn 20% bigger, hitbox with them. Endless unchanged.
  if (game.diff) { e.vs = STORY_ENEMY_SCALE; e.r = Math.round(e.r * STORY_HIT_SCALE * 10) / 10; }
  // Elites: bigger, ~2.2x HP, worth double, and they fire aimed pages (story mode).
  if (e.elite) {
    e.hp = e.maxHp = Math.max(2, Math.round(e.hp * 2.2 * (game.diff?.eliteHpMult || 1)));
    e.r = Math.round(e.r * 1.25); e.score *= 2;
    e.shootT = 1.2 + Math.random() * (game.diff ? game.diff.eliteShootEvery : 3);
  }
  enemies.push(e);
  return e;
}

function spawnPoint() {
  const cells = edgeCells(walkGrid());
  for (let i = 0; i < 20; i++) {
    const [cx, cy] = cells[(Math.random() * cells.length) | 0];
    const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
    if (Math.hypot(x - player.x, y - player.y) > 260) return { x, y };
  }
  return { x: 15, y: 15 };
}

function updateSpawning(dt) {
  game.waveT += dt;
  while (spawnQueue.length && spawnQueue[0].t <= game.waveT) {
    const s = spawnQueue.shift();
    // Water enemies spawn on water; in a room without water they swap for a dry enemy of about the same cost.
    const type = isWaterType(s.type) && !hasWater(arena) ? DRY_SWAP[s.type] : s.type;
    const p = type === 'boss' ? { x: W / 2, y: 130 } : isWaterType(type) ? (waterSpawn(arena.water, COLS, ROWS, CELL, player.x, player.y) || spawnPoint()) : spawnPoint();
    telegraphs.push({ type, x: p.x, y: p.y, t: 0, dur: type === 'boss' ? 1.6 : 0.85, elite: !!s.elite });
    sound.play('spawn');
  }
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const tg = telegraphs[i];
    tg.t += dt;
    if (tg.t >= tg.dur) {
      telegraphs.splice(i, 1);
      materialise(tg.type, tg.x, tg.y, tg.elite, tg.boat);
    }
  }
}

function materialise(type, x, y, elite = false, fromBoat = false) {
  if (type !== 'boss' && !isWaterType(type)) { x += (Math.random() - 0.5) * 8; y += (Math.random() - 0.5) * 8; }
  burst(x, y, 14, elite ? ['#ffd54a', '#fff'] : ['#b48cff', '#fff'], 120, 0.5);
  if (type === 'worm') {
    const headHp = game.diff ? 4 * (1 + curveRoom(game.wave, game.wingN) * 0.08) * (1 + 0.22 * (game.wingN - 1)) : 4 * (1 + game.wave * 0.08);
    let prev = makeEnemy('worm', x, y, { hp: Math.round(headHp), head: true });
    prev.maxHp = prev.hp;
    for (let i = 0; i < 6; i++) prev = makeEnemy('worm', x, y, { leader: prev });
  } else if (type === 'boss') {
    const hp = game.diff ? game.diff.bossHp : 110 + game.wave * 22;
    const name = pickAuthor(), hue = hashString(name) % 360;
    const e = makeEnemy('boss', x, y, { hp, maxHp: hp, name, atkT: 2, spiral: 0, summonT: 6, mode: 'idle', modeT: 0, tier: game.diff ? game.diff.bossTier : 0,
      cover: `hsl(${hue} 45% 30%)`, spineCol: `hsl(${hue} 50% 16%)`, iris: `hsl(${(hue + 180) % 360} 75% 60%)`,
      glow: `hsla(${hue}, 80%, 60%, 1)`, bar: `hsl(${hue} 65% 55%)` });
    game.boss = e;
    banner(`ROGUE AUTHOR`, e.name);
    if (isStory()) floatText(x, y + 60, `${e.name}: ${wingDef().taunt}`, '#ffe9a8', 13, 2.5);
    sound.play('boss'); sound.setIntensity(2);
    shake(0.7);
  } else if (isWaterType(type)) {
    const e = makeEnemy(type, x, y, { ...(elite ? { elite: true } : {}), ...(type === 'boat' ? { hp: BOAT.hp, maxHp: BOAT.hp } : {}) });
    e.hd = Math.random() * TAU; e.hdT = 0; e.wx = e.x; e.wy = e.y;
    if (type === 'eel') eelInit(e); else boatInit(e);
    if (!codex.seen.has(`enemy:${type}`)) { codex.seen.add(`enemy:${type}`); saveCodex(); }
  } else makeEnemy(type, x, y, { ...(elite ? { elite: true } : {}), ...(fromBoat ? { boat: true } : {}) });
}

// ======================================================================
// Effects helpers
// ======================================================================
function shake(a) { if (settings.motion) game.trauma = Math.min(1, game.trauma + a); }
// Effect budget: big moments (boss, Masterworks, deaths) always show; routine flashes are capped
// so a screen full of perks doesn't drown the player in bloom.
function addLight(x, y, r, life, color = null, big = false) {
  if (!big && flashes.length >= 10) return;
  flashes.push({ x, y, r, life, max: life, color });
}
function floatText(x, y, text, color = '#fff', size = 14, life = 0.8) {
  texts.push({ x: clamp(x, 70, W - 70), y: Math.max(y, (game.boss && PORTRAIT ? 120 : 78) * uiK), text, color, size: size * uiK, life, max: life, vy: -40 });
}
function particle(p) { if (particles.length < 220) particles.push(p); }   // v1.15.0: 320 -> 220 (canvas raster is the late-game cost)
function burst(x, y, n, colors, speed = 160, life = 0.6, shape = 'sq') {
  if (particles.length > 110) n = Math.ceil(n * (particles.length > 170 ? 0.25 : 0.5));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
    particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life,
      size: 2 + Math.random() * 3, color: colors[(Math.random() * colors.length) | 0], drag: 3, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12, shape });
  }
}
function pages(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 60 + Math.random() * 140;
    particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9, max: 0.9, size: 5, color: '#f3ead2', drag: 2.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, shape: 'page' });
  }
}

// ======================================================================
// Update
// ======================================================================
function step(dt) {
  game.time += dt;
  if (game.freeze > 0) { game.freeze -= dt; return; }
  burstBudget.reset();
  if (game.state !== 'dying') game.timeScale = Math.min(1, game.timeScale + dt * 2);
  const sdt = dt * game.timeScale;
  if (game.state === 'playing' || game.state === 'waveclear') game.playTime += dt;
  game.trauma = Math.max(0, game.trauma - dt * 1.5);
  game.flash = Math.max(0, game.flash - dt * 2.5);
  game.bannerT = Math.max(0, game.bannerT - dt);
  if (game.phaseTag) game.phaseTag.t -= dt;
  if (game.bannerT <= 0 && bannerQueue.length) { const [t, sb] = bannerQueue.shift(); banner(t, sb); }

  if (game.state === 'playing') updateSpawning(sdt);
  if (game.state !== 'dying') updatePlayer(sdt);
  updateFlow(dt);
  updateEnemies(sdt);
  updateStatusFx(sdt);
  updateBooks(sdt);
  updateOrbiters(sdt);
  updateCats(sdt);
  updateHazards(sdt);
  updateRings(sdt);
  updatePickups(sdt);
  updateParticles(sdt);

  if (game.comboT > 0) { game.comboT -= sdt; if (game.comboT <= 0) game.combo = 0; }
  game.ammoT += sdt;
  if (game.ammoT > 7) { game.ammoT = 0; game.ammo = pickBook(); }

  if (game.state === 'playing') updateGuide(sdt);
  if (game.state === 'playing' && isSurvive()) { game.surviveT -= sdt; if (game.surviveT <= 0) endSurvive(); }
  else if (game.state === 'playing' && !game.guide && !spawnQueue.length && !telegraphs.length && !enemies.length) waveCleared();
  if (game.state === 'waveclear') { game.clearT -= dt; if (game.clearT <= 0) (game.wingCleared ? showGameOver() : showUpgrades()); }
  if (game.state === 'dying') { game.deathT -= dt; if (game.deathT <= 0) showGameOver(); }
  actions.dash = actions.shhh = false;
}

// ---- Guided first room (v1.13.0): three beats (move, DASH, SHHH), skippable, only on a brand-new player's first story run ----
function playerSaves() {
  const hof = (() => { try { const v = JSON.parse(localStorage.getItem('overdue.halloffame.v1')); return Array.isArray(v) ? v.length : 0; } catch { return 0; } })();
  return { progress, bestScore: loadJSON(BEST_KEY).score || 0, hallCount: hof, seen: tips.seen, codexCount: codex.seen.size + codex.found.size };
}
function startGuideBeat(i) {
  const g = game.guide, b = GUIDE_BEATS[i];
  g.beat = i; g.t = 0; g.used = false; g.waiting = false;
  for (const sp of b.spawns) spawnQueue.push({ type: sp.type, t: game.waveT + sp.dt });
  spawnQueue.sort((a, c) => a.t - c.t);
}
/** Runs every frame in a guided room: starts the next beat when the last was cleared, tunes the beat's enemies, ends the guide. */
function updateGuide(dt) {
  const g = game.guide;
  if (!g || g.done) return;
  g.t += dt;
  if (g.beat >= 0) {
    const b = GUIDE_BEATS[g.beat];
    for (const e of enemies) if (!e.guided) { e.guided = true; e.speed *= b.speed; e.hp = e.maxHp = b.hp; }
    if (g.beat === 1 && player.dashT > 0) g.used = true;
    if (g.beat === 2 && player.shhhT > 0) g.used = true;
  }
  const empty = !spawnQueue.length && !telegraphs.length && !enemies.length;
  if (g.beat < 0) { g.gap -= dt; if (g.gap <= 0) startGuideBeat(0); return; }
  if (!empty) { g.waiting = false; return; }
  if (!g.waiting) { g.waiting = true; g.gap = 1; if (g.beat < GUIDE_BEATS.length - 1) floatText(player.x, player.y - 30, 'Nice!', '#9be7dc', 18, 1); }
  g.gap -= dt;
  if (g.gap > 0) return;
  if (g.beat < GUIDE_BEATS.length - 1) startGuideBeat(g.beat + 1); else endGuide(false);
}
function endGuide(skipped) {
  markTip(GUIDE_FLAG);
  game.guide = null;
  document.body.classList.remove('guiding');
  btnDash.classList.remove('guide-hl'); btnShhh.classList.remove('guide-hl');
  if (skipped) startWave(1);   // Skip: straight into the regular room 1 (the guided one was never "the room")
}

// Balance bot (debug only): when set, the bot's move vector replaces the keyboard/touch stick and the player auto-aims like on touch.
let botInput = null, botDrive = false, debugFreeze = false;
function moveInput() {
  if (botInput) return botInput;
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (pad.connected && (pad.mx || pad.my)) { x = pad.mx; y = pad.my; }
  if (touch.moveId !== null) { x = (touch.mx - touch.mx0) / (45 * uiK); y = (touch.my - touch.my0) / (45 * uiK); }
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

let autoTarget = null;   // sticky auto-aim target (v1.15.3)
let aimVariant = 'all';  // balance measuring only (debug hook): 'today' | 'open' | 'sticky' | 'all'
function nearestEnemy(x, y, maxD = Infinity) {
  let best = null, bd = maxD * maxD;
  for (const e of enemies) {
    if (e.under) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const PLAYER_WALL_R = 9; // player radius vs shelves/walls; enemy hits still use p.r (11)
function updatePlayer(dt) {
  const p = player;
  const mv = moveInput();
  if (mv.x || mv.y) { const l = Math.hypot(mv.x, mv.y); p.lastDx = mv.x / l; p.lastDy = mv.y / l; p.lastMoveT = 0.45; }
  else p.lastMoveT = Math.max(0, (p.lastMoveT || 0) - dt);
  // Aim: gamepad stick > touch aim > auto-aim (touch/gamepad, setting; the bot always) > mouse. See aimSource() in util.js.
  let firing = false;
  const stick = touch.aimId !== null ? aimStick(touch.ax0, touch.ay0, touch.ax, touch.ay, touch.dead) : { deflected: false, angle: 0 };
  if (stick.deflected) touch.aimed = true;
  const src = aimSource({ autoaim: settings.autoaim !== false, bot: !!botInput, touchEnabled: touch.enabled, touchAiming: stick.deflected,
    padConnected: pad.connected, padStick: !!(pad.ax || pad.ay), mouseSeen: mouse.seen });
  if (src === 'pad') { p.aim = Math.atan2(pad.ay, pad.ax); firing = pad.fire; }
  else if (src === 'touch') { p.aim = stick.angle; firing = true; }
  else if (src === 'auto') {
    const vis = (e) => lineOfSight(arena.solid, COLS, ROWS, CELL, p.x, p.y, e.x, e.y);
    const rng = waterHunt ? Infinity : PORTRAIT ? 600 : 460;   // the last eels / boats can be anywhere: no range cap
    const t = aimVariant === 'today' ? nearestEnemy(p.x, p.y, rng) : chooseTarget(p, enemies, rng, vis, aimVariant === 'open' ? null : autoTarget);
    autoTarget = t;
    if (t) {
      const L = aimVariant === 'all' ? leadPoint(t, p, stats.projSpeed) : t;
      p.aim = Math.atan2(L.y - p.y, L.x - p.x); firing = true;
      if (DEBUG) { p.autoAim = { n: (p.autoAim?.n || 0) + 1, ok: (p.autoAim?.ok ?? true) && (vis(t) || !enemies.some(vis)) }; } // QA only
    } else autoTarget = null;
  } else if (src === 'mouse') {
    p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    firing = mouse.down;
  }
  if (pad.fire) firing = true;
  // auto-fire with auto-aim off keeps throwing in the last stick direction, but only once the stick has been deflected this run
  if (settings.autofire && enemies.length && (src !== 'none' || !touch.enabled || touch.aimed)) firing = true;
  if (game.state !== 'playing') firing = false;

  p.inv = Math.max(0, p.inv - dt);
  // Dash charges recharge one at a time (Caffeine Overdose gives 2).
  if (p.dashStock < stats.dashCharges) {
    p.dashCd -= dt;
    if (p.dashCd <= 0) { p.dashStock++; p.dashCd = p.dashStock < stats.dashCharges ? stats.dashCd : 0; abilityReady('dash'); }
  } else p.dashCd = 0;
  const shhhWasCooling = p.shhhT > 0;
  p.shhhT = Math.max(0, p.shhhT - dt);
  if (shhhWasCooling && p.shhhT <= 0) abilityReady('shhh');
  p.rapidT = Math.max(0, p.rapidT - dt);

  if (actions.dash && p.dashStock > 0 && game.state !== 'dying') {
    const l = Math.hypot(mv.x, mv.y);
    if (l) { p.dx = mv.x / l; p.dy = mv.y / l; }
    else if (p.lastMoveT > 0) { p.dx = p.lastDx; p.dy = p.lastDy; } // thumb just lifted to tap DASH
    else if (touch.enabled || pad.connected) {
      // Standing still on touch/gamepad: dash AWAY from the closest threat, never into it.
      const t = nearestEnemy(p.x, p.y);
      const a = t ? Math.atan2(p.y - t.y, p.x - t.x) : p.aim + Math.PI;
      p.dx = Math.cos(a); p.dy = Math.sin(a);
    } else { p.dx = Math.cos(p.aim); p.dy = Math.sin(p.aim); } // mouse: dash where you aim
    p.dashT = 0.17; p.dashHits = new Set();
    p.dashStock--; if (p.dashCd <= 0) p.dashCd = stats.dashCd;
    sound.play('dash');
    burst(p.x, p.y, 8, ['#9be7dc', '#fff'], 90, 0.3);
  }
  if (actions.shhh && game.state === 'playing') doShhh();

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dx * stats.speed * 3.3; p.vy = p.dy * stats.speed * 3.3;
    p.trail.push({ x: p.x, y: p.y, a: p.aim, life: 0.25 });
    if (stats.dashDamage) {
      for (const e of enemies) {
        if (e.dead || p.dashHits.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r + 6) continue;
        p.dashHits.add(e);
        damageEnemy(e, stats.damage * stats.dashDamage, p.dx * 260, p.dy * 260, true, 'dash');
      }
    }
  } else {
    const k = 1 - Math.exp(-dt * 14);
    p.vx = lerp(p.vx, mv.x * stats.speed, k);
    p.vy = lerp(p.vy, mv.y * stats.speed, k);
  }
  const px = p.x, py = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  // Against shelves and walls the player is a little slimmer than against enemies (9 vs 11 px),
  // and slides around a shelf corner they only clip by a few px instead of snagging on it.
  if (p.dashT <= 0) for (const rect of wallRects()) cornerAssist(p, { x: px, y: py }, PLAYER_WALL_R, rect, 8, 3);
  collideWorld(p, PLAYER_WALL_R);
  p.walk += Math.hypot(p.vx, p.vy) * dt * 0.08;
  for (let i = p.trail.length - 1; i >= 0; i--) if ((p.trail[i].life -= dt) <= 0) p.trail.splice(i, 1);

  p.fireT -= dt;
  if (stats.lastChapter && game.state === 'playing') { rl.lcT = (rl.lcT || 0) + dt; if (p.hp <= 1) rl.lcLow = (rl.lcLow || 0) + dt; }
  p.nookOn = stats.nook > 0 && nextToShelf(p);
  p.streak = firing ? p.streak + dt : 0;
  p.inZone = stats.zone && p.streak > 2;
  const rate = stats.fireRate * (stats.cliffhanger && p.hp <= 1 ? 1.5 : 1) * (p.rapidT > 0 ? 2 : 1) * (p.nookOn ? 1 + stats.nook : 1) * (p.inZone ? 2 : 1);
  if (firing && p.fireT <= 0) { p.fireT = 1 / rate; fire(); }
}

// Act II water: walkers treat deep water like a wall (arena.walk / wrects = shelves + water); books, pages and line of sight only see shelves (arena.solid / rects).
const walkGrid = () => arena.walk || arena.solid;
const wallRects = () => arena.wrects || arena.rects;
function collideWorld(o, r) {
  let hit = null;
  for (const rect of wallRects()) {
    const n = pushCircleOutOfRect(o, r, rect);
    if (n) hit = n;
  }
  if (o.x < r) { o.x = r; hit = { nx: 1, ny: 0 }; }
  if (o.x > W - r) { o.x = W - r; hit = { nx: -1, ny: 0 }; }
  if (o.y < r) { o.y = r; hit = { nx: 0, ny: 1 }; }
  if (o.y > H - r) { o.y = H - r; hit = { nx: 0, ny: -1 }; }
  return hit;
}
const MAX_BOOKS = 110;
function spawnBook(x, y, a, extra = {}) {
  // Cap books in flight: bonus books (saga fans, splits, volleys) are skipped first; your own throws
  // replace the oldest book instead, so firing never feels like it stopped working.
  if (books.length >= MAX_BOOKS) {
    if (extra.child || extra.bonus) return;
    books.shift(); rl.evict++;
  }
  rl.thrown++;
  const book = game.ammo || pickBook();
  books.push({ x, y, vx: Math.cos(a) * stats.projSpeed, vy: Math.sin(a) * stats.projSpeed,
    r: 6, life: stats.bookLife, age: 0, hitAny: false, rot: a, dmgMult: 1, scale: 1, spin: (Math.random() < 0.5 ? -1 : 1) * 14, bounces: stats.bounces, pierce: stats.pierce,
    wraps: stats.wraps, child: false, hit: new Set(), color: PLAYER.book, title: book.title,
    look: extra.color || extra.child ? null : currentLook, ...extra });
}

let currentLook = bookLook({});
const MARGIN_SIDE = [Math.PI / 8 * 0.7], MARGIN_WIDE = [Math.PI / 12 * 0.7, Math.PI / 6 * 0.7];   // Margin Notes angles: ±15.75°, then ±10.5° and ±21° (v1.15.3: 30% narrower)
function marginBook(p, a) { spawnBook(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a, { bonus: true, nohome: true, margin: true, pierce: stats.pierce + 1 }); }
const BOOK_GAP = 6; // px between side-by-side Trilogy books (about half a book's width)
function fire() {
  const p = player, n = stats.projectiles;
  currentLook = bookLook(game.owned); // perks change how books look (cheap: a few flags per throw)
  p.throws++;
  if (DEBUG) p.lastThrow = { aim: p.aim }; // QA only
  // Trilogy (v1.16.3): the books of one throw fly side by side, parallel to the aim, in a centred row
  // (perpendicular offset), not fanned out. A book whose offset spot is inside a shelf starts on the centre line.
  const px = -Math.sin(p.aim), py = Math.cos(p.aim);
  for (let i = 0; i < n; i++) {
    const a = p.aim + (Math.random() - 0.5) * 0.04, side = (i - (n - 1) / 2) * BOOK_GAP;
    let x = p.x + Math.cos(a) * 14 + px * side, y = p.y + Math.sin(a) * 14 + py * side;
    if (side && isSolidPx(arena.solid, x, y)) { x = p.x + Math.cos(a) * 14; y = p.y + Math.sin(a) * 14; }
    spawnBook(x, y, a);
  }
  // Margin Notes (v1.15.0): books off at an angle. They never home and are skipped first at the book cap.
  if (stats.marginLvl) {
    const sides = stats.marginLvl >= 3 ? MARGIN_WIDE : MARGIN_SIDE;
    for (const off of sides) { marginBook(p, p.aim + off); marginBook(p, p.aim - off); }
    if (stats.marginLvl >= 2) marginBook(p, p.aim + Math.PI);
  }
  // Compass Rose: every 3rd throw fires 8 ways
  if (stats.compass && p.throws % 3 === 0) for (let k = 0; k < 8; k++) marginBook(p, p.aim + (k * TAU) / 8);
  // Leather-Bound Tome: a giant book every Nth throw
  if (stats.tomeEvery && p.throws % stats.tomeEvery === 0) {
    spawnBook(p.x, p.y, p.aim, { r: 15, scale: 2.4, dmgMult: 5, pierce: 99, bounces: 0, color: PLAYER.tome, tome: true });
    shake(0.15); sound.play('explode');
  }
  // Complete Saga: a fan of 7 every Nth throw
  if (stats.sagaEvery && p.throws % stats.sagaEvery === 0) {
    for (let i = 0; i < 7; i++) spawnBook(p.x, p.y, p.aim + (i - 3) * 0.16, { color: PLAYER.saga, bonus: true });
  }
  sound.play('throw');
}

/** Feedback the moment an ability is usable again. */
function abilityReady(kind) {
  const btn = kind === 'dash' ? btnDash : btnShhh;
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  if (kind === 'shhh' && game.state === 'playing') {
    sound.play('ready');
    buzz(15);
    rings.push({ x: player.x, y: player.y, r: player.r + 4, max: player.r + 30, speed: 90, friendly: true, life: 1, color: '180,140,255' });
  }
}

/** Spine Breaker / Annotated Edition / Collapsing Stacks: damage everything in a radius. */
function inkBurst(x, y, radius, dmg, color = '#e8d9b0', src = 'burst') {
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius + e.r) damageEnemy(e, dmg, ((e.x - x) / (d || 1)) * 120, ((e.y - y) / (d || 1)) * 120, false, src);
  }
  // Visual budget (v1.15.0): a crowd of shelf bursts (Margin Notes, Crossfire, Demolition) keeps its damage but stops adding rings,
  // pages and lights once 12 rings are already on screen. Each ring is a big canvas draw, a light and a stroke.
  burst(x, y, 7, [color, '#3a2a1a'], 140, 0.35);
  if (rings.length < 12) {
    pages(x, y, 3);
    rings.push({ x, y, r: 4, max: radius, speed: radius * 6, friendly: true, life: 1, faint: true, color: '255,184,107' });
    addLight(x, y, radius * 1.2, 0.18, color);
  }
  sound.play('hit', 0.7);
}

// ======================================================================
// Status effects (v1.15.0 part A: ink, chill, static, pops). The maths lives in src/status.js.
// Chain rule: damage with source ink / zap / pop never starts more ink, zaps or pops (the source travels with the damage).
// ======================================================================
const burstBudget = makeBurstBudget();   // at most 6 pops / splashes per frame; extras are dropped
let sm = makeMetrics();                  // per-second counters (balance bot reads them)
const zaps = [];                         // pool: at most ZAP_POOL short polylines
let popGen = 0;                          // while a pop's damage runs: 1 + that pop's generation
let popBudget = 0, popChain = 0;         // one pop chain (a pop + its Grand Finale round) hurts at most POP_CHAIN_HITS enemies
const hitsPerSec = () => stats.fireRate * stats.projectiles;

function zapArc(from, targets) {
  const pts = [from.x, from.y];
  for (const t of targets) {   // jagged: one random kink per segment, built once
    const x0 = pts[pts.length - 2], y0 = pts[pts.length - 1], mx = (x0 + t.x) / 2, my = (y0 + t.y) / 2, k = (Math.random() - 0.5) * 18;
    const d = Math.hypot(t.x - x0, t.y - y0) || 1;
    pts.push(mx - ((t.y - y0) / d) * k, my + ((t.x - x0) / d) * k, t.x, t.y);
  }
  if (zaps.length >= ZAP_POOL) zaps.shift();
  zaps.push({ pts, life: ZAP_LIFE });
}

/** A thrown book (or orbit book) hit `e`: maybe ink, chill, Deep Freeze and a zap. Status damage never calls this. */
function onBookHit(e, base, src) {
  if (!canProc(src)) return;
  if (!e.dead) {
    if (stats.ink) applyInk(e, base, stats.ink, stats.inkDur, 0);
    if (stats.chill) {
      if (stats.deepFreeze && e.chillT > 0 && deepFreezeHit(e) && freeze(e, DEEP_FREEZE_TIME, game.time)) burst(e.x, e.y, 6, [PLAYER.chill, '#fff'], 90, 0.3);
      applyChill(e, stats.chill);
    }
  }
  if (stats.staticChance && Math.random() < procChance(stats.staticChance, hitsPerSec())) doZap(e, base);
}

function doZap(from, base) {
  const targets = zapChain(from, enemies, 1 + stats.staticJumps, ZAP_REACH, stats.conductive ? (t) => t.inkT > 0 : null);
  if (!targets.length) return;
  zapArc(from, targets);
  for (const t of targets) {
    t.staticT = 0.25;
    damageEnemy(t, base * stats.staticDmg, 0, 0, false, 'zap');
    if (t.dead) continue;
    if (stats.conductive && stats.ink) applyInk(t, base, stats.ink * SPLASH_STRENGTH, stats.inkDur, 1);   // Conductive Ink: zaps spread (weaker) ink
    if (stats.superconductor && t.chillT > 0) freeze(t, SUPER_FREEZE_TIME, game.time);
  }
  sound.play('ping', 0.35);
}

/** Pop-up Book: a defeated enemy pops. gen 0 = a normal pop, 1 = a Grand Finale pop (pops no further). */
function popAt(x, y, gen) {
  if (!burstBudget.take()) return;
  sm.bursts++; sm.burstsThisSec++;
  const r = stats.popRadius, dmg = stats.damage * stats.popMult, prev = popGen;
  if (gen === 0) { popBudget = POP_CHAIN_HITS; popChain = 0; }
  popGen = gen + 1;
  const n = enemies.length;   // coins a golem drops mid-pop are not hit by the same pop
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d >= r + e.r) continue;
    if (popBudget <= 0) break;
    popBudget--;
    damageEnemy(e, dmg, ((e.x - x) / (d || 1)) * 90, ((e.y - y) / (d || 1)) * 90, false, 'pop');
    if (e.dead) popChain++;
    if (stats.inkBombs && stats.ink && !e.dead) applyInk(e, dmg, stats.ink, stats.inkDur, 1);   // Ink Bombs: pops spread ink
  }
  popGen = prev;
  if (gen === 0 && popChain > sm.maxPopChain) sm.maxPopChain = popChain;   // metric: most kills from one pop chain
  burst(x, y, 6, [PLAYER.pop, '#ffffff'], 120, 0.35);
  rings.push({ x, y, r: 4, max: r, speed: r * 7, friendly: true, life: 1, faint: true, color: '155,231,220' });
  addLight(x, y, r * 1.1, 0.14, PLAYER.pop);
  if (game.time - (game.lastPopSound || -1) > 0.06) { game.lastPopSound = game.time; sound.play('ping', 0.5); }
}

/** Indelible: an inked enemy that dies splashes half-strength ink on everything nearby (which never splashes again). */
function inkSplash(e) {
  if (!burstBudget.take()) return;
  sm.bursts++; sm.burstsThisSec++;
  const total = e.inkDps * stats.inkDur;
  for (const t of enemies) {
    if (t.dead || t === e) continue;
    if (Math.hypot(t.x - e.x, t.y - e.y) < SPLASH_RADIUS + t.r) applyInk(t, total, SPLASH_STRENGTH, stats.inkDur, 1);
  }
  burst(e.x, e.y, 7, [PLAYER.ink, PLAYER.inkRim], 130, 0.4);
  rings.push({ x: e.x, y: e.y, r: 4, max: SPLASH_RADIUS, speed: SPLASH_RADIUS * 6, friendly: true, life: 1, faint: true, color: '154,107,255' });
}

/** Per-enemy status tick (called from updateEnemies only for enemies that have a status). */
function tickStatus(e, dt) {
  const due = tickInk(e, dt);
  if (due > 0) damageEnemy(e, due, 0, 0, false, 'ink');
  if (e.chillT > 0) { e.chillT -= dt; if (e.chillT <= 0) e.chillHits = 0; }
  if (e.staticT > 0) e.staticT -= dt;
  if (e.frozenT > 0) e.frozenT -= dt;
  if (!e.dead && stats.brittle && shouldShatter(e)) {   // Brittle Pages
    burst(e.x, e.y, 8, [PLAYER.chill, PLAYER.inkRim, '#fff'], 150, 0.4);
    damageEnemy(e, e.hp, 0, 0, false, 'ink');
  }
}

function updateStatusFx(dt) {
  for (let i = zaps.length - 1; i >= 0; i--) if ((zaps[i].life -= dt) <= 0) zaps.splice(i, 1);
  if (game.state === 'playing') tickMetrics(sm, dt);
}

const statusSprites = {};
/** One cached 32x32 sprite per status (built once, like glowSprite), drawn small beside the enemy. No shadowBlur. */
function statusSprite(kind) {
  if (statusSprites[kind]) return statusSprites[kind];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.translate(16, 16); g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'ink') {   // violet drop with a light rim
    g.beginPath(); g.moveTo(0, -13); g.bezierCurveTo(10, -1, 11, 4, 11, 6); g.arc(0, 6, 11, 0, Math.PI); g.bezierCurveTo(-11, 4, -10, -1, 0, -13); g.closePath();
    g.fillStyle = PLAYER.ink; g.fill(); g.lineWidth = 2.5; g.strokeStyle = PLAYER.inkRim; g.stroke();
  } else if (kind === 'chill') {   // snowflake
    g.strokeStyle = PLAYER.chill; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * 13, Math.sin(a) * 13); g.lineTo(-Math.cos(a) * 13, -Math.sin(a) * 13); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -13); g.lineTo(0, 13); g.stroke();
  } else {   // static: a lime spark
    g.beginPath(); g.moveTo(3, -14); g.lineTo(-7, 2); g.lineTo(0, 2); g.lineTo(-4, 14); g.lineTo(8, -4); g.lineTo(1, -4); g.closePath();
    g.fillStyle = PLAYER.static; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#4a5a10'; g.stroke();
  }
  return (statusSprites[kind] = c);
}
/** Status marks beside an enemy: a faint cold tint on the body, plus one small sprite per active status. */
function drawStatus(e) {
  if (e.chillT > 0 || e.frozenT > 0) {
    ctx.globalAlpha = e.frozenT > 0 ? 0.4 : 0.16; ctx.fillStyle = PLAYER.chill;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.95, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  const kinds = [];
  if (e.inkT > 0) kinds.push('ink');
  if (e.chillT > 0 || e.frozenT > 0) kinds.push('chill');
  if (e.staticT > 0) kinds.push('static');
  if (!kinds.length) return;
  const sz = e.type === 'boss' ? 26 : 18, x0 = e.x - (kinds.length * sz) / 2, y0 = e.y - e.r - sz - 2;
  for (let i = 0; i < kinds.length; i++) ctx.drawImage(statusSprite(kinds[i]), x0 + i * sz, y0, sz, sz);
}
function drawZaps() {
  if (!zaps.length) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const z of zaps) {
    ctx.globalAlpha = clamp(z.life / ZAP_LIFE, 0, 1);
    ctx.beginPath(); ctx.moveTo(z.pts[0], z.pts[1]);
    for (let i = 2; i < z.pts.length; i += 2) ctx.lineTo(z.pts[i], z.pts[i + 1]);
    ctx.strokeStyle = PLAYER.static; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Reading Nook: is a shelf (not the outer wall) within reach of the player? */
function nextToShelf(p) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, x = p.x + Math.cos(a) * (p.r + 16), y = p.y + Math.sin(a) * (p.r + 16);
    if (x > 0 && y > 0 && x < W && y < H && isSolidPx(arena.solid, x, y)) return true;
  }
  return false;
}

function doShhh() {
  const p = player;
  if (p.shhhT > 0) return;
  p.shhhT = stats.shhhCd;
  const R = stats.shhhRadius;
  rings.push({ x: p.x, y: p.y, r: 8, max: R, speed: 700, friendly: true, life: 1 });
  for (const e of enemies) {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d < R + e.r) {
      const kb = e.type === 'boss' ? 60 : 420;
      e.vx += (dx / d) * kb; e.vy += (dy / d) * kb;
      e.stun = (e.type === 'boss' ? 0.4 : 1.5) * stats.shhhStun;
      damageEnemy(e, 1, 0, 0, false, 'shhh');
    }
  }
  if (stats.shhhGlobal) {
    for (const e of enemies) e.stun = Math.max(e.stun, e.type === 'boss' ? 1 : 2.5);
    addLight(W / 2, H / 2, Math.max(W, H), 0.6, '#b48cff');
    banner('ABSOLUTE SILENCE', '');
    game.bannerT = 1.2;
  }
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (Math.hypot(h.x - p.x, h.y - p.y) < R) { burst(h.x, h.y, 4, ['#ff6b6b', '#fff'], 80, 0.3); hazards.splice(i, 1); }
  }
  if (stats.shhhVolley) {
    for (let k = 0; k < stats.shhhVolley; k++) {
      const a = (k / stats.shhhVolley) * TAU + game.time;
      spawnBook(p.x, p.y, a, { pierce: stats.pierce + 2, color: PLAYER.volley, bonus: true });
    }
  }
  floatText(p.x, p.y - 26, 'SHHH!', '#9be7dc', 22, 1);
  sound.play('shhh');
  shake(0.35);
  addLight(p.x, p.y, R * 1.4, 0.5, '#9be7dc');
}

function updateFlow(dt) {
  flowT -= dt;
  const [cx, cy] = cellOf(player.x, player.y);
  const c = idx(cx, cy);
  if (c !== flowCell || flowT <= 0 || !flow) {
    flow = computeFlowField(walkGrid(), COLS, ROWS, cx, cy);
    flowCell = c; flowT = 0.5;
  }
}

/** Direction toward the player: straight line if visible, otherwise follow the flow field. */
function seek(e) {
  const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
  // v1.16.1: walkers only "see" the player across ground they can walk (water blocks them, shelves too); before, an enemy across a pond
  // headed straight for the player, bumped into the water and stood at the shore forever (Act II islands rooms never cleared).
  if (lineOfSight(walkGrid(), COLS, ROWS, CELL, e.x, e.y, player.x, player.y)) return { x: dx / d, y: dy / d, d };
  const [cx, cy] = cellOf(e.x, e.y);
  const i = idx(cx, cy);
  const fx = flow.dirX[i], fy = flow.dirY[i];
  if (!fx && !fy) return { x: dx / d, y: dy / d, d };
  // Aim at the centre of the next cell to avoid scraping shelf corners.
  const tx = (cx + fx + 0.5) * CELL - e.x, ty = (cy + fy + 0.5) * CELL - e.y, tl = Math.hypot(tx, ty) || 1;
  return { x: tx / tl, y: ty / tl, d };
}

/** Water enemies wander toward the player (+ jitter); when a step is refused (shore) they turn away. `jit` = how wild the wander is (rad). */
function waterHeading(e, dt, tx, ty, jit) {
  if (e.blk) { e.blk = false; e.hd += (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()); e.hdT = 0.45; }
  else e.hdT -= dt;
  if (e.hdT <= 0) { e.hd = Math.atan2(ty - e.y, tx - e.x) + (Math.random() - 0.5) * jit; e.hdT = 0.7 + Math.random() * 0.5; }
}
/** Paper Boat: drop an Overdue Notice (telegraphed, 0.85 s) on the walkway cell nearest to the boat. */
function boatDrop(e) {
  if (game.state !== 'playing' || enemies.length > 40) return;
  const live = enemies.filter((n) => n.boat && !n.dead).length + telegraphs.filter((t) => t.boat).length;
  if (live >= BOAT.maxNotices) return;
  const c = nearestWalkway(walkGrid(), COLS, ROWS, CELL, e.x, e.y);
  if (!c) return;
  telegraphs.push({ type: 'notice', x: c.x, y: c.y, t: 0, dur: 0.85, elite: false, boat: true });
  e.dropFlash = 0.35;
  sound.play('spawn');
}

/** Hunt (v1.16.0 fix): when only water enemies are left they come to you. One flow field per pond, aimed at the pond cell nearest the player. */
let waterHunt = false, huntT = 0;
const ponds = { arena: null, labels: null, count: 0, fields: [], notWater: null };
function huntDir(e) {
  if (ponds.arena !== arena) { const l = labelPonds(arena.water, COLS, ROWS); ponds.arena = arena; ponds.labels = l.labels; ponds.count = l.count; ponds.fields = []; ponds.notWater = Uint8Array.from(arena.water, (v) => (v ? 0 : 1)); }
  const [ex, ey] = cellOf(e.x, e.y), pond = ponds.labels[ey * COLS + ex];
  if (pond < 0) return null;
  const [pcx, pcy] = cellOf(player.x, player.y);
  let f = ponds.fields[pond];
  if (!f || game.time - f.t > 0.5) {
    // the spot to wait at: the nearest cell of this pond with a clear line to the player (so the surfaced eel can be hit); any nearest cell if none
    const see = (cx, cy) => lineOfSight(arena.solid, COLS, ROWS, CELL, (cx + 0.5) * CELL, (cy + 0.5) * CELL, player.x, player.y);
    const c = nearestInPond(ponds.labels, pond, COLS, ROWS, CELL, player.x, player.y, see) || nearestInPond(ponds.labels, pond, COLS, ROWS, CELL, player.x, player.y);
    f = ponds.fields[pond] = { pc: pcy * COLS + pcx, t: game.time, c, flow: c ? computeFlowField(ponds.notWater, COLS, ROWS, c[0], c[1]) : null };
  }
  if (!f.flow) return null;
  const i = ey * COLS + ex, fx = f.flow.dirX[i], fy = f.flow.dirY[i];
  if (!fx && !fy) return { a: e.hd, stay: true };   // already at the nearest spot: stay put there (surfaces in place), don't wander away
  return { a: Math.atan2(fy, fx) };
}

function updateEnemies(dt) {
  const p = player;
  waterHunt = game.state === 'playing' && huntActive(enemies, spawnQueue.length + telegraphs.filter((t) => !t.boat).length);
  huntT = waterHunt ? huntT + dt : 0;
  if (huntT > HUNT.giveUp) {   // safety net: stragglers nobody can reach sink ("the water drains"), so a room can never stall
    for (const e of enemies) if (isWaterType(e.type) && !e.dead) { e.dead = true; burst(e.x, e.y, 14, ['#9ad8e0', '#fff'], 100, 0.6); floatText(e.x, e.y - 14, 'Sunk', '#bfeaf0', 13, 1); }
    huntT = 0;
  }
  for (const e of enemies) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.orbitHit = Math.max(0, e.orbitHit - dt);
    if (e.inkT > 0 || e.chillT > 0 || e.staticT > 0 || e.frozenT > 0) { tickStatus(e, dt); if (e.dead) continue; }
    if (e.elite || e.type === 'boss') { const bossy = e.type === 'boss'; if (bossy) sm.bossSec += dt; else sm.eliteSec += dt; if (e.frozenT > 0) { if (bossy) sm.bossFrozenSec += dt; else sm.eliteFrozenSec += dt; } }
    // Knockback decays
    const kd = Math.exp(-dt * 6);
    e.vx *= kd; e.vy *= kd;
    let mx = 0, my = 0;
    if (e.stun > 0) { e.stun -= dt; }
    else if (game.state === 'dying') { /* freeze AI */ }
    else switch (e.type) {
      case 'bunny': {
        const s = seek(e); const hop = 0.55 + 0.75 * Math.abs(Math.sin(e.t * 7));
        mx = s.x * e.speed * hop; my = s.y * e.speed * hop; break;
      }
      case 'notice': {
        const s = seek(e); const w = Math.sin(e.t * 6) * 0.9;
        mx = (s.x - s.y * w) * e.speed; my = (s.y + s.x * w) * e.speed; break;
      }
      case 'coin': { const s = seek(e); mx = s.x * e.speed; my = s.y * e.speed; break; }
      case 'golem': { const s = seek(e); mx = s.x * e.speed; my = s.y * e.speed; break; }
      case 'patron': {
        const s = seek(e);
        const dir = s.d < 190 ? -1 : s.d > 260 ? 1 : 0;
        const strafe = Math.sin(e.t * 0.8) > 0 ? 1 : -1;
        mx = (s.x * dir - s.y * strafe * 0.6) * e.speed; my = (s.y * dir + s.x * strafe * 0.6) * e.speed;
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.atkT = Math.max(1.6, 3 - (game.diff ? curveRoom(game.wave, game.wingN) : game.wave) * 0.06);
          rings.push({ x: e.x, y: e.y, r: e.r, max: 157, speed: 140, width: 12, life: 1 });
          sound.play('ring');
        }
        break;
      }
      case 'worm': {
        if (e.leader && !e.leader.dead) {
          const L = e.leader, dx = e.x - L.x, dy = e.y - L.y, d = Math.hypot(dx, dy) || 1;
          const gap = 15 * (e.vs || 1); if (d > gap) { e.x = L.x + (dx / d) * gap; e.y = L.y + (dy / d) * gap; }
        } else {
          if (e.leader) { e.leader = null; e.head = true; }
          const s = seek(e); const w = Math.sin(e.t * 5) * 0.5;
          mx = (s.x - s.y * w) * e.speed; my = (s.y + s.x * w) * e.speed;
        }
        break;
      }
      case 'eel': {
        const hd = waterHunt && huntDir(e);   // last water enemies: swim to the part of their pond nearest to you, and don't surface from far away
        if (hd && !hd.stay && e.ph === 'under' && Math.hypot(p.x - e.x, p.y - e.y) > HUNT.surfaceRange) e.phT = Math.max(e.phT, 0.2);
        // Under water it swims toward you (staying on water); then rises (ripple + fin: the tell), spits a 3-page fan, dives. It can only be hit while it is up.
        const st = eelStep(e, dt, Math.random, waterHunt);
        if (st.fire && game.state === 'playing') { const a = Math.atan2(p.y - e.y, p.x - e.x); hazPat = 'page:eel'; fan(e.x, e.y, a, EEL.fanPages, EEL.fanSpread, EEL.pageSpeed); }
        const sp = e.ph === 'under' ? e.speed : e.ph === 'dive' ? e.speed * 0.25 : e.speed * 0.15;
        if (hd) { e.hd = hd.a; e.hdT = 0.3; } else waterHeading(e, dt, p.x, p.y, 1.2);
        const hk = hd ? (hd.stay ? 0 : e.ph === 'under' ? 1.4 : 1) : 1;
        mx = Math.cos(e.hd) * sp * hk; my = Math.sin(e.hd) * sp * hk; break;
      }
      case 'boat': {
        // Drifts slowly along the water and drops an Overdue Notice on the nearest walkway about every 4 s (never more than BOAT.maxNotices alive).
        const st = boatStep(e, dt);
        if (st.drop) boatDrop(e);
        const hd = waterHunt && huntDir(e);
        if (hd) { e.hd = hd.a; e.hdT = 0.3; } else waterHeading(e, dt, p.x, p.y, 2.2);
        const bk = hd ? (hd.stay ? 0 : 1.8) : 1;
        mx = Math.cos(e.hd) * e.speed * bk; my = Math.sin(e.hd) * e.speed * bk; break;
      }
      case 'boss': bossAI(e, dt); break;
    }
    if (e.chillT > 0) { const f = chillFactor(e); mx *= f; my *= f; }   // Cold Storage (bosses get half the slow)
    // Elites return fire: an aimed page (a 3-page fan from wing 7) when they can see you.
    if (e.elite && e.stun <= 0 && !e.under && game.state === 'playing') {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = (game.diff ? game.diff.eliteShootEvery : 3) * (0.8 + Math.random() * 0.4);
        if (lineOfSight(arena.solid, COLS, ROWS, CELL, e.x, e.y, p.x, p.y)) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          hazPat = 'page:elite';
          if (game.diff && game.diff.bossTier >= 2) fan(e.x, e.y, a, 3, 0.2, 150); else { shootHazard(e.x, e.y, a, 150); sound.play('shoot'); }
        }
      }
    }
    if (isWaterType(e.type)) {   // water enemies only ever move into water cells
      const r = moveInWater(arena.water, COLS, ROWS, CELL, e.x, e.y, (mx + e.vx) * dt, (my + e.vy) * dt, e.r * 0.6);
      e.x = r.x; e.y = r.y; if (r.blocked) e.blk = true;
    } else if (e.type !== 'boss' || e.mode !== 'charge') { e.x += (mx + e.vx) * dt; e.y += (my + e.vy) * dt; }
  }
  // Separation (cheap O(n²); n stays < ~100) + world collision
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (a.type === 'worm' && b.type === 'worm') continue;
      if (a.ghostT > 0 || b.ghostT > 0) continue;   // v1.16.2 stuck recovery: a walker that made no progress passes through others for a moment
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d;
        const wa = a.type === 'boss' ? 0 : 1, wb = b.type === 'boss' ? 0 : 1;
        a.x -= nx * push * wa * (wb ? 1 : 2); a.y -= ny * push * wa * (wb ? 1 : 2);
        b.x += nx * push * wb * (wa ? 1 : 2); b.y += ny * push * wb * (wa ? 1 : 2);
      }
    }
  }
  for (const e of enemies) {
    if (e.type === 'boss') { e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r); }
    else if (isWaterType(e.type)) {   // separation may nudge them: if that left the water, go back to the last good spot
      if (discInWater(arena.water, COLS, ROWS, CELL, e.x, e.y, e.r * 0.6)) { e.wx = e.x; e.wy = e.y; } else { e.x = e.wx; e.y = e.wy; }
    }
    else if (!(e.type === 'worm' && e.leader)) collideWorld(e, isStory() ? wallRadius(e.r, CELL) : e.r);   // v1.16.2: story only, Endless stays as it was
    // observed velocity (smoothed) for auto-aim lead; capped so teleports/boss charges stay sane
    if (e.lx !== undefined && dt > 0) { const k = 0.4; e.pvx = clamp((e.pvx || 0) * (1 - k) + ((e.x - e.lx) / dt) * k, -450, 450); e.pvy = clamp((e.pvy || 0) * (1 - k) + ((e.y - e.ly) / dt) * k, -450, 450); }
    e.lx = e.x; e.ly = e.y;
    // v1.16.2 stuck recovery (story only; Endless stays as it was): big walkers jam head-on in 2-cell gaps (separation cancels each pair's forward step
    // and nobody moves). A walker that moved < 10 px in a second while it could walk passes through other enemies for the next second.
    if (isStory() && e.type !== 'boss' && !isWaterType(e.type) && !(e.type === 'worm' && e.leader)) {
      e.ghostT = Math.max(0, (e.ghostT || 0) - dt); e.sT = (e.sT || 0) + dt;
      if (e.sT >= 1) {
        if (e.sx !== undefined && e.stun <= 0 && game.state === 'playing' && Math.hypot(e.x - e.sx, e.y - e.sy) < 10) e.ghostT = 1;
        e.sx = e.x; e.sy = e.y; e.sT = 0;
      }
    }
    // Contact damage
    if (game.state === 'playing' || game.state === 'waveclear') {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (d < p.r + e.r - 3 && !(e.trans > 0) && !e.under) hurtPlayer(e.x, e.y, e.type === 'boss' && e.mode === 'charge' ? 'boss:charge' : e.type, !!e.elite);
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
}

function bossAI(e, dt) {
  const p = player;
  const frac = e.hp / e.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (phase !== e.phase) {
    if (e.phase) {
      // Phase change: the player keeps full control. The boss transforms for BOSS_TRANS seconds (no attacks, no contact damage, can't be hit);
      // the PHASE label is a small non-blocking tag, not the big screen-centre banner.
      e.trans = BOSS_TRANS; e.mode = 'idle'; e.modeT = 0; e.atkT = Math.max(e.atkT, 0.6);
      game.phaseTag = { text: `PHASE ${phase}`, t: 1.1 };
      shake(0.2); sound.play('boss');
    }
    e.phase = phase;
  }
  if (e.trans > 0) { e.trans = Math.max(0, e.trans - dt); return; }
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const aim = Math.atan2(dy, dx);
  e.modeT -= dt;
  if (e.mode === 'windup') {
    e.x += (Math.random() - 0.5) * 3; e.y += (Math.random() - 0.5) * 3;
    if (e.modeT <= 0) { e.mode = 'charge'; e.modeT = 0.75; e.cdx = Math.cos(e.cAim); e.cdy = Math.sin(e.cAim); sound.play('dash'); }
    return;
  }
  if (e.mode === 'charge') {
    e.x += e.cdx * 430 * dt; e.y += e.cdy * 430 * dt;
    particle({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 14, color: '#6c3cff', drag: 0, rot: 0, vr: 0, shape: 'circ' });
    const hitWall = e.x < e.r || e.x > W - e.r || e.y < e.r || e.y > H - e.r;
    if (hitWall || e.modeT <= 0) {
      e.mode = 'idle'; e.modeT = 0;
      e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
      if (hitWall) { shake(0.6); sound.play('explode'); hazPat = 'page:charge'; radial(e.x, e.y, 14, 170, 0); }
    }
    return;
  }
  // Drift to keep a menacing distance
  const want = d > 220 ? 1 : d < 150 ? -1 : 0;
  e.x += ((dx / d) * want * e.speed + Math.cos(e.t * 0.7) * 30) * dt;
  e.y += ((dy / d) * want * e.speed + Math.sin(e.t * 0.9) * 20) * dt;
  e.atkT -= dt;
  // Story bosses learn a pattern every 3 wings (tier 0..3): wider fans, more spiral arms, elite summons.
  const tier = e.tier || 0;
  if (phase === 1 && e.atkT <= 0) { e.atkT = 1.25; hazPat = 'page:fan'; fan(e.x, e.y, aim, tier >= 1 ? 7 : 5, 0.22, 210); }
  if (phase === 2) {
    e.spiral += dt * 2.3;
    const arms = tier >= 2 ? [0, TAU / 3, (2 * TAU) / 3] : [0, Math.PI];
    if (e.atkT <= 0) { e.atkT = tier >= 2 ? 0.17 : 0.14; hazPat = 'page:spiral'; for (const o of arms) shootHazard(e.x, e.y, e.spiral + o, 165); }
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = 7;
      for (let i = 0; i < 3; i++) telegraphs.push({ type: tier >= 3 ? 'notice' : 'bunny', ...spawnPoint(), t: 0, dur: 0.85, elite: tier >= 3 && i === 0 });
    }
  }
  if (phase === 3) {
    if (e.atkT <= 0) {
      if (Math.random() < 0.5) { e.mode = 'windup'; e.modeT = 0.6; e.cAim = aim; e.atkT = tier >= 1 ? 1.9 : 2.2; }
      else { e.atkT = 1.4; hazPat = 'page:radial'; radial(e.x, e.y, tier >= 1 ? 22 : 18, 190, e.t); fan(e.x, e.y, aim, tier >= 2 ? 5 : 3, 0.15, 260); }
    }
  }
}
const BOSS_TRANS = 1.0;   // seconds the boss is busy (and immune) at a phase change
const MAX_HAZARDS = 260;
function shootHazard(x, y, a, s) {
  if (hazards.length >= MAX_HAZARDS) return;
  s *= game.diff ? game.diff.hazardSpeed : 1; // story: pages fly faster in later rooms and wings
  hazards.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 5, life: 6, rot: a, pat: hazPat, orb: false });
}
function fan(x, y, a, n, spread, s) { for (let i = 0; i < n; i++) shootHazard(x, y, a + (i - (n - 1) / 2) * spread, s); sound.play('shoot'); }
function radial(x, y, n, s, off) { for (let i = 0; i < n; i++) shootHazard(x, y, off + (i / n) * TAU, s); sound.play('shoot'); }

/** Small 'immune' cue (rate-limited) while the boss transforms. */
function bossImmune(e) {
  if (game.time - (e.immuneCue || -1) < 0.3) return;
  e.immuneCue = game.time; floatText(e.x, e.y - e.r - 6, 'IMMUNE', '#cfc4ff', 13, 0.5);
}
function damageEnemy(e, dmg, kx, ky, crit, src = 'other') {
  if (e.dead) return;
  if (e.under) return;   // a submerged Ink Eel can't be hurt by anything (books, orbit, cat, ink, SHHH)
  if (e.trans > 0) { bossImmune(e); return; }   // boss is mid-transformation
  const quiet = isStatusSource(src);   // ink / zap / pop damage is silent and never chains
  if (e.type === 'boss') dmg *= statusDamageMult(e, stats.brittle);   // chilled bosses take +25%
  addDealt(rl, src, dmg < e.hp ? dmg : e.hp);   // effective damage: overkill is not counted
  e.hp -= dmg;
  e.flash = 0.09;
  const kbScale = e.type === 'boss' ? 0.05 : e.type === 'golem' ? 0.3 : 1;
  e.vx += kx * kbScale; e.vy += ky * kbScale;
  const shown = Number.isInteger(dmg) ? dmg : dmg.toFixed(1);
  // Damage numbers: crits and boss hits always; routine hits only while the screen is calm.
  // Rapid hits on one target merge into a single climbing number instead of a smear.
  const prev = e.dmgText;
  if (prev && prev.life > prev.max - 0.25 && texts.includes(prev)) {
    prev.sum += dmg; prev.crit = prev.crit || crit;
    const tot = Number.isInteger(prev.sum) ? prev.sum : prev.sum.toFixed(1);
    prev.text = `${tot}`; prev.life = prev.max; prev.x = clamp(e.x, 70, W - 70);
    if (crit) { prev.color = '#ffd54a'; prev.size = 18 * uiK; }
  } else if (crit || e.type === 'boss' || texts.length < 8) {
    floatText(e.x + (Math.random() - 0.5) * 10, e.y - e.r, `${shown}`, crit ? '#ffd54a' : src === 'ink' ? PLAYER.inkRim : src === 'zap' ? PLAYER.static : src === 'pop' ? PLAYER.pop : '#e8e0cc', crit ? 18 : 11, crit ? 0.7 : 0.5);
    e.dmgText = texts[texts.length - 1]; e.dmgText.sum = dmg; e.dmgText.crit = crit;
  }
  if (!quiet) sound.play(crit ? 'crit' : 'hit', e.type === 'boss' ? 0.6 : 1);
  // Hit-stop on the boss sells impact, but chained on every hit it slowed late fights to ~0.4x speed.
  // Budget: only crits / big hits, and at most one micro-freeze per 0.3s of game time.
  if (e.type === 'boss' && (crit || dmg >= stats.damage * 3) && game.time - (game.lastBossStop || -1) > 0.3) {
    game.lastBossStop = game.time;
    game.freeze = Math.max(game.freeze, 0.012);
  }
  if (e.hp <= 0) killEnemy(e, src);
}

function killEnemy(e, src = 'other') {
  e.dead = true;
  sm.kills++; if (isStatusSource(src)) { sm.statusKillsSec++; if (src === 'ink') sm.inkKills++; }
  if (e.type === 'boss') rl.bossKills.push(Math.round(game.waveT * 10) / 10);   // run log: seconds from room start to boss kill
  game.kills++;
  game.combo++;
  game.comboT = 2.5;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const gained = Math.round(e.score * comboMult() * stats.scoreMult);
  game.score += gained;
  const burstColors = e.type === 'boss' ? ['#6c3cff', '#b48cff', '#fff'] : BURST[e.type];
  burst(e.x, e.y, e.type === 'boss' ? 90 : 16, burstColors, e.type === 'boss' ? 360 : 170, e.type === 'boss' ? 1.4 : 0.6);
  pages(e.x, e.y, e.type === 'boss' ? 40 : 3);
  addLight(e.x, e.y, e.r * 5, 0.35, burstColors[0]);
  sound.play('kill', 1 + Math.min(game.combo, 20) * 0.03);
  if (game.combo > 0 && game.combo % 10 === 0) floatText(player.x, player.y - 34, `${game.combo} COMBO!`, '#ffd54a', 18, 1.1);
  // Pop-up Book / Indelible: only kills NOT caused by ink, zaps or pops start them (one Grand Finale round: popGen 1 -> one more pop)
  if (stats.popRadius && (!isStatusSource(src) || (src === 'pop' && stats.finale && popGen === 1))) popAt(e.x, e.y, src === 'pop' ? 1 : 0);
  if (stats.indelible && e.inkT > 0 && e.inkGen === 0 && !isStatusSource(src)) inkSplash(e);
  if (e.type === 'coin') { game.fines += 1; floatText(e.x, e.y - 12, '+1 🪙', '#ffd54a', 12, 0.7); }
  // From wing 4, elites burst into a ring of pages as they go down: don't stand on them.
  if (e.elite && game.diff && game.diff.deathBurst && game.state === 'playing') { hazPat = 'page:elite-burst'; radial(e.x, e.y, game.diff.deathBurst, 120, Math.random() * TAU); }
  if (e.type === 'golem') {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; const c = makeEnemy('coin', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14); c.vx = Math.cos(a) * 200; c.vy = Math.sin(a) * 200; }
    shake(0.3);
  }
  if (e.type === 'boss') {
    game.boss = null;
    game.timeScale = 0.2; game.freeze = 0.15;
    shake(1); game.flash = 0.6;
    sound.play('explode'); sound.setIntensity(1);
    hazards.length = 0;
    if (isStory()) banner('AUTHOR DEFEATED', `${e.name} has been… shelved.`);
    else { banner('AUTHOR DEFEATED', `${e.name} has been… shelved. +1 Renew`); game.renews = (game.renews || 0) + 1; }
    pickups.push({ type: 'heart', x: e.x, y: e.y, t: 0, life: 20 });
  }
  // Drops
  if (e.type !== 'worm' || Math.random() < 0.3) {
    const r = Math.random();
    if (r < 0.035 && player.hp < stats.maxHp) pickups.push({ type: 'heart', x: e.x, y: e.y, t: 0, life: 10 });
    else if (r < 0.06) pickups.push({ type: 'coffee', x: e.x, y: e.y, t: 0, life: 10 });
  }
}

/** Haptic feedback on phones; silently ignored where unsupported or blocked. */
function buzz(pattern) {
  if (!settings.motion || !touch.enabled) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* not allowed */ }
}

function hurtPlayer(sx, sy, src = 'other', elite = false) {
  const p = player;
  if (p.inv > 0 || p.dashT > 0 || game.state !== 'playing') return;
  if (game.guide && p.hp <= 1) {   // guided room: you can't lose here, you just get a breather
    p.inv = 1.6; shake(0.3); sound.play('hurt'); floatText(p.x, p.y - 28, 'Careful!', '#ffd54a', 16, 1);
    const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1; p.vx += (dx / d) * 380; p.vy += (dy / d) * 380;
    return;
  }
  if (p.hp <= 1 && p.amnesty) {
    p.amnesty = false; p.inv = 1.6;
    floatText(p.x, p.y - 28, 'AMNESTY!', '#9be7dc', 20, 1.4);
    burst(p.x, p.y, 30, ['#9be7dc', '#fff'], 240, 0.7); shake(0.5); buzz([30, 30, 30]); sound.play('upgrade');
    rings.push({ x: p.x, y: p.y, r: 10, max: 120, speed: 500, friendly: true, life: 1 });
    return;
  }
  p.hp -= 1; addTaken(rl, src); game.lastHit = src; game.lastHitElite = elite;
  buzz(p.hp <= 0 ? [60, 40, 120] : 35);
  p.inv = stats.iframes;
  game.noHitWave = false;
  game.combo = 0; game.comboT = 0;
  const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1;
  p.vx += (dx / d) * 380; p.vy += (dy / d) * 380;
  shake(0.6); game.flash = 0.5; game.freeze = 0.07;
  sound.play('hurt');
  burst(p.x, p.y, 18, ['#ff6b6b', '#fff'], 200, 0.5);
  if (p.hp <= 0 && p.revives > 0) {
    // Second Wind (Renovation): back up with 2 hearts, and the room's pages are swept away.
    p.revives--; p.hp = Math.min(2, stats.maxHp); p.inv = 2.2;
    hazards.length = 0; rings.length = 0;
    banner('SECOND WIND', 'Back on your feet');
    burst(p.x, p.y, 40, ['#ffd54a', '#fff'], 260, 0.8); sound.play('upgrade');
    rings.push({ x: p.x, y: p.y, r: 10, max: 200, speed: 600, friendly: true, life: 1 });
    for (const e of enemies) { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; if (d < 200 && e.type !== 'boss') { e.vx += (dx / d) * 500; e.vy += (dy / d) * 500; e.stun = 1.2; } }
    return;
  }
  if (p.hp <= 0) die();
}


/** Last Chapter: +X% damage per missing heart, counting at most 3. Read live, so it follows every hit and heal. */
function lastChapterMult() {
  if (!stats.lastChapter) return 1;
  const m = 1 + stats.lastChapter * Math.min(3, Math.max(0, stats.maxHp - player.hp));
  rl.lcHits = (rl.lcHits || 0) + 1; rl.lcSum = (rl.lcSum || 0) + m;   // balance bot: average multiplier
  return m;
}

// Crossfire (Margin Notes + Spine Breaker): side and rear books burst 50% bigger on shelves, radius capped, at most 8 such bursts a second.
const CROSS_MAX_R = 160, CROSS_PER_SEC = 8;
let crossWin = 0, crossN = 0;
function shelfBurstAt(b, x, y, bounce = false) {
  let r = stats.shelfBurst || (bounce ? 50 : 0);
  if (!r) return;
  if (stats.crossfire && b.margin) {
    if (game.time - crossWin >= 1) { crossWin = game.time; crossN = 0; }
    if (crossN >= CROSS_PER_SEC) return;
    crossN++;
    r = Math.min(CROSS_MAX_R, Math.round(r * 1.5));
  }
  inkBurst(x, y, r, stats.damage * stats.burstMult, '#ffb86b');
}

function updateBooks(dt) {
  if (game.state === 'playing') sampleFlight(rl, books.length);
  for (let i = books.length - 1; i >= 0; i--) {
    const b = books[i];
    b.life -= dt; b.age += dt;
    b.rot += b.spin * dt;
    // Homing only on a book's first trip; Interdimensional Loan gives one homing trip (at 6) after the first wrap.
    const trips = b.wrapN || 0;
    const homing = trips === 0 ? stats.homing : trips === 1 && stats.wrapHoming ? 6 : 0;
    if (homing > 0 && !b.nohome) {
      const t = nearestEnemy(b.x, b.y, Math.max(stats.homingRange, 240));
      if (t) {
        const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(t.y - b.y, t.x - b.x);
        const na = cur + clamp(angleDiff(cur, want), -homing * dt, homing * dt);
        const s = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * s; b.vy = Math.sin(na) * s;
      }
    }
    let ox = b.x, oy = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    let remove = b.life <= 0;
    // Interlibrary Loan: leave through one wall, come back through the opposite one.
    if (b.wraps > 0 && (b.x < 0 || b.y < 0 || b.x >= W || b.y >= H)) {
      b.x = (b.x + W) % W; b.y = (b.y + H) % H; ox = b.x; oy = b.y;
      b.wraps--; b.life += 0.4; b.hit.clear(); b.wrapN = trips + 1;
      b.dmgMult = Math.min(2, b.dmgMult * 1.25);   // +25% per trip, capped at x2
      if (stats.wrapHoming) { if (trips === 0) b.dmgMult = 2; b.color = PLAYER.wrapped; }
      burst(b.x, b.y, 6, ['#9be7dc', '#fff'], 90, 0.3);
    }
    if (isSolidPx(arena.solid, b.x, b.y)) {
      if (!b.shelf) { b.shelf = true; rl.shelf = (rl.shelf || 0) + 1; }   // run log: books that reached a shelf/wall (balance measuring)
      if (b.bounces > 0) {
        b.bounces--;
        if (stats.bounceAccel) { b.vx *= 1 + stats.bounceAccel; b.vy *= 1 + stats.bounceAccel; }
        // Reflect on the axis whose crossing put us into the wall.
        if (isSolidPx(arena.solid, b.x, oy)) b.vx = -b.vx;
        if (isSolidPx(arena.solid, ox, b.y)) b.vy = -b.vy;
        if (!isSolidPx(arena.solid, b.x, oy) && !isSolidPx(arena.solid, ox, b.y)) { b.vx = -b.vx; b.vy = -b.vy; }
        b.x = ox; b.y = oy;
        if (stats.retarget) {
          const t = nearestEnemy(b.x, b.y, 700);
          if (t) { const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(t.y - b.y, t.x - b.x); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.hit.clear(); }
        }
        if (stats.bounceBurst) shelfBurstAt(b, b.x, b.y, true);
        sound.play('ping');
      } else {
        remove = true; pages(b.x, b.y, 2);
        if (stats.shelfBurst) shelfBurstAt(b, ox, oy);
      }
    }
    if (!remove) {
      for (const e of enemies) {
        if (e.dead || e.under || b.hit.has(e)) continue;   // books fly over a submerged eel
        const rr = e.r + b.r;
        if (e.trans > 0 && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) { bossImmune(e); continue; }   // books pass through
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          b.hit.add(e);
          const crit = Math.random() < stats.critChance;
          const base = stats.damage * b.dmgMult * lastChapterMult() * (stats.nookDamage && player.nookOn ? 2 : 1);
          const dmg = crit ? base * stats.critMult : base;
          const s = Math.hypot(b.vx, b.vy) || 1;
          damageEnemy(e, dmg, (b.vx / s) * 160, (b.vy / s) * 160, crit, crit ? 'crit' : 'throw');
          onBookHit(e, base, 'throw');
          b.hitAny = true;
          if (!b.bonus || particles.length < 110) burst(b.x, b.y, 5, [b.color, '#fff'], 120, 0.3);   // side/rear/fan books skip hit sparks in a busy screen
          if (crit && stats.critBurst) inkBurst(e.x, e.y, stats.critBurst, stats.damage, '#7a5cff', 'splash');
          if (b.pierce > 0) {
            b.pierce--;
            // Unreliable Narrator: the story forks.
            if (stats.splitOnPierce && !b.child) {
              const a = Math.atan2(b.vy, b.vx);
              for (const off of [-0.45, 0.45]) spawnBook(b.x, b.y, a + off, { child: true, pierce: 0, bounces: 0, life: 0.8, hit: new Set(b.hit), color: b.color, title: b.title });
            }
          } else { remove = true; break; }
        }
      }
    }
    if (remove) { bookEnded(rl, b.age, b.hitAny); books.splice(i, 1); }
  }
}

// Audiobook Orbit (v1.14.0 fair version): no page blocking, no stun. Only Surround Sound blocks, one page per book, then it rests.
const ORBIT_RADIUS = 56, ORBIT_SCALE = 1.6, ORBIT_SPIN = 3.6, ORBIT_DAMAGE = 1.25, ORBIT_REHIT = 0.3, ORBIT_KNOCK = 90, ORBIT_CRIT_MAX = 2.5, ORBIT_BLOCK_REST = 2.5;
const orbitRest = [];   // Surround Sound: seconds until each book can block another page
function orbiterPositions() {
  const n = stats.orbiters, out = [];
  for (let i = 0; i < n; i++) {
    const a = game.time * ORBIT_SPIN + (i / n) * TAU;
    const rad = ORBIT_RADIUS + (stats.orbitPulse ? 30 * (0.5 + 0.5 * Math.sin(game.time * 2.2)) : 0);
    out.push({ x: player.x + Math.cos(a) * rad, y: player.y + Math.sin(a) * rad, a });
  }
  return out;
}
function updateOrbiters(dt) {
  if (!stats.orbiters || game.state === 'dying') return;
  for (let i = 0; i < orbitRest.length; i++) orbitRest[i] = Math.max(0, orbitRest[i] - dt);
  for (const o of orbiterPositions()) {
    for (const e of enemies) {
      if (e.dead || e.orbitHit > 0) continue;
      if ((e.x - o.x) ** 2 + (e.y - o.y) ** 2 < (e.r + 8 * ORBIT_SCALE / 1.1) ** 2) {
        e.orbitHit = ORBIT_REHIT;
        const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy) || 1;
        // Crits use your crit chance but never more than x2.5 (Bibliography doesn't apply, and no Annotated splash).
        const crit = Math.random() < stats.critChance;
        const dmg = stats.damage * ORBIT_DAMAGE * (crit ? Math.min(stats.critMult, ORBIT_CRIT_MAX) : 1);
        damageEnemy(e, dmg, (dx / d) * ORBIT_KNOCK, (dy / d) * ORBIT_KNOCK, crit, 'orbit');
        onBookHit(e, stats.damage * ORBIT_DAMAGE, 'orbit');
      }
    }
  }
}

// Library Cat (v1.15.0): pounces on the nearest enemy (ignores line of sight, it's a cat). Level 1: 2x damage every 1.6 s;
// level 2: 30% more often and 50% harder; level 3: the pounce hits everything nearby. Stray Colony: a second cat, and pounces stun
// (never bosses or elites; a normal enemy can be stunned once per 3 s).
const CAT_RANGE = 380, CAT_LEAP = 0.28, CAT_AREA = 70, CAT_STUN = 0.6, CAT_STUN_CD = 3;
const cats = [];
function updateCats(dt) {
  if (!stats.catLvl || game.state === 'dying') { if (cats.length) cats.length = 0; return; }
  const want = stats.colony ? 2 : 1, lvl = stats.catLvl;
  while (cats.length < want) { const i = cats.length; cats.push({ x: player.x, y: player.y, i, cd: 0.5 + i * 0.8, leap: 0, from: null, tx: 0, ty: 0, target: null, face: 1, hop: 0 }); }
  const cd = 1.6 / (lvl >= 2 ? 1.3 : 1), dmg = stats.damage * 2 * (lvl >= 2 ? 1.5 : 1);
  for (const c of cats) {
    if (c.leap > 0) {
      c.leap -= dt;
      const t = 1 - Math.max(0, c.leap) / CAT_LEAP;
      if (c.target && !c.target.dead) { c.tx = c.target.x; c.ty = c.target.y; }
      c.x = c.fx + (c.tx - c.fx) * t; c.y = c.fy + (c.ty - c.fy) * t; c.hop = Math.sin(t * Math.PI) * 22;
      c.face = c.tx >= c.fx ? 1 : -1;
      if (c.leap <= 0) { c.hop = 0; catLand(c, dmg, lvl); c.cd = cd; }
      continue;
    }
    // follow: sit a little behind the player (second cat on the other side)
    const side = c.i ? -1 : 1, hx = player.x - side * 26, hy = player.y + 14;
    const dx = hx - c.x, dy = hy - c.y, d = Math.hypot(dx, dy);
    if (d > 4) { const sp = Math.min(d * 6, 320) * dt; c.x += (dx / d) * sp; c.y += (dy / d) * sp; c.face = dx >= 0 ? 1 : -1; }
    c.cd -= dt;
    if (c.cd <= 0 && game.state === 'playing') {
      const t = nearestEnemy(player.x, player.y, CAT_RANGE);
      if (t) { c.target = t; c.fx = c.x; c.fy = c.y; c.tx = t.x; c.ty = t.y; c.leap = CAT_LEAP; }
      else c.cd = 0.2;
    }
  }
}
function catLand(c, dmg, lvl) {
  const hits = [];
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - c.tx, e.y - c.ty);
    if (e === c.target || (lvl >= 3 && d < CAT_AREA + e.r)) hits.push(e);
  }
  for (const e of hits) {
    const dx = e.x - c.fx, dy = e.y - c.fy, d = Math.hypot(dx, dy) || 1;
    damageEnemy(e, dmg, (dx / d) * 140, (dy / d) * 140, false, 'cat');
    if (stats.colony && !e.dead && e.type !== 'boss' && !e.elite && game.time >= (e.catStunUntil || 0)) { e.stun = Math.max(e.stun || 0, CAT_STUN); e.catStunUntil = game.time + CAT_STUN_CD; }
  }
  burst(c.tx, c.ty, 6, [PLAYER.cat, PLAYER.catCollar], 110, 0.3);
  if (lvl >= 3) rings.push({ x: c.tx, y: c.ty, r: 4, max: CAT_AREA, speed: 300, friendly: true, life: 1, faint: true, color: '120,200,190' });
  sound.play('hit', 0.6);
}

function updateHazards(dt) {
  const orbs = stats.orbiters && hazards.length ? orbiterPositions() : null;   // run log: which pages fly through an orbit book
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (!h) continue;   // Second Wind (in hurtPlayer) empties this list mid-loop
    h.life -= dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += dt * 6;
    let blockedByBook = false;
    if (orbs && !h.orb) for (let k = 0; k < orbs.length; k++) {
      const o = orbs[k];
      if ((o.x - h.x) ** 2 + (o.y - h.y) ** 2 < (h.r + 9) ** 2) {
        // Surround Sound only: a book that is ready catches this page, then rests.
        if (stats.orbitPulse && !(orbitRest[k] > 0)) { orbitRest[k] = ORBIT_BLOCK_REST; blockedByBook = true; rl.pages.blocked++;
          { const px = player.x - h.x, py = player.y - h.y, sp = Math.hypot(h.vx, h.vy) || 1;   // run log: would this page have hit you? (heading at you, passing within reach)
            if (px * h.vx + py * h.vy > 0 && Math.abs(px * h.vy - py * h.vx) / sp < h.r + player.r) rl.pages.blockedHit++; } burst(h.x, h.y, 4, ['#9be7dc', '#fff'], 80, 0.25); break; }
        h.orb = true; rl.pages.crossed++; break;
      }
    }
    let remove = blockedByBook || h.life <= 0 || h.x < -20 || h.x > W + 20 || h.y < -20 || h.y > H + 20;
    if (!remove && isSolidPx(arena.solid, h.x, h.y) && h.x > 0 && h.y > 0 && h.x < W && h.y < H) { remove = true; burst(h.x, h.y, 3, ['#ff6b6b'], 60, 0.25); }
    if (!remove && (h.x - player.x) ** 2 + (h.y - player.y) ** 2 < (h.r + player.r - 2) ** 2 && player.inv <= 0 && player.dashT <= 0) {
      rl.pages.hits++; if (h.orb) rl.pages.crossedHit++; hurtPlayer(h.x, h.y, h.pat, h.pat.startsWith('page:elite')); remove = true;
    }
    if (remove) hazards.splice(i, 1);
  }
}

function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    if (!g) continue;   // Second Wind (in hurtPlayer) empties this list mid-loop
    g.r += g.speed * dt;
    g.life = 1 - g.r / g.max;
    if (!g.friendly) {
      const d = Math.hypot(player.x - g.x, player.y - g.y);
      if (Math.abs(d - g.r) < g.width / 2 + player.r * 0.5) hurtPlayer(g.x, g.y, 'ring');
    }
    if (g.r >= g.max) rings.splice(i, 1);
  }
}

function updatePickups(dt) {
  const p = player;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i];
    k.t += dt; k.life -= dt;
    const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (d < 90 || k.magnet) { const s = k.magnet ? 500 : 260; k.x += (dx / d) * s * dt; k.y += (dy / d) * s * dt; }
    if (d < p.r + 10) {
      if (k.type === 'heart') { p.hp = Math.min(stats.maxHp, p.hp + 1); floatText(p.x, p.y - 22, '+1 ♥', '#ff6b81', 16); }
      else { p.rapidT = 6; floatText(p.x, p.y - 22, 'ESPRESSO RUSH!', '#c69c6d', 16); }
      sound.play('pickup');
      burst(k.x, k.y, 12, [k.type === 'heart' ? '#ff6b81' : '#c69c6d', '#fff'], 120, 0.4);
      pickups.splice(i, 1);
    } else if (k.life <= 0) pickups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
    const d = Math.exp(-q.drag * dt);
    q.vx *= d; q.vy *= d; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-dt * 2);
    if (t.life <= 0) texts.splice(i, 1);
  }
  for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].life -= dt) <= 0) flashes.splice(i, 1);
}

// ======================================================================
// Rendering
// ======================================================================

function buildBackground() {
  bg = document.createElement('canvas');
  bg.width = W * 2; bg.height = H * 2; // render at 2x for crispness on HiDPI
  const g = bg.getContext('2d');
  g.scale(2, 2);
  const r = new Rng(hashString(`bg:${game.seed}:${game.wave}`));
  // Story wings each have their own floor colour and rug.
  const wing = game.mode === 'story' ? WINGS[game.wingN - 1] : null;
  const theme = themeOf(wing ? wing.act : 1);
  const hue = wing ? wing.floorHue : 25, sat = wing && (wing.floorHue < 10 || wing.floorHue > 60) ? 18 : 35;
  // Floor: Act I wooden planks (unchanged), Act II flagstones
  const ph = 18;
  if (theme.floor.kind === 'flagstone') drawFlagstones(g, r, theme);
  else for (let y = 0; y < H; y += ph) {
    let x = -r.int(0, 120);
    while (x < W) {
      const len = r.int(90, 210);
      const l = r.int(16, 23);
      g.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
      g.fillRect(x, y, len, ph);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, len, ph);
      g.strokeStyle = 'rgba(255,220,180,0.05)';
      for (let k = 0; k < 3; k++) { const gy = y + 3 + r.int(0, ph - 6); g.beginPath(); g.moveTo(x + 4, gy); g.lineTo(x + len - 4, gy + r.float(-1, 1)); g.stroke(); }
      x += len;
    }
  }
  if (arena.waterRects && theme.floor.water) drawWater(g, theme);
  // Central rug
  const rx = SAFE.x0 * CELL + 6, ry = SAFE.y0 * CELL + 6, rw = (SAFE.x1 - SAFE.x0 + 1) * CELL - 12, rh = (SAFE.y1 - SAFE.y0 + 1) * CELL - 12;
  g.fillStyle = wing ? wing.rug : '#4a1622'; g.fillRect(rx, ry, rw, rh);
  g.strokeStyle = theme.floor.rugLine || '#c9a227'; g.lineWidth = 3; g.strokeRect(rx + 6, ry + 6, rw - 12, rh - 12);
  g.lineWidth = 1; g.strokeRect(rx + 12, ry + 12, rw - 24, rh - 24);
  g.save(); g.translate(rx + rw / 2, ry + rh / 2);
  for (let i = 0; i < 8; i++) { g.rotate(TAU / 8); g.fillStyle = theme.floor.rugLine ? 'rgba(111,183,196,0.3)' : 'rgba(201,162,39,0.35)'; g.beginPath(); g.ellipse(26, 0, 18, 6, 0, 0, TAU); g.fill(); }
  g.restore();
  // Shelves: soft contact shadow, wooden case with a lit top edge and a dark front face,
  // then spines with the odd gap, leaning book and bookend.
  for (const s of arena.rects) {
    const horiz = s.w >= s.h;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 16; g.shadowOffsetX = 5; g.shadowOffsetY = 9;
    g.fillStyle = theme.shelf.shadow; g.fillRect(s.x, s.y, s.w, s.h);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(s.x + 6, s.y + 6, s.w, s.h);  // contact shadow
    g.fillStyle = theme.shelf.body; g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = theme.shelf.top; g.fillRect(s.x, s.y, s.w, 3);                 // lit top edge
    g.fillStyle = theme.shelf.face; g.fillRect(s.x, s.y + s.h - 7, s.w, 7);        // front face in shadow
    g.fillStyle = theme.shelf.faceLine; g.fillRect(s.x, s.y + s.h - 7, s.w, 1);
    g.fillStyle = theme.shelf.inside; g.fillRect(s.x + 3, s.y + 3, s.w - 6, s.h - 10); // inside of the case
    let p = 4;
    const lenAxis = horiz ? s.w : s.h - 7;
    const across = horiz ? s.h - 10 : s.w - 6;
    // bookends at both ends
    g.fillStyle = theme.shelf.end;
    if (horiz) { g.fillRect(s.x + 3, s.y + 3, 4, across); g.fillRect(s.x + s.w - 7, s.y + 3, 4, across); }
    else { g.fillRect(s.x + 3, s.y + 3, across, 4); g.fillRect(s.x + 3, s.y + lenAxis - 4, across, 4); }
    p += 4;
    while (p < lenAxis - 10) {
      const thick = r.int(4, 8);
      if (r.chance(0.07)) { p += r.int(3, 6); continue; } // gap where a book is checked out
      const depth = across - r.int(0, 5);
      const col = r.pick(theme.books);
      const lean = r.chance(0.07);
      g.save();
      if (horiz) {
        g.translate(s.x + p, s.y + 3 + (across - depth));
        if (lean) { g.translate(0, depth); g.rotate(-0.28); g.translate(0, -depth); }
        g.fillStyle = col; g.fillRect(0, 0, thick - 1, depth);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 2, thick - 1, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(thick - 2, 0, 1, depth);
      } else {
        g.translate(s.x + 3 + (across - depth), s.y + p);
        if (lean) { g.rotate(0.28); }
        g.fillStyle = col; g.fillRect(0, 0, depth, thick - 1);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(2, 0, 1.5, thick - 1);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, thick - 2, depth, 1);
      }
      g.restore();
      p += thick + (lean ? 3 : 0);
    }
    g.strokeStyle = theme.shelf.rim; g.lineWidth = 1.5; g.strokeRect(s.x + 0.75, s.y + 0.75, s.w - 1.5, s.h - 1.5);
  }
  // Reading lamps in the corners (also light sources)
  for (const [x, y] of LAMPS) {
    g.fillStyle = theme.lamp.base; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill();
    g.fillStyle = theme.lamp.bulb; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
  }
  // Walls
  g.strokeStyle = theme.wall; g.lineWidth = 10; g.strokeRect(0, 0, W, H);
}

/** Act II floor: dark flagstones with mortar lines and a few cracks. Own RNG calls only run for Act II, so Act I's background is untouched. */
function drawFlagstones(g, r, theme) {
  const [h, sat, l0, l1] = theme.floor.stone, th = 30;
  for (let y = 0; y < H; y += th) {
    let x = -r.int(0, 60);
    while (x < W) {
      const len = r.int(54, 96);
      g.fillStyle = `hsl(${h + r.int(-4, 4)} ${sat}% ${r.int(l0, l1)}%)`;
      g.fillRect(x, y, len, th);
      g.strokeStyle = theme.floor.gap; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, len, th);
      g.fillStyle = 'rgba(190,225,240,0.04)'; g.fillRect(x + 2, y + 2, len - 4, 2);
      if (r.chance(0.08)) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + r.int(6, len - 6), y + 3); g.lineTo(x + r.int(6, len - 6), y + th - 3); g.stroke(); }
      x += len;
    }
  }
}

/** Deep water, drawn once into the cached background: dark body, lighter middle, ripple arcs, a dark lip and a pale foam line on the stone side. */
function drawWater(g, theme) {
  const wt = theme.floor.water, wr = new Rng(hashString(`water:${game.seed}:${game.wave}`));
  for (const w of arena.waterRects) {
    g.fillStyle = wt.deep; g.fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle = wt.mid; g.fillRect(w.x + 5, w.y + 5, w.w - 10, w.h - 10);
    g.save(); g.beginPath(); g.rect(w.x, w.y, w.w, w.h); g.clip();
    g.strokeStyle = wt.ripple; g.lineWidth = 1.5;
    for (let i = 0, n = Math.max(2, Math.round((w.w * w.h) / 1800)); i < n; i++) {
      const x = w.x + wr.float(8, w.w - 8), y = w.y + wr.float(8, w.h - 8), rw = wr.float(10, 26);
      g.beginPath(); g.ellipse(x, y, rw, rw * 0.32, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.ellipse(x + 3, y + 5, rw * 0.6, rw * 0.2, 0, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
    }
    g.restore();
    g.strokeStyle = wt.edge; g.lineWidth = 4; g.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    g.strokeStyle = wt.foam; g.lineWidth = 1.5; g.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
  }
}
// Four wall lamps; story rooms (bigger than the legacy grid) add one on the top and bottom wall so the extra floor is not darker.
function lampPositions() {
  const l = [[26, H * 0.3], [W - 26, H * 0.3], [26, H * 0.66], [W - 26, H * 0.66]];
  if (areaK() > 1.2) l.push([W / 2, 26], [W / 2, H - 26]);
  return l;
}
let LAMPS = lampPositions();

// Light layer: darkness with "holes" punched by light sprites (destination-out), at half resolution.
const LS = 0.5;
const lightCanvas = document.createElement('canvas');
lightCanvas.width = W * LS; lightCanvas.height = H * LS;
const lctx = lightCanvas.getContext('2d');
const lightSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
})();
const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c); return c;
}

function renderLights() {
  const darkness = game.state === 'title' ? 0.55 : game.boss && game.boss.phase === 3 ? 0.86 + Math.sin(game.time * 23) * 0.04 : 0.8;
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  lctx.fillStyle = `rgba(6,4,18,${darkness})`;
  lctx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
  lctx.globalCompositeOperation = 'destination-out';
  const L = (x, y, r, a = 1) => { lctx.globalAlpha = clamp(a, 0, 1); lctx.drawImage(lightSprite, (x - r) * LS, (y - r) * LS, r * 2 * LS, r * 2 * LS); };
  for (const [x, y] of LAMPS) L(x, y, 170 + Math.sin(game.time * 3 + x) * 4, 0.8);
  L(W / 2, H / 2, 200, 0.35);
  if (game.state !== 'gameover' && !(game.state === 'dying' && game.deathT < 1.2)) L(player.x, player.y, 230 * stats.lanternScale, 1);
  for (let i = 0; i < books.length && i < 24; i++) L(books[i].x, books[i].y, 55, 0.7); // light budget
  for (const h of hazards) L(h.x, h.y, 30, 0.5);
  let eliteLights = 0;
  for (const e of enemies) {
    if (e.type === 'boss') L(e.x, e.y, 160, 0.7);
    else if (e.elite && eliteLights++ < 12) L(e.x, e.y, 70, 0.5); // light budget for elites
    else if (e.type === 'golem') L(e.x, e.y, 60, 0.4);
  }
  for (const g of rings) L(g.x, g.y, g.r + 30, 0.3 * g.life);
  for (const t of telegraphs) L(t.x, t.y, 70, t.t / t.dur);
  for (const f of flashes) L(f.x, f.y, f.r, f.life / f.max);
  lctx.globalAlpha = 1;
  ctx.drawImage(lightCanvas, 0, 0, W, H);
  // Coloured additive glows on top
  ctx.globalCompositeOperation = 'lighter';
  const G = (x, y, r, c, a) => { ctx.globalAlpha = a; ctx.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2); };
  const lampGlow = themeOf(game.mode === 'story' ? wingDef().act : 1).lamp.glow;
  for (const [x, y] of LAMPS) G(x, y, 90, lampGlow, 0.5);
  const bookGlow = books.length > 24 ? 0.25 : 0.45;
  for (let i = 0; i < books.length && i < 24; i++) G(books[i].x, books[i].y, 22, books[i].color, bookGlow);
  for (const h of hazards) G(h.x, h.y, 18, 'rgba(255,80,80,1)', 0.6);
  for (const f of flashes) if (f.color) G(f.x, f.y, f.r * 0.6, f.color, 0.4 * (f.life / f.max));
  if (game.boss) G(game.boss.x, game.boss.y, 120, game.boss.glow || 'rgba(120,70,255,1)', 0.35);
  let eliteGlows = 0;
  for (const e of enemies) if (e.elite && eliteGlows++ < 12) G(e.x, e.y, e.r * 2.4, 'rgba(255,200,60,1)', 0.35);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function render() {
  const s = viewScale * dpr;
  const tr = game.trauma * game.trauma;
  const ox = settings.motion ? (Math.random() * 2 - 1) * tr * 14 : 0;
  const oy = settings.motion ? (Math.random() * 2 - 1) * tr * 14 : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
  if (bg) ctx.drawImage(bg, 0, 0, W, H);

  for (const t of telegraphs) drawTelegraph(t);
  for (const k of pickups) drawPickup(k);
  for (const e of enemies) { if (isWaterType(e.type)) continue; const k = shadowK(e); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x + 3, e.y + e.r * 0.8, e.r * 0.9 * k, e.r * 0.4 * k, 0, 0, TAU); ctx.fill(); }
  drawWorms(ctx, enemies);
  for (let i = enemies.length - 1; i >= 0; i--) drawEnemy(enemies[i]);
  if (stats.ink || stats.chill || stats.staticChance) for (const e of enemies) if (e.inkT > 0 || e.chillT > 0 || e.frozenT > 0 || e.staticT > 0) drawStatus(e);   // only runs with a status perk
  for (const b of books) drawThrownBook(b);
  if (game.state !== 'title' && game.state !== 'gameover' && !(game.state === 'dying' && game.deathT < 1.5)) {
    orbiterPositions().forEach((o, k) => { if (orbitRest[k] > 0) ctx.globalAlpha = 0.4; drawBook(o.x, o.y, o.a * 2, PLAYER.orbit, ORBIT_SCALE); ctx.globalAlpha = 1; });
    drawPlayer();
  }
  for (const c of cats) drawCat(c);
  drawHazards();
  for (const g of rings) drawRing(g);
  if (zaps.length) drawZaps();
  drawParticles();

  if (settings.lights) renderLights();

  for (const t of texts) {
    ctx.globalAlpha = clamp(t.life / t.max * 1.5, 0, 1);
    ctx.font = `bold ${t.size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // Screen-space UI (no shake)
  ctx.setTransform(s, 0, 0, s, 0, 0);
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,40,60,${(settings.motion ? 0.35 : 0.15) * game.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.setTransform(s * uiK, 0, 0, s * uiK, 0, 0);   // HUD: drawn on the UW x UH canvas so it keeps its on-screen size
  if (game.state === 'playing' || game.state === 'waveclear' || game.state === 'dying') drawHUD();
  ctx.setTransform(s, 0, 0, s, 0, 0);               // sticks and crosshair follow the finger in world coordinates (sizes scaled by uiK)
  if (touch.enabled && touch.moveId !== null) drawStick();
  if (touch.enabled && touch.aimId !== null) drawAimStick();
  if (!touch.enabled && mouse.seen && (game.state === 'playing' || game.state === 'waveclear')) drawCrosshair();
}

/** A thrown book wearing its perk traits (see bookLook in palette.js). Rect-only drawing: 100+ can fly at once. */
function drawThrownBook(b) {
  const L = b.look;
  if (!L || L.plain) return drawBook(b.x, b.y, b.rot, b.color, b.scale || 1);
  const s = L.size * (b.scale || 1);
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.rotate(L.pointed ? Math.atan2(b.vy, b.vx) : b.rot);
  const back = -7 * s;
  if (L.trail) { // Dewey: teal dots, longer per level
    ctx.fillStyle = PLAYER.trail;
    for (let i = 1, n = 2 + L.trail * 2; i <= n; i++) { ctx.globalAlpha = 1 - 0.8 * i / (n + 1); ctx.fillRect(back - i * 6, -2 + Math.sin(i * 1.7 + game.time * 9) * 1.5, 4, 4); }
    ctx.globalAlpha = 1;
  }
  if (L.streak) { // Speed Reader: motion streak, longer per level
    ctx.fillStyle = PLAYER.streak;
    ctx.globalAlpha = 0.4; ctx.fillRect(back - 9 * L.streak, -3, 9 * L.streak, 6);
    ctx.globalAlpha = 0.75; ctx.fillRect(back - 4 * L.streak, -2, 4 * L.streak, 4);
    ctx.globalAlpha = 1;
  }
  if (L.ribbon) { // Bouncy Bookmark: gold ribbon flapping behind
    const w = Math.sin(game.time * 22 + b.spin) * 1.5;
    ctx.fillStyle = PLAYER.ribbon; ctx.fillRect(back - 6, 3 * s + w * 0.5, 8, 2); ctx.fillRect(back - 10, 4 * s + w, 5, 2);
  }
  ctx.scale(s, s);
  if (L.glint) { // Plot Twist: arrowhead
    ctx.fillStyle = PLAYER.glint; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(7, -4.5); ctx.lineTo(7, 4.5); ctx.fill();
  }
  ctx.fillStyle = b.color; ctx.fillRect(-7, -5, 14, 10);
  ctx.fillStyle = '#f3ead2'; ctx.fillRect(-5, -4, 11, 8);
  ctx.fillStyle = b.color; ctx.fillRect(-7, -5, 3, 10);
  if (L.crack) { ctx.fillStyle = PLAYER.crack; ctx.fillRect(-6.6, -4.5, 1.6, 3); ctx.fillRect(-5.6, -1.5, 1.6, 3); ctx.fillRect(-6.6, 1.5, 1.6, 3); }
  ctx.restore();
}

/** Library Cat: a small grey-blue cat with a teal collar (a sprite-sized shape, no shadowBlur). */
function drawCat(c) {
  const f = c.face || 1, y = c.y - (c.hop || 0), moving = c.leap > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 8, 9, 3.5, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(c.x, y); ctx.scale(f, 1);
  ctx.fillStyle = PLAYER.cat;
  ctx.beginPath(); ctx.ellipse(0, 2, moving ? 10 : 8, moving ? 4.5 : 5.5, 0, 0, TAU); ctx.fill();          // body (stretches mid-pounce)
  ctx.beginPath(); ctx.arc(7, -2, 5, 0, TAU); ctx.fill();                                                    // head
  ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(5.5, -10); ctx.lineTo(8, -6); ctx.moveTo(8, -6); ctx.lineTo(10.5, -10); ctx.lineTo(11, -4); ctx.fill(); // ears
  ctx.strokeStyle = PLAYER.cat; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-7, 1); ctx.quadraticCurveTo(-14, -4 + Math.sin(game.time * 6 + c.i) * 3, -12, -9); ctx.stroke();   // tail
  ctx.fillStyle = PLAYER.catCollar; ctx.fillRect(3, 0, 2.5, 5);                                              // teal collar
  ctx.fillStyle = '#10202a'; ctx.fillRect(8, -3, 1.5, 1.5);                                                  // eye
  ctx.restore();
}

function drawBook(x, y, rot, color, scale) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  ctx.fillStyle = color; ctx.fillRect(-7, -5, 14, 10);
  ctx.fillStyle = '#f3ead2'; ctx.fillRect(-5, -4, 11, 8);
  ctx.fillStyle = color; ctx.fillRect(-7, -5, 3, 10);
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  for (const t of p.trail) {
    ctx.globalAlpha = t.life * 1.6;
    ctx.fillStyle = '#9be7dc'; ctx.beginPath(); ctx.arc(t.x, t.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = p.inv > 0 && Math.floor(game.time * 18) % 2 ? 0.35 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 10, 12, 5, 0, 0, TAU); ctx.fill();
  if (p.inZone) { ctx.fillStyle = 'rgba(255,140,60,0.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12 + Math.sin(game.time * 20) * 2, 0, TAU); ctx.fill(); }
  if (p.amnesty) { ctx.strokeStyle = 'rgba(155,231,220,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  if (p.nookOn) { ctx.strokeStyle = 'rgba(123,216,143,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9 + Math.sin(game.time * 8) * 1.5, 0, TAU); ctx.stroke(); }
  // Ground ring: always find yourself, even in a crowded fight
  const gs = touch.enabled ? 1.3 : 1;
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 9 * gs, 17 * gs, 7 * gs, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,213,74,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.translate(p.x, p.y + Math.sin(p.walk) * 1.2); ctx.rotate(p.aim);
  if (touch.enabled) ctx.scale(1.3, 1.3);
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-6, 0, 6.8, 0, TAU); ctx.fill();
  ctx.fillRect(3, 5.5, 16.5, 10);
  // Cardigan body
  ctx.fillStyle = p.rapidT > 0 ? '#c69c6d' : '#2bb3a3';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#13544c'; ctx.lineWidth = 2; ctx.stroke();
  // Arm + book in hand
  ctx.fillStyle = '#2bb3a3'; ctx.fillRect(4, 7, 9, 5);
  ctx.fillStyle = PLAYER.book; ctx.fillRect(11, 5, 7, 9);
  // Head, bun, glasses
  ctx.fillStyle = '#4a2c1a'; ctx.beginPath(); ctx.arc(-6, 0, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(1, 0, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a2c1a'; ctx.beginPath(); ctx.arc(-1, 0, 7, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(5, -3, 2.4, 0, TAU); ctx.moveTo(7.4, 3); ctx.arc(5, 3, 2.4, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(5, -4, 1.5, 1.5); ctx.fillRect(5, 2, 1.5, 1.5);
  ctx.restore();
  ctx.save(); ctx.translate(p.x, p.y); if (touch.enabled) ctx.scale(1.3, 1.3); rim(13, 0.6); ctx.restore();
  ctx.globalAlpha = 1;
}

const OUTLINE = '#120a06';
/** Warm rim light on the upper-left edge (the lamps' side), in world orientation. */
function rim(r, a = 0.55) {
  ctx.strokeStyle = `rgba(255,226,170,${a})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r - 1, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
}

function drawEnemy(e) {
  // every enemy but the boss is drawn by src/enemy-art.js
  if (e.type !== 'boss') return drawArtEnemy(ctx, e, { player, playing: game.state === 'playing' });
  const look = Math.atan2(player.y - e.y, player.x - e.x);
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.vs !== 1) ctx.scale(e.vs, e.vs);
  if (e.trans > 0) { const k = 1 + 0.18 * Math.sin((e.trans / BOSS_TRANS) * Math.PI); ctx.scale(k, k); }
  if (e.stun > 0) { ctx.rotate(Math.sin(e.t * 20) * 0.15); }
  drawBoss(e, look, e.flash > 0 || (e.trans > 0 && Math.sin(e.trans * 40) > 0));
  ctx.restore();
}

function drawBoss(e, look, white) {
  const flap = Math.sin(e.t * 6) * 0.25;
  if (e.mode === 'windup') { ctx.strokeStyle = 'rgba(255,60,60,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.cAim) * 600, Math.sin(e.cAim) * 600); ctx.stroke(); }
  // Open tome in this author's own binding: covers, gold corner foil, pages
  for (const s of [-1, 1]) {
    ctx.save(); ctx.scale(s, 1); ctx.rotate(flap * s * 0.3);
    ctx.fillStyle = '#120a06'; ctx.beginPath(); ctx.roundRect(-1, -36, 50, 72, 7); ctx.fill();
    ctx.fillStyle = white ? '#fff' : e.cover || '#3b1d8f'; ctx.beginPath(); ctx.roundRect(0, -34, 47, 68, 6); ctx.fill();
    ctx.fillStyle = '#d4a72c';
    for (const cy of [-34, 34]) { ctx.beginPath(); ctx.moveTo(47, cy); ctx.lineTo(39, cy); ctx.lineTo(47, cy - Math.sign(cy) * 8); ctx.fill(); }
    ctx.fillStyle = '#f3ead2'; ctx.fillRect(8, -26, 31, 52);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let y = -20; y < 22; y += 6) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(35, y); ctx.stroke(); }
    ctx.restore();
  }
  // Spine with the author's name in gold
  ctx.fillStyle = e.spineCol || '#2a0f66'; ctx.fillRect(-6, -37, 12, 74);
  // Foil name plate under the tome
  const label = short(e.name.toUpperCase(), 16);
  ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
  const pw = Math.max(48, ctx.measureText(label).width + 14);
  ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.roundRect(-pw / 2 - 1.5, 38.5, pw + 3, 17, 4); ctx.fill();
  ctx.fillStyle = e.spineCol || '#2a0f66'; ctx.beginPath(); ctx.roundRect(-pw / 2, 40, pw, 14, 3); ctx.fill();
  ctx.strokeStyle = '#d4a72c'; ctx.lineWidth = 1; ctx.strokeRect(-pw / 2 + 2.5, 42.5, pw - 5, 9);
  ctx.fillStyle = '#e8c35a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 47.5);
  ctx.textBaseline = 'alphabetic';
  // The eye, set into the spine
  ctx.fillStyle = '#120a06'; ctx.beginPath(); ctx.ellipse(0, 0, 18.5, 13.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = e.phase === 3 ? '#ff2d55' : e.iris || '#6c3cff'; ctx.beginPath(); ctx.arc(Math.cos(look) * 6, Math.sin(look) * 4, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(Math.cos(look) * 7, Math.sin(look) * 5, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(Math.cos(look) * 6 - 2.5, Math.sin(look) * 4 - 2.5, 1.6, 0, TAU); ctx.fill();
}

function drawTelegraph(t) {
  const k = t.t / t.dur;
  const r = t.type === 'boss' ? 46 : 16;
  ctx.strokeStyle = `rgba(180,140,255,${0.3 + k * 0.6})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(t.x, t.y, r * (1.6 - k * 0.6), 0, TAU); ctx.stroke();
  ctx.fillStyle = `rgba(180,140,255,${k * 0.35})`; ctx.beginPath(); ctx.arc(t.x, t.y, r * k, 0, TAU); ctx.fill();
}

function drawPickup(k) {
  const bob = Math.sin(k.t * 5) * 2;
  if (k.life < 3 && Math.floor(k.t * 10) % 2) return;
  if (k.type === 'heart') { ctx.fillStyle = '#ff6b81'; heartPath(ctx, k.x, k.y - 8 + bob, 14); ctx.fill(); }
  else {
    ctx.fillStyle = '#f3ead2'; ctx.fillRect(k.x - 6, k.y - 6 + bob, 12, 13);
    ctx.fillStyle = '#6f4e37'; ctx.fillRect(k.x - 5, k.y - 5 + bob, 10, 4);
    ctx.strokeStyle = '#f3ead2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(k.x + 7, k.y + bob, 3, -1.2, 1.2); ctx.stroke();
  }
}

/** Enemy pages: solid red with a dark outline and a pulsing hot rim, so they never read as your books.
 *  Drawn as a batch (one stroke for every rim, one pre-rendered sprite per page): a late boss puts 100+ on screen. */
const hazardSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32; // 2x for HiDPI
  const g = c.getContext('2d'); g.scale(2, 2); g.translate(8, 8);
  g.fillStyle = '#120a06'; g.fillRect(-6.5, -7.5, 13, 15);
  g.fillStyle = '#ff3b4e'; g.fillRect(-5, -6, 10, 12);
  g.fillStyle = '#ffd0d5'; g.fillRect(-3, -3, 6, 1.6); g.fillRect(-3, 0.5, 6, 1.6);
  return c;
})();
function drawHazards() {
  if (!hazards.length) return;
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 14);
  ctx.strokeStyle = `rgba(255,60,80,${0.35 + pulse * 0.4})`; ctx.lineWidth = 2;
  ctx.beginPath();
  const r = 9 + pulse * 1.5;
  for (const h of hazards) { ctx.moveTo(h.x + r, h.y); ctx.arc(h.x, h.y, r, 0, TAU); }
  ctx.stroke();
  const base = ctx.getTransform();
  for (const h of hazards) {
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    ctx.setTransform(base.a * c, base.b + base.a * s, -base.d * s, base.d * c, base.a * h.x + base.e, base.d * h.y + base.f);
    ctx.drawImage(hazardSprite, -8, -8, 16, 16);
  }
  ctx.setTransform(base);
}

function drawRing(g) {
  ctx.strokeStyle = g.friendly ? `rgba(${g.color || '155,231,220'},${g.life * (g.faint ? 0.45 : 1)})` : `rgba(255,159,67,${0.4 + g.life * 0.6})`;
  ctx.lineWidth = g.friendly ? (g.faint ? 2 : 6 * g.life + 1) : g.width;
  ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.stroke();
  if (!g.friendly) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawParticles() {
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.color;
    if (q.shape === 'circ') { ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (q.life / q.max), 0, TAU); ctx.fill(); }
    else if (q.shape === 'page') {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(Math.cos(q.rot * 2), 1);
      ctx.fillRect(-q.size, -q.size * 0.7, q.size * 2, q.size * 1.4); ctx.restore();
    } else ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
}

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  g.closePath();
}

const FONT = (px, w = 'bold') => `${w} ${px}px ui-monospace, Menlo, Consolas, monospace`;
function txt(t, x, y, px, color, align = 'left') {
  ctx.font = FONT(px); ctx.textAlign = align;
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(t, x, y);
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}

function drawHUD() {
  // Hearts
  if (stats.maxHp <= 12) {
    for (let i = 0; i < stats.maxHp; i++) {
      ctx.fillStyle = i < player.hp ? '#ff6b81' : 'rgba(255,255,255,0.15)';
      heartPath(ctx, 22 + i * 24, 12, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#ff6b81'; heartPath(ctx, 22, 12, 18); ctx.fill();
    txt(`× ${player.hp}`, 38, 28, 16, '#fff');
  }
  // Fines collected this run
  txt(`🪙 ${game.fines} fines`, 14, 48, 13, '#ffd54a');
  // Score + combo
  if (!isStory()) txt(Math.floor(game.score).toLocaleString(), UW - 16, 32, 24, '#fff', 'right');   // story runs aren't ranked: no score
  const m = comboMult();
  if (game.combo > 1) {
    txt(`${game.combo} combo  ×${m}`, UW - 16, 52, 13, m >= 3 ? '#ffd54a' : '#9be7dc', 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(UW - 136, 58, 120, 4);
    ctx.fillStyle = '#9be7dc'; ctx.fillRect(UW - 136, 58, 120 * clamp(game.comboT / 2.5, 0, 1), 4);
  }
  // Wave info
  const left = enemies.length + telegraphs.length + spawnQueue.length;
  if (isStory()) {
    txt(`ROOM ${game.wave}/${roomsIn(game.wingN)}`, UW / 2, 26, 18, game.diff && game.diff.kind !== 'normal' ? '#ffd54a' : '#e8d9b0', 'center');
    if (game.state === 'playing' && isSurvive()) drawSurviveTimer();
    else if (game.state === 'playing' && !game.boss) txt(`${short(wingDef().name, 18)} · ${left} left`, UW / 2, 44, 11, 'rgba(232,217,176,0.8)', 'center');
  } else {
    txt(`WAVE ${game.wave}`, UW / 2, 26, 18, '#e8d9b0', 'center');
    if (game.state === 'playing' && !game.boss) txt(`${left} disturbance${left === 1 ? '' : 's'} left`, UW / 2, 44, 11, 'rgba(232,217,176,0.8)', 'center');
  }
  drawGuidePrompt();
  // Cooldowns
  const dashReady = player.dashStock > 0;
  const kDash = dashReady ? 1 : clamp(1 - player.dashCd / stats.dashCd, 0, 1), kShhh = clamp(1 - player.shhhT / stats.shhhCd, 0, 1);
  const dashLabel = stats.dashCharges > 1 ? `DASH×${player.dashStock}` : 'DASH';
  if (touch.enabled) {
    // On touch the on-screen buttons show their own cooldown rings + countdown.
    setTouchButton(btnDash, kDash, dashReady ? 0 : player.dashCd, dashLabel);
    setTouchButton(btnShhh, kShhh, player.shhhT, 'SHHH');
    if (player.rapidT > 0) cooldown(30, UH - 30, '☕x2', player.rapidT / 6, '#c69c6d');
  } else {
    cooldown(30, UH - 30, dashLabel, kDash, '#9be7dc', dashReady ? 0 : player.dashCd);
    cooldown(80, UH - 30, 'SHHH', kShhh, '#b48cff', player.shhhT);
    if (player.rapidT > 0) cooldown(130, UH - 30, '☕x2', player.rapidT / 6, '#c69c6d');
  }
  // Boss bar
  if (game.boss) {
    const b = game.boss, bw = Math.min(460, UW - 120), bx = (UW - bw) / 2, by = PORTRAIT ? 86 : UH - 34;
    txt(`${b.name}`, UW / 2, by - 6, 13, '#d6c8ff', 'center');
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
    ctx.fillStyle = b.phase === 3 ? '#ff2d55' : b.bar || '#6c3cff'; ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx + bw * 0.33, by, 2, 10); ctx.fillRect(bx + bw * 0.66, by, 2, 10);
  }
  // Phase tag: small, top of the screen, never covers the play area
  if (game.phaseTag && game.phaseTag.t > 0) {
    ctx.globalAlpha = clamp(game.phaseTag.t * 4, 0, 1); txt(game.phaseTag.text, UW / 2, 70 * uiK + 22, 22, '#fff3c4', 'center'); ctx.globalAlpha = 1;
  }
  // Banner
  if (game.bannerT > 0) {
    const a = clamp(Math.min(game.bannerT, 2.4 - game.bannerT) * 3, 0, 1);
    const slide = (1 - a) * 30;
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, UH / 2 - 92, UW, game.bannerSub ? 84 : 60);
    ctx.globalAlpha = a;
    txt(game.banner, UW / 2 + slide, UH / 2 - 50, 44, '#fff3c4', 'center');
    if (game.bannerSub) txt(game.bannerSub, UW / 2 - slide, UH / 2 - 22, 16, '#d6c8ff', 'center');
    ctx.globalAlpha = 1;
  }
  if (DEBUG) txt(`fps ${fps.toFixed(0)}  e${enemies.length} p${particles.length} seed ${game.seed}`, 10, UH - 60, 11, '#0f0');
}

/** Survive rooms: a big countdown at the top centre (digits + a shrinking bar); pulses red in the last 5 s. */
function drawSurviveTimer() {
  const left = Math.max(0, game.surviveT), t = Math.ceil(left), last = left <= 5;
  const pulse = last ? 1 + 0.12 * Math.abs(Math.sin(left * Math.PI * 2)) : 1;
  const cx = UW / 2, cy = 74, col = last ? '#ff6b6b' : '#ffd54a';
  ctx.save();
  ctx.globalAlpha = 0.55; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.roundRect(cx - 74, 36, 148, 62, 14); ctx.fill();
  ctx.globalAlpha = 1;
  txt('SURVIVE', cx, 50, 11, 'rgba(232,217,176,0.85)', 'center');
  ctx.translate(cx, cy); ctx.scale(pulse, pulse);
  txt(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 0, 12, 36, col, 'center');
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - 62, 90, 124, 4);
  ctx.fillStyle = col; ctx.fillRect(cx - 62, 90, 124 * clamp(left / SURVIVE_SECONDS, 0, 1), 4);
}

/** Guided room: the one-line prompt near the top, and a glow on the button it points at. */
function drawGuidePrompt() {
  const g = game.guide;
  if (!g || g.beat < 0) { if (btnDash.classList.contains('guide-hl') || btnShhh.classList.contains('guide-hl')) { btnDash.classList.remove('guide-hl'); btnShhh.classList.remove('guide-hl'); } return; }
  const b = GUIDE_BEATS[g.beat], aimOff = touch.enabled && settings.autoaim === false;
  const text = guidePrompt(g.beat, { aimOff, used: g.used });
  ctx.font = FONT(18);
  const w = Math.min(UW - 40, ctx.measureText(text).width + 36), y = 118;
  ctx.globalAlpha = 0.65; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect((UW - w) / 2, y - 22, w, 34, 17); ctx.fill(); ctx.globalAlpha = 1;
  txt(text, UW / 2, y + 1, 18, '#fff3c4', 'center');
  btnDash.classList.toggle('guide-hl', b.hl === 'dash' && !g.used);
  btnShhh.classList.toggle('guide-hl', b.hl === 'shhh' && !g.used);
}

function cooldown(x, y, label, k, color, secs = 0) {
  k = clamp(k, 0, 1);
  const ready = k >= 1;
  if (ready) { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(game.time * 5); ctx.drawImage(glowSprite(color), x - 30, y - 30, 60, 60); ctx.globalAlpha = 1; }
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke();
  ctx.strokeStyle = ready ? color : 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
  ctx.textAlign = 'center';
  if (!ready && secs > 0) {
    ctx.font = FONT(12); ctx.fillStyle = '#ddd'; ctx.fillText(secs < 1 ? secs.toFixed(1) : String(Math.ceil(secs)), x, y + 4);
    ctx.font = FONT(7); ctx.fillStyle = '#888'; ctx.fillText(label, x, y + 31);
  } else { ctx.font = FONT(label.length > 5 ? 7 : 9); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 3); }
}

/** Touch buttons: ring fills as it recharges, a countdown shows, and it lights up when ready. */
const btnCache = new WeakMap();
function setTouchButton(btn, k, secs, label) {
  const ready = k >= 1;
  const text = ready ? '' : secs < 1 ? secs.toFixed(1) : String(Math.ceil(secs));
  const key = `${ready}|${text}|${label}|${k.toFixed(2)}`;
  if (btnCache.get(btn) === key) return;
  btnCache.set(btn, key);
  btn.style.setProperty('--k', k.toFixed(3));
  btn.classList.toggle('cooling', !ready);
  btn.querySelector('.cd').textContent = text;
  btn.querySelector('.lbl').textContent = label;
}

function drawCrosshair() {
  const x = mouse.x, y = mouse.y;
  ctx.strokeStyle = 'rgba(255,243,196,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU);
  ctx.moveTo(x - 13, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 13, y);
  ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 13);
  ctx.stroke();
}

function drawStick() {
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3 * uiK;
  ctx.beginPath(); ctx.arc(touch.mx0, touch.my0, 45 * uiK, 0, TAU); ctx.stroke();
  const dx = touch.mx - touch.mx0, dy = touch.my - touch.my0, d = Math.hypot(dx, dy), k = d > 45 * uiK ? 45 * uiK / d : 1;
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(touch.mx0 + dx * k, touch.my0 + dy * k, 18 * uiK, 0, TAU); ctx.fill();
}

/** The aim stick: same ring + knob as the move stick, in library blue, with a tick on the ring showing the aim direction. */
function drawAimStick() {
  const { ax0: x0, ay0: y0 } = touch, dx = touch.ax - x0, dy = touch.ay - y0, d = Math.hypot(dx, dy), k = d > 45 * uiK ? 45 * uiK / d : 1;
  const on = d > touch.dead;
  ctx.strokeStyle = on ? 'rgba(125,190,255,0.75)' : 'rgba(125,190,255,0.4)'; ctx.lineWidth = 3 * uiK;
  ctx.beginPath(); ctx.arc(x0, y0, 45 * uiK, 0, TAU); ctx.stroke();
  ctx.fillStyle = on ? 'rgba(125,190,255,0.6)' : 'rgba(125,190,255,0.35)';
  ctx.beginPath(); ctx.arc(x0 + dx * k, y0 + dy * k, 18 * uiK, 0, TAU); ctx.fill();
  if (on) {
    const a = Math.atan2(dy, dx), c = Math.cos(a), s = Math.sin(a);
    ctx.lineWidth = 4 * uiK; ctx.beginPath(); ctx.moveTo(x0 + c * 66 * uiK, y0 + s * 66 * uiK); ctx.lineTo(x0 + c * 80 * uiK, y0 + s * 80 * uiK); ctx.stroke();
  }
}

// ======================================================================
// DOM screens, settings, leaderboard
// ======================================================================
const SCREENS = ['title', 'howto', 'settings', 'leaderboard', 'upgrade', 'doors', 'pause', 'gameover', 'codex', 'story', 'shop', 'backup'];
let settingsReturn = 'title', shopReturn = 'title', currentScreen = 'title';
function showScreen(id) {
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  if (id !== currentScreen) $('#whatsNew').hidden = true;   // v1.16.1: no screen change leaves the What's-new card drawn on top
  currentScreen = id;
  closeBuildPop(); $('#nudge').hidden = true;
  document.body.classList.toggle('in-game', id === null);
  if (id === 'title') { renderFineBadges(); renderMenus(); }
  if (id) fitPinnedRow(document.getElementById(id));
}

/** The pinned bottom button row is never wider than the content column above it (the widest block on that screen); buttons wrap. */
const pinnedObservers = new WeakMap();
function fitPinnedRow(scr) {
  const row = scr?.querySelector(':scope > .menu.row:last-child');
  if (!row) return;
  const fit = () => {
    const w = Math.max(0, ...[...scr.children].filter((c) => c !== row && !c.hidden && c.offsetParent !== null).map((c) => c.getBoundingClientRect().width));
    // 12em floor so a very narrow block can't squash the buttons into a column of slivers
    // Short screens (phones): the row is one compact line as wide as the screen; the column cap applies to taller screens only.
    const short = matchMedia('(max-height: 640px)').matches;
    // Taller screens keep the column cap, unless the buttons would have to wrap: then the row grows to one line.
    const btns = [...row.children].filter((b) => !b.hidden && b.offsetParent !== null);
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const one = btns.reduce((a, b) => a + b.getBoundingClientRect().width, 0) + gap * Math.max(0, btns.length - 1);
    const nowrap = getComputedStyle(row).flexWrap === 'nowrap';
    // v1.12.1: the band itself is full width; the cap now only insets the buttons (--row-cap drives the row's side padding)
    if (w && !short) row.style.setProperty('--row-cap', `max(${Math.ceil(w)}px, 12em${nowrap ? `, ${Math.ceil(one)}px` : ''})`); else row.style.removeProperty('--row-cap');
  };
  fit();
  if (pinnedObservers.has(scr) || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(fit);
  for (const c of scr.children) if (c !== row) ro.observe(c);
  pinnedObservers.set(scr, ro);
}

// ---- Menus appear as they're earned (v1.13.0): derived from saves, flags only in the tips store ----
let menusAnnounce = false;   // false at boot: a returning player is never greeted with "unlocked" toasts for old progress
function renderMenus() {
  const unlocked = unlockedMenus(playerSaves());
  for (const m of MENUS) { const el = document.querySelector(`#title [data-menu="${m.id}"]`); if (el) el.hidden = !unlocked[m.id]; }
  const fresh = newUnlocks(unlocked, tips.seen);
  for (const id of fresh) markTip(UNLOCK_FLAG[id]);
  if (menusAnnounce) fresh.forEach((id, i) => setTimeout(() => { if (game.state === 'title') toast(unlockToast(id), 3000); }, 350 + i * 3200));
  menusAnnounce = true;
  updateFirstHint();
  maybeWhatsNew();
  const grid = document.querySelector('#title .menu-grid');
  if (grid) grid.classList.toggle('three', [...grid.children].filter((b) => !b.hidden).length % 2 === 1);
}

// ---- "What's new" card (v1.15.0): once, for big releases only, to returning players; a brand-new player just gets it stamped ----
function maybeWhatsNew() {
  const act = whatsNewAction({ seen: tips.seen, played: hasPlayed(playerSaves()) }, BUILD.version);
  if (!act) return;
  markTip(whatsNewFlag());
  if (act === 'stamp') { for (const id of NEW_IN_1_15) markTip(badgeFlag(id)); return; }   // fresh install: nothing is "new" to them

  $('#wnTitle').textContent = WHATS_NEW.title;
  $('#wnLines').replaceChildren(...WHATS_NEW.lines.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('#btnWnOk').textContent = WHATS_NEW.button;
  setTimeout(() => {
    if (game.state !== 'title') return;
    // The backdrop stops above the title's version line so its 7-tap tester switch stays reachable.
    $('#whatsNew').hidden = false;
    const v = document.querySelector('#title .version-label').getBoundingClientRect(), host = $('#whatsNew').getBoundingClientRect();
    $('#whatsNew').style.setProperty('--wn-clear', `${Math.max(0, Math.ceil(host.bottom - v.top) + 2)}px`);
  }, 500);
}
$('#btnWnOk').addEventListener('click', () => { $('#whatsNew').hidden = true; sound.play('click'); });

// ---- Late fees UI: fines balance, Renovations shop, story wing select ----
function renderFineBadges() {
  for (const el of document.querySelectorAll('.fine-balance')) el.textContent = `🪙 ${progress.fines.toLocaleString()} fines`;
  for (const el of document.querySelectorAll('.fine-count')) el.textContent = progress.fines ? `· ${progress.fines.toLocaleString()} fines` : '';
}

function renderShop() {
  renderFineBadges();
  const list = $('#shopList');
  list.textContent = '';
  for (const r of RENOVATIONS) {
    const lvl = level(progress, r.id), cost = nextCost(progress, r.id);
    const li = document.createElement('li');
    li.className = 'reno' + (lvl ? ' owned' : '');
    const ic = document.createElement('span'); ic.className = 'icon'; ic.textContent = r.icon;
    const body = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = r.name;
    const gain = document.createElement('small'); gain.textContent = renoText(r, lvl);
    const lv = document.createElement('small'); lv.className = 'lvl'; lv.textContent = r.max > 1 ? `${pips(lvl, r.max)}  ${lvl}/${r.max}` : lvl ? 'Owned' : 'One-time';
    body.append(name, gain, lv);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'buy'; b.dataset.reno = r.id;
    b.textContent = cost === null ? '✓ Max' : `🪙 ${cost.toLocaleString()}`;
    b.disabled = cost === null || !canBuy(progress, r.id);
    if (cost !== null && !b.disabled) b.classList.add('affordable');
    b.addEventListener('click', () => {
      if (!canBuy(progress, r.id)) return;
      progress = buy(progress, r.id); saveProgress();
      sound.play('upgrade'); toast(`${r.icon} ${r.name} ${level(progress, r.id) > 1 ? `level ${level(progress, r.id)}` : 'built'}!`);
      renderShop();
      const again = document.querySelector(`#shopList button[data-reno="${r.id}"]`);
      if (again && !again.disabled) again.focus();
    });
    li.append(ic, body, b);
    list.appendChild(li);
  }
}

let selectedWing = 1;
/** The first unlocked wing you haven't cleared yet (or the last unlocked one). */
function defaultWing() {
  for (let w = 1; w <= effUnlocked(); w++) if (!progress.cleared.includes(w) && (!tester.on || w <= progress.unlocked)) return w;
  return Math.min(effUnlocked(), progress.unlocked);
}
function wingStatus(w) {
  if (w > effUnlocked()) return 'Locked';
  if (progress.cleared.includes(w)) return '✓ Cleared';
  const best = progress.best[w];
  return best ? `Best: room ${best}/${roomsIn(w)}` : 'New';
}
// Wing map: one page per act (10 wings each). Swipe or the arrows move between pages; Act II shows locked until wing 10 is cleared.
let storyAct = 1;
const LAST_ACT = Math.max(...WINGS.map((w) => w.act || 1));
function setStoryAct(a) { storyAct = clamp(a, 1, LAST_ACT); renderStory(); }
function renderStory() {
  renderFineBadges();
  const unlocked = effUnlocked();
  if (selectedWing > unlocked) selectedWing = unlocked;
  if (actOf(selectedWing) !== storyAct) { const first = WINGS.findIndex((w) => (w.act || 1) === storyAct) + 1; selectedWing = Math.min(first, unlocked) || selectedWing; }
  const th = ACTS.find((a) => a.act === storyAct);
  $('#actTitle').textContent = `${th.short} · ${th.name}`;
  $('#actPrev').disabled = storyAct <= 1; $('#actNext').disabled = storyAct >= LAST_ACT;
  const grid = $('#wingGrid');
  grid.textContent = '';
  const onPage = WINGS.map((def, i) => ({ def, w: i + 1 })).filter((x) => (x.def.act || 1) === storyAct);
  onPage.forEach(({ def, w }) => {
    const locked = w > unlocked;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wing' + (locked ? ' locked' : '') + (progress.cleared.includes(w) ? ' cleared' : '') + (w === selectedWing ? ' selected' : '');
    b.dataset.wing = String(w);
    b.disabled = locked;
    b.innerHTML = '<span class="icon"></span><span class="num"></span><strong></strong><small></small>';
    b.querySelector('.icon').textContent = locked ? '🔒' : def.icon;
    b.querySelector('.num').textContent = String(w);
    b.querySelector('strong').textContent = def.name;
    b.querySelector('small').textContent = wingStatus(w);
    b.addEventListener('click', () => { selectedWing = w; renderStory(); $('#btnEnterWing').focus(); });
    grid.appendChild(b);
  });
  // Wings that are planned but not built yet: dim placeholders, so the page shows the act's full size.
  for (let k = onPage.length; k < WINGS_PER_ACT && storyAct > 1; k++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wing locked soon'; b.disabled = true;
    b.innerHTML = '<span class="icon">🔒</span><span class="num"></span><strong>Coming soon</strong><small>?</small>';
    b.querySelector('.num').textContent = String((storyAct - 1) * WINGS_PER_ACT + k + 1);
    grid.appendChild(b);
  }
  const def = WINGS[selectedWing - 1];
  const pageUnlocked = onPage.some(({ w }) => w <= unlocked);
  const nextLocked = WINGS[unlocked];   // the wing that unlocks next (undefined once every built wing is open)
  if (tester.on) $('#wingLock').textContent = 'TESTER mode: every wing is open. Runs here don’t unlock or clear anything.';
  else if (nextLocked && (nextLocked.act || 1) === storyAct) $('#wingLock').textContent = `🔒 Clear ${WINGS[unlocked - 1].name} to unlock ${nextLocked.name}.`;
  else if (!pageUnlocked) { const first = onPage[0].w; $('#wingLock').textContent = `🔒 Locked: clear ${WINGS[first - 2].name} (wing ${first - 1}) to open ${th.short}.`; }
  else $('#wingLock').textContent = '';
  if (!pageUnlocked) {   // a locked act page shows the act, not the last Act I wing that was selected
    const first = onPage[0].w;
    $('#wingName').textContent = `🔒 ${th.short} · ${th.name}`;
    $('#wingBlurb').textContent = th.blurb;
    $('#wingInfo').textContent = '';   // the lock line below already says what to clear
    $('#btnEnterWing').textContent = '🔒 Locked';
    $('#btnEnterWing').disabled = true;
    return;
  }
  $('#wingName').textContent = `${def.icon} Wing ${selectedWing}: ${def.name}`;
  $('#wingBlurb').textContent = def.blurb;
  const d1 = difficulty(selectedWing, 1);
  $('#wingInfo').textContent = selectedWing === 1
    ? `${roomsIn(1)} rooms · room ${eliteRoom(1)} is elite · a Rogue Author waits in room ${bossRoom(1)}`
    : `${roomsIn(selectedWing) !== roomsIn(1) ? `${roomsIn(selectedWing)} rooms · ` : ''}Enemies ×${d1.hpMult.toFixed(2)} tougher · ${Math.round(d1.eliteChance * 100)}% elites${d1.deathBurst ? ' · elites burst into pages' : ''}`;
  $('#btnEnterWing').textContent = `▶ Enter ${def.name}`;
  $('#btnEnterWing').disabled = selectedWing > unlocked;
}
// Swipe left / right on the wing map to change act (the arrow buttons do the same).
{
  let sx = 0, sy = 0, on = false;
  const st = $('#story');
  st.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; on = true; }, { passive: true });
  st.addEventListener('touchend', (e) => {
    if (!on) return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) setStoryAct(storyAct + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/** Run log (v1.14.0): append this run to `overdue.runs.v1` (newest 50). Never throws: a full or blocked store just skips it. */
function logRun(result) {
  try {
    const rec = buildRecord({ version: BUILD.version, mode: game.mode, wing: game.wingN, room: game.wave, result, killer: game.lastHit, elite: game.lastHitElite,
      perks: game.picks, banished: [...game.banished], cursed: game.picks.filter((id) => byId(id)?.kind === 'cursed'), doors: game.doorLog,
      reno: progress.reno, time: game.playTime, maxHp: stats.maxHp, counters: rl });
    game.lastRun = rec;
    let runs = []; try { runs = normalizeRuns(JSON.parse(localStorage.getItem(RUN_KEY))); } catch { /* none yet */ }
    localStorage.setItem(RUN_KEY, JSON.stringify(pushRun(runs, rec)));
  } catch { /* storage blocked or full */ }
}

/** Bank the run's fines once (game over, wing cleared, or quitting mid-run). */
function bankRun(result = 'q') {
  if (game.banked) return game.banked;
  logRun(result);
  const res = recordRun(progress, { fines: game.fines, mode: tester.on ? 'tester' : game.mode, wing: game.wingN, room: game.wave, cleared: game.wingCleared });
  progress = res.progress; saveProgress();
  game.banked = res;
  return res;
}
const inRun = () => ['playing', 'paused', 'upgrade', 'doors', 'waveclear', 'dying'].includes(game.state);

// ---- Progress tools (Settings): reset for a fresh start; debug helpers with ?debug=1 ----
$('#btnShowTips').addEventListener('click', () => { tips = normalizeTips(null); saveTips(); toast('Tips will show again'); });
// ---- Backup code (v1.13.1): copy all player keys as one code; restore validates fully before writing anything ----
const backupMsg = (t, bad = false) => { const m = $('#backupMsg'); m.textContent = t; m.style.color = bad ? '#ff8a9b' : ''; };
// ---- Share stats (v1.14.0): the on-device run log (`overdue.runs.v1`) as one OVS1: code. Not part of the backup code. ----
$('#btnShareStats').addEventListener('click', async () => {
  const btn = $('#btnShareStats'), say = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = 'Share stats'; }, 2400); };   // the label is the message: a toast would cover the settings
  let runs = []; try { runs = normalizeRuns(JSON.parse(localStorage.getItem(RUN_KEY))); } catch { /* none */ }
  const out = $('#statsOut');
  if (!runs.length) { out.hidden = true; say('No runs yet'); return; }
  const code = encodeStats(runs);
  out.value = code;
  try { await navigator.clipboard.writeText(code); out.hidden = true; say(`Copied ${runs.length} run${runs.length === 1 ? '' : 's'} ✓`); }
  catch { out.hidden = false; out.focus(); out.select(); say('Copy the code below'); }
});
let pendingRestore = null;
function readAllKeys() { const o = {}; for (const k of BACKUP_KEYS) { try { o[k] = localStorage.getItem(k); } catch { /* blocked */ } } return o; }
$('#btnBackup').addEventListener('click', () => { pendingRestore = null; $('#restoreConfirm').hidden = true; $('#backupOut').hidden = true; $('#backupIn').value = ''; backupMsg(''); showScreen('backup'); });
$('#btnCopyBackup').addEventListener('click', async () => {
  const code = encodeBackup(readAllKeys());
  const out = $('#backupOut'); out.value = code; out.hidden = false;
  try { await navigator.clipboard.writeText(code); backupMsg('Copied! Paste it somewhere safe.'); }
  catch { out.focus(); out.select(); backupMsg('Tap the code above, select all and copy it.'); }
});
$('#btnRestoreBackup').addEventListener('click', () => {
  const r = decodeBackup($('#backupIn').value);
  if (!r.ok) { pendingRestore = null; $('#restoreConfirm').hidden = true; backupMsg(r.error + ' Nothing was changed.', true); return; }
  pendingRestore = r.keys;
  $('#restoreWarn').textContent = `This replaces your progress on this phone with the backup (${describeBackup(r.keys)}).`;
  $('#restoreConfirm').hidden = false; backupMsg('');
});
$('#btnRestoreNo').addEventListener('click', () => { pendingRestore = null; $('#restoreConfirm').hidden = true; });
$('#btnRestoreYes').addEventListener('click', () => {
  if (!pendingRestore) return;
  const keys = pendingRestore; pendingRestore = null;
  // Already validated. Keys the code doesn't have are removed so the phone matches the backup exactly.
  try {
    for (const k of BACKUP_KEYS) { if (k in keys) localStorage.setItem(k, k === PROGRESS_KEY ? JSON.stringify(normalizeProgress(JSON.parse(keys[k]))) : keys[k]); else localStorage.removeItem(k); }
  } catch { backupMsg('Couldn’t write to this phone’s storage. Nothing may have changed.', true); return; }
  backupMsg('Restored! Reloading…'); $('#restoreConfirm').hidden = true;
  setTimeout(() => location.reload(), 700); // reload so every part of the game starts from the restored data
});

let resetArmedUntil = 0;
const btnReset = $('#btnResetProgress');
btnReset.addEventListener('click', () => {
  if (game.state !== 'title' && game.state !== 'gameover') { toast('Finish or quit this shift first'); return; }
  if (performance.now() > resetArmedUntil) {
    // Two taps: the first one only arms it, so a stray tap can't wipe anything.
    resetArmedUntil = performance.now() + 3000;
    btnReset.textContent = 'Tap again to erase progress';
    btnReset.classList.add('armed');
    setTimeout(() => { if (performance.now() > resetArmedUntil) { btnReset.textContent = 'Reset progress'; btnReset.classList.remove('armed'); } }, 3100);
    return;
  }
  resetArmedUntil = 0;
  progress = normalizeProgress(null); saveProgress();
  btnReset.textContent = 'Reset progress'; btnReset.classList.remove('armed');
  renderFineBadges(); sound.play('click'); toast('Progress reset: 0 fines, wing 1, no Renovations');
});
document.body.classList.toggle('debug', DEBUG);
$('#btnDebugFines').addEventListener('click', () => { progress = { ...progress, fines: progress.fines + 500 }; saveProgress(); renderFineBadges(); toast(`🪙 ${progress.fines} fines`); });
$('#btnDebugUnlock').addEventListener('click', () => { progress = { ...progress, unlocked: WINGS.length }; saveProgress(); toast('All wings unlocked'); });

function setSetting(k, v) {
  settings[k] = v;
  saveJSON(SETTINGS_KEY, settings);
  if (k === 'sfx') sound.setSfx(v);
  if (k === 'music') sound.setMusic(v);
  const box = document.querySelector(`#settings input[data-k="${k}"]`);
  if (box) box.checked = v;
}
document.querySelectorAll('#settings input[data-k]').forEach((box) => {
  box.checked = !!settings[box.dataset.k];
  box.addEventListener('change', () => setSetting(box.dataset.k, box.checked));
});

let toastTimer = 0;
function toast(msg, ms = 1600, low = false) {
  const el = $('#toast');
  if (game.state === 'gameover') return; // v1.12.1: toasts never sit on the end-screen headings
  el.textContent = msg; el.hidden = false; el.classList.toggle('low', low);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  sound.init(); sound.play('click');
  const act = b.dataset.act;
  if (act === 'play') startRun('endless');
  else if (act === 'again') startRun(game.mode, game.wingN);
  else if (act === 'guideskip') { if (game.guide && game.state === 'playing') endGuide(true); }
  else if (act === 'story') { selectedWing = defaultWing(); storyAct = actOf(selectedWing); renderStory(); showScreen('story'); }
  else if (act === 'actprev') setStoryAct(storyAct - 1);
  else if (act === 'actnext') setStoryAct(storyAct + 1);
  else if (act === 'enterwing') startRun('story', selectedWing);
  else if (act === 'nextwing') startRun('story', Math.min(WINGS.length, game.wingN + 1));
  else if (act === 'shop') { shopReturn = currentScreen || 'title'; renderShop(); showScreen('shop'); }
  else if (act === 'shopback') { if (shopReturn === 'story') renderStory(); showScreen(shopReturn); }
  else if (act === 'fullscreen') toggleFullscreen();
  else if (act === 'howto') showScreen('howto');
  else if (act === 'codex') { renderCodex(); showScreen('codex'); }
  else if (act === 'settings') { settingsReturn = game.state === 'paused' ? 'pause' : 'title'; showScreen('settings'); }
  else if (act === 'leaderboard') { showScreen('leaderboard'); loadLeaderboard($('#lbList')); }
  else if (act === 'backupback') showScreen('settings');
  else if (act === 'back') showScreen(game.state === 'paused' ? settingsReturn : 'title');
  else if (act === 'resume') resume();
  else if (act === 'quit' || act === 'menu') {
    // Quitting mid-run still banks what you earned: every run counts.
    if (act === 'quit' && inRun()) { const res = bankRun('q'); if (res.banked) setTimeout(() => toast(`🪙 +${res.banked} fines banked`), 50); }
    game.state = 'title'; sound.setIntensity(0); sound.setMuffled(false); clearWorld(); freeQueue.length = 0; hideFreePerk(); player = makePlayer(); showScreen('title');
  }
});

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      try { await screen.orientation.lock('landscape'); } catch { /* unsupported */ }
    }
  } catch { toast('Fullscreen isn\u2019t available here'); }
}

async function loadLeaderboard(list, highlight = null) {
  for (const h of document.querySelectorAll('.lb-title')) h.textContent = backend.label;
  list.textContent = '';
  const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Checking the records…'; list.appendChild(li);
  try {
    const rows = await backend.top(10);
    list.textContent = '';
    if (!rows.length) { li.textContent = 'No scores yet — be the first!'; list.appendChild(li); return; }
    rows.forEach((row, i) => {
      const el = document.createElement('li');
      if (highlight && row.name === highlight.name && row.score === highlight.score) el.className = 'me';
      const rank = document.createElement('span'); rank.textContent = `#${i + 1}`;
      const name = document.createElement('span'); name.textContent = row.name;
      const sc = document.createElement('span'); sc.textContent = `${row.score.toLocaleString()} · W${row.wave}`;
      el.append(rank, name, sc);
      list.appendChild(el);
    });
  } catch (err) {
    li.textContent = (err && err.message) || 'The Hall of Fame is unavailable right now.';
  }
}

// ---- Home Screen nudge (v1.13.1): once, after the first cleared wing or first run of 3+ minutes; never in an installed app ----
const isStandalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
function maybeNudge(won, playTime) {
  if (isStandalone() || tipSeen('a2hs') || tipSeen('a2hs-off') || !(won || playTime >= 180)) return false;
  markTip('a2hs'); // shown at most once, ever
  setTimeout(() => { if (game.state === 'gameover') $('#nudge').hidden = false; }, 700);
  return true;
}
const closeNudge = () => { $('#nudge').hidden = true; };
$('#btnNudgeOk').addEventListener('click', closeNudge);
$('#btnNudgeOff').addEventListener('click', () => { markTip('a2hs-off'); closeNudge(); });
const BEST_KEY = 'overdue.best.v1';
function showGameOver() {
  const story = isStory(), won = story && game.wingCleared;
  const res = bankRun(won ? 'c' : 'd');
  game.state = 'gameover';
  sound.setMuffled(true);
  if (won) sound.play('wave');
  markTip('firstrun'); if (!story) markTip('endless-run'); updateFirstHint(); freeQueue.length = 0; hideFreePerk();
  const score = Math.floor(game.score);
  // Personal best + Hall of Fame stay endless-only, so the numbers keep meaning the same thing.
  const best = loadJSON(BEST_KEY);
  const isBest = !story && score > (best.score || 0);
  if (isBest) saveJSON(BEST_KEY, { score, wave: game.wave });
  $('#goTitle').textContent = won ? `${wingDef().name}: cleared!` : 'Shift over';
  $('#goSub').textContent = won ? wingDef().cleared : ''; $('#goSub').hidden = !won;
  $('#goStats').innerHTML = '';
  const fineLine = `+${res.banked.toLocaleString()} 🪙${res.firstClear ? ' (first clear!)' : ''}`;
  const rows = [
    ...(story ? [['Wing', `${game.wingN} · ${wingDef().name}`], ['Room reached', won ? `${roomsIn(game.wingN)}/${roomsIn(game.wingN)} ✓` : `${game.wave}/${roomsIn(game.wingN)}`]] : []),
    ['Fines banked', fineLine], ['Fines to spend', `${progress.fines.toLocaleString()} 🪙`],
    ...(res.unlockedWing ? [['Unlocked', `🔓 Wing ${res.unlockedWing}: ${WINGS[res.unlockedWing - 1].name}`]] : []),
    ...(story ? [] : [['Score', score.toLocaleString() + (isBest ? ' ★ new personal best' : '')]]),
    ...(story ? [] : [['Wave reached', game.wave]]), ['Disturbances shushed', game.kills], ['Best combo', game.bestCombo],
    ['Time on shift', `${Math.floor(game.playTime / 60)}m ${Math.floor(game.playTime % 60)}s`],
    ...(Object.keys(game.owned).length ? [] : [['Perks', 'none']]),
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = String(v);
    $('#goStats').append(dt, dd);
  }
  const form = $('#scoreForm');
  form.hidden = story;
  $('#submitMsg').textContent = story ? 'Story runs aren’t ranked. Endless shift scores go to the Hall of Fame.' : '';
  const nextBtn = $('#btnNextWing');
  nextBtn.hidden = !(won && game.wingN < WINGS.length);
  if (!nextBtn.hidden) nextBtn.textContent = `▶ Wing ${game.wingN + 1}: ${WINGS[game.wingN].name}`;
  $('#btnAgain').textContent = story ? (won ? '↻ Replay wing' : '↻ Retry wing') : '↻ Another shift';
  $('#btnAgain').classList.toggle('primary', nextBtn.hidden);
  $('#nameInput').value = loadJSON('overdue.name.v1').name || '';
  renderBuild($('#goBuild'));
  $('#goBoard').hidden = story;
  $('#toast').hidden = true; clearTimeout(toastTimer);
  showScreen('gameover');
  if (!story) loadLeaderboard($('#goList'));
  maybeNudge(won, game.playTime);
  if (!touch.enabled) (story ? (nextBtn.hidden ? $('#btnAgain') : nextBtn) : $('#nameInput')).focus();
}

$('#scoreForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#nameInput').value.trim();
  const msg = $('#submitMsg');
  if (!/^[A-Za-z0-9 _-]{1,12}$/.test(name)) { msg.textContent = 'Name: 1–12 letters, numbers, spaces, _ or -'; return; }
  saveJSON('overdue.name.v1', { name });
  const payload = { name, score: Math.floor(game.score), wave: game.wave, kills: game.kills, durationMs: Math.floor(game.playTime * 1000) };
  const btn = e.submitter || $('#scoreForm button');
  btn.disabled = true; msg.textContent = 'Filing your record…';
  try {
    const res = await backend.submit(payload);
    msg.textContent = res.message;
    $('#scoreForm').hidden = true;
    loadLeaderboard($('#goList'), payload);
  } catch (err) {
    msg.textContent = `Couldn't submit: ${err.message}`;
  } finally { btn.disabled = false; }
});

// ======================================================================
// Main loop (fixed 120 Hz simulation, render every animation frame)
// ======================================================================
const STEP = 1 / 120;
let last = performance.now(), acc = 0, fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  if (debugFreeze) { last = now; render(); return; } // debug: simulation frozen, still drawing (art screenshots)
  if (botDrive) { last = now; return; } // balance bot steps the simulation itself, faster than real time
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 1e-3), 0.05);
  pollGamepad();
  if (game.state === 'playing' || game.state === 'waveclear' || game.state === 'dying') {
    acc += dt;
    while (acc >= STEP) { acc -= STEP; step(STEP); }
  } else {
    acc = 0;
    game.time += dt;
    updateParticles(dt);
  }
  render();
}

applyLayout(true);
// ---- Version label + "update available" ----
const drawVersionLabels = () => document.querySelectorAll('.version-label').forEach((el) => {
  el.textContent = versionLabel();
  if (tester.on) { const t = document.createElement('span'); t.className = 'tester-tag'; t.textContent = 'TESTER'; el.appendChild(t); }
});
drawVersionLabels();
// Tester switch: 7 quick taps on the title's version line.
{
  let taps = 0, last = 0;
  const el = document.querySelector('#title .version-label');
  el.addEventListener('click', () => {
    const now = performance.now();
    taps = now - last < 1500 ? taps + 1 : 1; last = now;
    if (taps < 7) return;
    taps = 0;
    tester = { on: !tester.on };
    saveJSON(TESTER_KEY, tester);
    drawVersionLabels();
    toast(tester.on ? 'Tester mode on' : 'Tester mode off');
  });
}
let updateOffered = false;
async function checkForUpdate() {
  if (updateOffered || BUILD.commit === 'local') return;
  const live = await fetchLatestBuild();
  if (!live || live.commit === BUILD.commit) return;
  updateOffered = true;
  swReg?.update().catch(() => {}); // fetch the new build in the background so the tap is instant
  const bar = $('#updateBar');
  bar.textContent = `🔄 New version v${live.version} (${live.commit}) — tap to update`;
  bar.hidden = false;
}
// ---- Offline play (v1.13.1): a service worker caches the game. Only real builds register one (BUILD.sw), never dev or the claude.ai fragment. ----
let swReg = null;
if ('serviceWorker' in navigator && BUILD.sw === true) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => { swReg = r; }).catch(() => { /* offline play just isn't available */ });
} else if ('serviceWorker' in navigator && BUILD.sw === false && BUILD.commit !== 'local') {
  // Kill switch build: remove any worker + caches left by earlier releases.
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => k.startsWith('overdue-') && caches.delete(k))).catch(() => {});
}
/** Switch to the newest build: let the waiting worker take over (it already holds the new page), then reload. */
async function applyUpdate() {
  try {
    const reg = swReg || (await navigator.serviceWorker?.getRegistration());
    if (reg) {
      await reg.update().catch(() => {});
      if (reg.installing) await new Promise((res) => { const w = reg.installing; const t = setTimeout(res, 8000); w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'activated' || w.state === 'redundant') { clearTimeout(t); res(); } }); });
      if (reg.waiting) {
        await new Promise((res) => { const t = setTimeout(res, 3000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); res(); }, { once: true }); reg.waiting.postMessage('skipWaiting'); });
      }
    }
  } catch { /* fall back to a plain reload */ }
  location.reload();
}
$('#updateBar').addEventListener('click', () => {
  // Never yank a run out from under the player: only reload outside of play.
  if (game.state === 'playing' || game.state === 'waveclear' || game.state === 'dying') { toast('Finish or pause this shift first'); return; }
  applyUpdate();
});
setTimeout(checkForUpdate, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
setInterval(() => { if (game.state === 'title' || game.state === 'gameover' || game.state === 'paused') checkForUpdate(); }, 10 * 60 * 1000);
// iPhones have no Fullscreen API: hide the button rather than show one that does nothing.
if (!document.fullscreenEnabled) document.querySelectorAll('.fs-only').forEach((el) => el.remove());
updateSourceBadge();
updateFirstHint();
showScreen('title');
document.body.classList.add('ready');
requestAnimationFrame(frame);

// Test hooks (only with ?debug) — used by the automated Playwright smoke test.
if (DEBUG) {
  window.__overdue = {
    game, get bg() { return bg; }, get arena() { return arena; }, get tester() { return tester; }, get cats() { return cats; }, grid: () => `${COLS}x${ROWS}`, get player() { return player; }, counts: () => ({ books: books.length, hazards: hazards.length, rings: rings.length, particles: particles.length, texts: texts.length, flashes: flashes.length, enemies: enemies.length }), get stats() { return stats; }, enemies, get content() { return content; },
    fire, damageEnemy, orbiterPositions, consts: { STORY_ENEMY_SCALE, ORBIT_RADIUS, ORBIT_SCALE, BOSS_TRANS, MARGIN_SIDE, MARGIN_WIDE },   // QA only (v1.15.1 look & feel checks)
    get waterHunt() { return waterHunt; }, materialise, makeEnemy, freeze: (on) => { debugFreeze = !!on; }, startRun: (m, w) => startRun(m, w, { noGuide: true }), startWave, get guide() { return game.guide; }, tipsSeen: () => tips.seen.slice(), setSurviveT: (t) => { game.surviveT = t; }, killAll: () => { for (const e of [...enemies]) killEnemy(e, 'cleanup'); spawnQueue.length = 0; telegraphs.length = 0; },
    get progress() { return progress; }, setFines: (n) => { progress = { ...progress, fines: n }; saveProgress(); renderFineBadges(); },
    unlockAll: () => { progress = { ...progress, unlocked: WINGS.length }; saveProgress(); },

    god: () => { player.hp = 999; stats.maxHp = 999; },
    grant: (id) => { const u = UPGRADES.find((x) => x.id === id); game.owned[id] = (game.owned[id] || 0) + 1; game.picks.push(id); u.apply(stats, player); },
    get statusMetrics() { return sm; }, zaps, statusSprite, get runCounters() { return rl; }, get lastRun() { return game.lastRun; }, ui: () => ({ uiK, viewScale, dpr, W, H, UW, UH }),
    showCards: (ids) => renderCards(ids.map(byId)),
    showFreePerk: (id, label) => { queueFreePerk(byId(id), label); flushFreePerks(); }, showUpgrades, showDoors, nextRoom, texts, get cursedOffer() { return game.cursedOffer; }, takeCursed: (take) => { cardsArmedAt = 0; resolveCursedOffer(take); }, get rareId() { return game.rareId; }, get door() { return game.door; },
    // isSolid = what WALKERS can't enter (shelves + Act II water): bot steering and QA
    // ---- balance bot (scripts/balance.mjs): drives the sim headless, faster than real time ----
    actions, hazards, STEP, books, touch, settings, setSetting, get W() { return W; }, get H() { return H; }, isSolid: (x, y) => isSolidPx(walkGrid(), x, y), setAimVariant: (v) => { aimVariant = v; autoTarget = null; }, setSolid: (x, y, v) => { const [cx, cy] = cellOf(x, y); arena.solid[cy * COLS + cx] = v ? 1 : 0; },
    get choices() { return currentChoices; }, get doors() { return currentDoors; },
    setBotInput: (mv) => { botInput = mv; }, drive: (on) => { botDrive = !!on; if (!on) botInput = null; },
    stepN: (n) => { for (let i = 0; i < n; i++) step(STEP); },
    pickCard: (i) => { cardsArmedAt = 0; document.querySelectorAll('#cards .card')[i]?.click(); },
    pickDoor: (id) => { cardsArmedAt = 0; chooseDoor(id); },
    maybeNudge: (won, secs) => maybeNudge(won, secs), isStandalone,
    setProgress: (raw) => { progress = normalizeProgress(raw); saveProgress(); }, setRenews: (n) => { game.renews = n; }, die: () => { player.hp = 1; player.inv = 0; hurtPlayer(player.x + 1, player.y); },
  };
}
