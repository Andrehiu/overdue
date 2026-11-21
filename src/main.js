// OVERDUE! — Night Shift at the Meme Library
// Engine: fixed-timestep loop, flow-field AI, dynamic lighting, procedural audio, roguelite perks.
import { W, H, CELL, COLS, ROWS, SAFE, PORTRAIT, setGrid, gridForAspect, generateArena, isSolidPx, cellOf, edgeCells, idx } from './arena.js';
import { createBackend } from './backend.js';
import { BUILD, versionLabel, fetchLatestBuild } from './version.js';
import { CATALOGUE } from './catalogue.js';
import { computeFlowField, lineOfSight } from './flowfield.js';
import { composeWave } from './waves.js';
import { baseStats, rollUpgrades, UPGRADES, byId, masterworkFor, gainText, comboPartners, combosInReach, pips, buildChips } from './upgrades.js';
import { Rng, clamp, lerp, TAU, hashString, angleDiff, pushCircleOutOfRect, cornerAssist } from './util.js';
import { PLAYER, bookLook } from './palette.js';
import { SoundEngine } from './audio.js';
import { WINGS, ROOMS_PER_WING, BOSS_ROOM, ELITE_ROOM, difficulty, composeRoom, layoutSeed } from './story.js';
import { DOORS, doorOffer, applyDoor, doorReward, mysteryPrize } from './doors.js';
import { PROGRESS_KEY, RENOVATIONS, normalizeProgress, applyRenovations, runBonuses, recordRun, level, nextCost, canBuy, buy } from './meta.js';

// ======================================================================
// Setup, settings, content
// ======================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');

const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const SETTINGS_KEY = 'overdue.settings.v1';
const settings = Object.assign({ sfx: true, music: true, lights: true, motion: true, autofire: false }, loadJSON(SETTINGS_KEY));

const sound = new SoundEngine();
sound.sfxOn = settings.sfx; sound.musicOn = settings.music;

const content = CATALOGUE;

// Late fees: permanent progression (fines + Renovations + story unlocks). Its own key; no old save is touched.
let progress = normalizeProgress(loadJSON(PROGRESS_KEY));
const saveProgress = () => saveJSON(PROGRESS_KEY, progress);
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
const isPortraitScreen = () => innerHeight > innerWidth * 1.15;
/** Pick the arena shape for the current screen. Only called between runs. */
function applyLayout(force = false) {
  const [cols, rows] = gridForAspect(innerWidth / innerHeight);
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
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  stage.style.setProperty('--ui-scale', String(Math.max(0.55, Math.min(1.25, scale))));
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
addEventListener('resize', () => {
  // Re-shape the arena on rotation only while no run is in progress.
  if (game.state === 'title' || game.state === 'gameover') applyLayout(); else resize();
  updateRotateOverlay(true);
});

// ======================================================================
// Input: keyboard + mouse, touch (virtual stick), gamepad
// ======================================================================
const keys = new Set();
const actions = { dash: false, shhh: false };
const mouse = { x: W / 2, y: H / 2, down: false, seen: false };
const touch = { enabled: false, moveId: null, mx0: 0, my0: 0, mx: 0, my: 0, aimId: null, ax: 0, ay: 0 };
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
    else if (touch.aimId === null) { touch.aimId = e.pointerId; touch.ax = p.x; touch.ay = p.y; }
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
  owned: {}, noHitWave: true, clearT: 0, boss: null, deathT: 0, waveT: 0, ammoT: 0, ammo: null,
  mode: 'endless', wingN: 1, diff: null, fines: 0, cards: 3, banked: null, wingCleared: false,
  door: null, bonusPicks: 0, pickIsBonus: false,
};
let stats = baseStats();
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
function startRun(mode = 'endless', wing = 1) {
  sound.init();
  keepAwake();
  applyLayout();
  game.seed = (Math.random() * 1e9) | 0;
  rng = new Rng(game.seed);
  const bonus = runBonuses(progress);
  Object.assign(game, { wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, playTime: 0, owned: {}, renews: bonus.renews, banishes: bonus.banishes, banished: new Set(),
    freeze: 0, timeScale: 1, trauma: 0, flash: 0, boss: null, mode, wingN: mode === 'story' ? clamp(wing, 1, WINGS.length) : 1, diff: null,
    fines: 0, cards: bonus.cards, banked: null, wingCleared: false, door: null, bonusPicks: 0, pickIsBonus: false });
  stats = applyRenovations(baseStats(), progress);
  player = makePlayer();
  player.hp = stats.maxHp;
  player.revives = bonus.revives;
  // Head Start: free random perks (never specials) before room/wave 1.
  const head = bonus.startPerks ? rollUpgrades(rng, game.owned, bonus.startPerks, rollOpts({ noSpecial: true })) : [];
  for (const u of head) { game.owned[u.id] = (game.owned[u.id] || 0) + 1; u.apply(stats, player); }
  startWave(1);
  if (head.length) toast(`🎒 Head Start: ${head.map((u) => u.name).join(' + ')}`);
}

function clearWorld() {
  for (const arr of [enemies, books, hazards, rings, telegraphs, pickups, particles, texts, flashes]) arr.length = 0;
  spawnQueue = [];
  game.boss = null; game.bannerT = 0; bannerQueue.length = 0;
}

function startWave(n) {
  game.wave = n;
  clearWorld();
  game.diff = isStory() ? applyDoor(difficulty(game.wingN, n), game.door) : null;
  // Story rooms keep the same shelf layout every time you play them, like handmade levels.
  arena = isStory() ? generateArena(layoutSeed(game.wingN, n), n, game.diff.shelvesPerHalf) : generateArena(game.seed, n);
  buildBackground();
  flowCell = -1;
  player.x = W / 2; player.y = H / 2; player.vx = player.vy = 0;
  spawnQueue = (isStory() ? composeRoom(game.wingN, n, rng, game.diff) : composeWave(n, rng)).spawns;
  game.waveT = 0; game.noHitWave = true; game.boss = null;
  game.ammo = pickBook(); game.ammoT = 0;
  player.dashStock = stats.dashCharges; player.dashCd = 0; player.amnesty = stats.amnesty;
  if (isStory()) {
    const kind = game.diff.kind;
    banner(`ROOM ${n}/${ROOMS_PER_WING}`, kind === 'boss' ? 'A rogue author approaches…' : kind === 'elite' ? '★ Elite room: they fight back' : DOORS[game.door]?.banner || wingDef().name);
  } else banner(`WAVE ${n}`, n % 5 === 0 ? 'A rogue author approaches…' : '');
  sound.setIntensity(1); sound.setMuffled(false);
  game.state = 'playing';
  showScreen(null);
}

// One big banner at a time: later ones wait their turn instead of stacking.
const bannerQueue = [];
function banner(text, sub = '') {
  if (game.bannerT > 0.5 && game.banner !== text) { if (bannerQueue.length < 3) bannerQueue.push([text, sub]); return; }
  game.banner = text; game.bannerSub = sub; game.bannerT = 2.4;
}

function waveCleared() {
  const bonus = Math.round((250 * game.wave + (game.noHitWave ? 500 : 0)) * stats.scoreMult);
  game.score += bonus;
  // Fines for the clear: story rooms pay by room type; endless pays more every 5 waves and for bosses.
  const fine = isStory() ? doorReward(game.wingN, game.wave, game.door) : 1 + Math.floor(game.wave / 5) + (game.wave % 5 === 0 ? 15 : 0);
  game.fines += fine;
  const wingDone = isStory() && game.wave >= BOSS_ROOM;
  banner(wingDone ? 'WING CLEARED!' : 'SHELF CLEARED!', `+${bonus.toLocaleString()} · +${fine} 🪙${game.noHitWave ? ' · flawless!' : ''}`);
  if (stats.regenPerWave && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + stats.regenPerWave);
    floatText(player.x, player.y - 24, '+1 ♥ Lifetime Membership', '#ff6b81', 13, 1.4);
  }
  // Reading break after the elite room: a heart back before the second half of the wing.
  if (isStory() && game.wave === ELITE_ROOM && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + 1);
    floatText(player.x, player.y - 40, '+1 ♥ Reading break', '#ff6b81', 13, 1.4);
  }
  if (isStory() && game.door === 'mystery') resolveMystery();
  game.wingCleared = wingDone;
  sound.play('wave');
  for (const h of hazards) burst(h.x, h.y, 3, ['#ff6b6b', '#fff'], 60, 0.3);
  hazards.length = 0; rings.length = 0;
  game.state = 'waveclear';
  game.clearT = wingDone ? 2.6 : 1.8;
  // Vacuum up leftover pickups for convenience.
  for (const p of pickups) p.magnet = true;
}

/** Mystery Shelf prize: 50% a cursed book you don't own (applied now), otherwise a bonus perk pick before the normal one. */
function resolveMystery() {
  const prize = mysteryPrize(game.seed, game.wingN, game.wave, game.owned, { banned: game.banished, lights: settings.lights });
  if (prize.kind === 'cursed') {
    const u = byId(prize.id);
    game.owned[u.id] = 1; u.apply(stats, player);
    toast(`🎲 Mystery Shelf: ${u.icon} ${u.name}! ${u.desc}`);
    sound.play('upgrade');
  } else {
    game.bonusPicks++;
    toast('🎲 Mystery Shelf: a bonus perk!');
  }
}

function showUpgrades() {
  game.state = 'upgrade';
  game.bannerT = 0; texts.length = 0;
  sound.setMuffled(true);
  const bonus = game.bonusPicks > 0;
  if (bonus) game.bonusPicks--;
  game.pickIsBonus = bonus;
  const choices = rollUpgrades(rng, game.owned, game.cards || 3, rollOpts());
  if (!choices.length) return bonus ? showUpgrades() : nextRoom();
  $('#upgradeTitle').textContent = bonus ? '🎲 Mystery Shelf — bonus perk' : isStory() ? `Room ${game.wave}/${ROOMS_PER_WING} cleared — choose a perk` : `Wave ${game.wave} cleared — choose a perk`;
  renderCards(choices);
  showScreen('upgrade');
  if (!touch.enabled) $('#cards button').focus();
}

/** After a perk pick: a bonus pick first if one is owed, then (story) the door screen, then the next room. */
function afterPick() {
  if (game.pickIsBonus) { game.pickIsBonus = false; return showUpgrades(); }
  nextRoom();
}

function nextRoom() {
  game.pickIsBonus = false;
  const full = player.hp >= stats.maxHp;
  const offer = isStory() ? doorOffer(game.seed, game.wingN, game.wave, { atFullHp: full }) : [];
  if (!offer.length) { game.door = null; return startWave(game.wave + 1); }
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
  $('#doorsTitle').textContent = `Room ${game.wave}/${ROOMS_PER_WING} cleared — ${offer.length > 1 ? 'pick your next door' : 'the next door'}`;
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
  const d = DOORS[id];
  game.door = id;
  sound.play('click');
  startWave(game.wave + 1);
  // Break Room: a heart back on entering (never above max).
  if (d.heal && player.hp < stats.maxHp) {
    player.hp = Math.min(stats.maxHp, player.hp + d.heal);
    floatText(player.x, player.y - 24, `+${d.heal} ♥ Break Room`, '#ff6b81', 13, 1.4);
  }
}

const KIND_LABEL = { combo: 'Collected Works', cursed: 'Banned', master: 'Masterwork' };

// ---- Codex: what this player has ever seen / discovered (per device) ----
const CODEX_KEY = 'overdue.codex.v1';
const codex = (() => { const c = loadJSON(CODEX_KEY); return { seen: new Set(c.seen || []), found: new Set(c.found || []) }; })();
const saveCodex = () => saveJSON(CODEX_KEY, { seen: [...codex.seen], found: [...codex.found] });

// Cards ignore taps for a moment after appearing, so a thumb still steering can't pick one by accident.
let cardsArmedAt = 0;
const cardsArmed = () => performance.now() >= cardsArmedAt;

let currentChoices = [];
function rollOpts(extra = {}) { return { lights: settings.lights, banned: game.banished, ...extra }; }

function renderCards(choices) {
  currentChoices = choices;
  const box = $('#cards');
  box.textContent = '';
  cardsArmedAt = performance.now() + 550;
  box.classList.remove('dealing'); void box.offsetWidth; box.classList.add('dealing');
  choices.forEach((u, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'card-wrap';
    const b = document.createElement('button');
    b.className = `card ${u.kind}`;
    const lvl = (game.owned[u.id] || 0) + 1;
    b.innerHTML = '<span class="key"></span><span class="stamp"></span><span class="icon"></span><strong></strong><span class="gain"></span><span class="hint"></span><span class="lvl"></span>';
    b.querySelector('.key').textContent = String(i + 1);
    b.querySelector('.icon').textContent = u.icon;
    b.querySelector('.stamp').textContent = KIND_LABEL[u.kind] || '';
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
    b.querySelector('.lvl').textContent = u.kind === 'combo'
      ? `${u.requires.map((r) => byId(r).name).join(' + ')}`
      : u.kind === 'master' ? `${byId(u.requires[0]).name} mastered`
        : u.max > 1 ? `${pips(lvl, u.max)}${mw ? `  Unlocks ${mw.name}` : ''}` : 'One-time';
    if (mw) b.classList.add('finale');
    if (!codex.seen.has(u.id)) { b.classList.add('new'); codex.seen.add(u.id); }
    b.addEventListener('click', () => {
      if (!cardsArmed() || game.state !== 'upgrade') return;
      game.owned[u.id] = lvl;
      u.apply(stats, player);
      sound.play('upgrade');
      if (u.kind === 'combo' || u.kind === 'master') { codex.found.add(u.id); saveCodex(); }
      if (u.kind === 'combo') toast(`📚 ${u.name} added to your Collected Works`);
      else if (u.kind === 'master') toast(`🏆 Masterwork: ${u.name}`);
      else if (mw) toast(`🏆 ${u.name} mastered! ${mw.name} will be offered next`);
      afterPick();
    });
    wrap.appendChild(b);
    // Banish: remove a normal perk from this run's pool, and deal a replacement.
    if (game.banishes > 0 && (u.kind === 'perk' || u.kind === 'cursed')) {
      const x = document.createElement('button');
      x.className = 'banish';
      x.type = 'button';
      x.textContent = '✕ Banish';
      x.title = `Never offer ${u.name} again this run`;
      x.addEventListener('click', () => {
        if (!cardsArmed() || !(game.banishes > 0)) return;
        game.banishes--; game.banished.add(u.id);
        const keep = new Set(currentChoices.map((c) => c.id));
        const [repl] = rollUpgrades(rng, game.owned, 1, rollOpts({ exclude: keep, noSpecial: true }));
        const next = currentChoices.slice();
        if (repl) next[i] = repl; else next.splice(i, 1);
        sound.play('click');
        toast(`✕ ${u.name} banished for this run`);
        renderCards(next);
        cardsArmedAt = performance.now() + 150;
      });
      wrap.appendChild(x);
    } else {
      const slot = document.createElement('span'); slot.className = 'banish-slot'; slot.setAttribute('aria-hidden', 'true'); wrap.appendChild(slot);
    }
    box.appendChild(wrap);
  });
  saveCodex();
  const renew = $('#btnRenew');
  renew.hidden = !(game.renews > 0);
  renew.textContent = `↻ Renew (${game.renews || 0})`;
  renderBuild($('#buildStrip'), choices);
}

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
    item.className = `build-item ${c.kind}${c.linked ? ' linked' : ''}`;
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
function renderCodex() {
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
const DEF = {
  bunny: { r: 11, hp: 2, speed: 88, score: 50 },
  notice: { r: 10, hp: 1, speed: 150, score: 70 },
  patron: { r: 14, hp: 5, speed: 70, score: 150 },
  worm: { r: 9, hp: 2, speed: 105, score: 40 },
  golem: { r: 22, hp: 14, speed: 42, score: 300 },
  coin: { r: 7, hp: 1, speed: 140, score: 20 },
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
    score: d.score, t: Math.random() * 10, stun: 0, flash: 0, dead: false, leader: null, atkT: 1.5 + Math.random() * 1.5, orbitHit: 0, ...extra };
  // Elites: bigger, ~2.2x HP, worth double, and they fire aimed pages (story mode).
  if (e.elite) {
    e.hp = e.maxHp = Math.max(2, Math.round(e.hp * 2.2));
    e.r = Math.round(e.r * 1.25); e.score *= 2;
    e.shootT = 1.2 + Math.random() * (game.diff ? game.diff.eliteShootEvery : 3);
  }
  enemies.push(e);
  return e;
}

function spawnPoint() {
  const cells = edgeCells(arena.solid);
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
    const p = s.type === 'boss' ? { x: W / 2, y: 130 } : spawnPoint();
    telegraphs.push({ type: s.type, x: p.x, y: p.y, t: 0, dur: s.type === 'boss' ? 1.6 : 0.85, elite: !!s.elite });
    sound.play('spawn');
  }
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const tg = telegraphs[i];
    tg.t += dt;
    if (tg.t >= tg.dur) {
      telegraphs.splice(i, 1);
      materialise(tg.type, tg.x, tg.y, tg.elite);
    }
  }
}

function materialise(type, x, y, elite = false) {
  if (type !== 'boss') { x += (Math.random() - 0.5) * 8; y += (Math.random() - 0.5) * 8; }
  burst(x, y, 14, elite ? ['#ffd54a', '#fff'] : ['#b48cff', '#fff'], 120, 0.5);
  if (type === 'worm') {
    const headHp = game.diff ? 4 * (1 + game.wave * 0.08) * (1 + 0.22 * (game.wingN - 1)) : 4 * (1 + game.wave * 0.08);
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
    sound.play('boss'); sound.setIntensity(2);
    shake(0.7);
  } else makeEnemy(type, x, y, elite ? { elite: true } : {});
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
  texts.push({ x: clamp(x, 70, W - 70), y: Math.max(y, game.boss && PORTRAIT ? 120 : 78), text, color, size, life, max: life, vy: -40 });
}
function particle(p) { if (particles.length < 320) particles.push(p); }
function burst(x, y, n, colors, speed = 160, life = 0.6, shape = 'sq') {
  if (particles.length > 160) n = Math.ceil(n * (particles.length > 240 ? 0.25 : 0.5));
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
  if (game.state !== 'dying') game.timeScale = Math.min(1, game.timeScale + dt * 2);
  const sdt = dt * game.timeScale;
  if (game.state === 'playing' || game.state === 'waveclear') game.playTime += dt;
  game.trauma = Math.max(0, game.trauma - dt * 1.5);
  game.flash = Math.max(0, game.flash - dt * 2.5);
  game.bannerT = Math.max(0, game.bannerT - dt);
  if (game.bannerT <= 0 && bannerQueue.length) { const [t, sb] = bannerQueue.shift(); banner(t, sb); }

  if (game.state === 'playing') updateSpawning(sdt);
  if (game.state !== 'dying') updatePlayer(sdt);
  updateFlow(dt);
  updateEnemies(sdt);
  updateBooks(sdt);
  updateOrbiters(sdt);
  updateHazards(sdt);
  updateRings(sdt);
  updatePickups(sdt);
  updateParticles(sdt);

  if (game.comboT > 0) { game.comboT -= sdt; if (game.comboT <= 0) game.combo = 0; }
  game.ammoT += sdt;
  if (game.ammoT > 7) { game.ammoT = 0; game.ammo = pickBook(); }

  if (game.state === 'playing' && !spawnQueue.length && !telegraphs.length && !enemies.length) waveCleared();
  if (game.state === 'waveclear') { game.clearT -= dt; if (game.clearT <= 0) (game.wingCleared ? showGameOver() : showUpgrades()); }
  if (game.state === 'dying') { game.deathT -= dt; if (game.deathT <= 0) showGameOver(); }
  actions.dash = actions.shhh = false;
}

function moveInput() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (pad.connected && (pad.mx || pad.my)) { x = pad.mx; y = pad.my; }
  if (touch.moveId !== null) { x = (touch.mx - touch.mx0) / 45; y = (touch.my - touch.my0) / 45; }
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

function nearestEnemy(x, y, maxD = Infinity) {
  let best = null, bd = maxD * maxD;
  for (const e of enemies) {
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
  // Aim: gamepad stick > touch aim > auto-aim (touch) > mouse
  let firing = false;
  if (pad.connected && (pad.ax || pad.ay)) { p.aim = Math.atan2(pad.ay, pad.ax); firing = pad.fire; }
  else if (touch.aimId !== null) { p.aim = Math.atan2(touch.ay - p.y, touch.ax - p.x); firing = true; }
  else if (touch.enabled || (pad.connected && !mouse.seen)) {
    const t = nearestEnemy(p.x, p.y, PORTRAIT ? 600 : 460);
    if (t) { p.aim = Math.atan2(t.y - p.y, t.x - p.x); firing = true; }
  } else {
    p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    firing = mouse.down;
  }
  if (pad.fire) firing = true;
  if (settings.autofire && enemies.length) firing = true;
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
        damageEnemy(e, stats.damage * stats.dashDamage, p.dx * 260, p.dy * 260, true);
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
  if (p.dashT <= 0) for (const rect of arena.rects) cornerAssist(p, { x: px, y: py }, PLAYER_WALL_R, rect, 8, 3);
  collideWorld(p, PLAYER_WALL_R);
  p.walk += Math.hypot(p.vx, p.vy) * dt * 0.08;
  for (let i = p.trail.length - 1; i >= 0; i--) if ((p.trail[i].life -= dt) <= 0) p.trail.splice(i, 1);

  p.fireT -= dt;
  p.nookOn = stats.nook > 0 && nextToShelf(p);
  p.streak = firing ? p.streak + dt : 0;
  p.inZone = stats.zone && p.streak > 2;
  const rate = stats.fireRate * (p.rapidT > 0 ? 2 : 1) * (p.nookOn ? 1 + stats.nook : 1) * (p.inZone ? 2 : 1);
  if (firing && p.fireT <= 0) { p.fireT = 1 / rate; fire(); }
}

function collideWorld(o, r) {
  let hit = null;
  for (const rect of arena.rects) {
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
    books.shift();
  }
  const book = game.ammo || pickBook();
  books.push({ x, y, vx: Math.cos(a) * stats.projSpeed, vy: Math.sin(a) * stats.projSpeed,
    r: 6, life: stats.bookLife, rot: a, dmgMult: 1, scale: 1, spin: (Math.random() < 0.5 ? -1 : 1) * 14, bounces: stats.bounces, pierce: stats.pierce,
    wraps: stats.wraps, child: false, hit: new Set(), color: PLAYER.book, title: book.title,
    look: extra.color || extra.child ? null : currentLook, ...extra });
}

let currentLook = bookLook({});
function fire() {
  const p = player, n = stats.projectiles;
  currentLook = bookLook(game.owned); // perks change how books look (cheap: a few flags per throw)
  p.throws++;
  for (let i = 0; i < n; i++) {
    const a = p.aim + (i - (n - 1) / 2) * stats.spread + (Math.random() - 0.5) * 0.04;
    spawnBook(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a);
  }
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
function inkBurst(x, y, radius, dmg, color = '#e8d9b0') {
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius + e.r) damageEnemy(e, dmg, ((e.x - x) / (d || 1)) * 120, ((e.y - y) / (d || 1)) * 120, false);
  }
  burst(x, y, 7, [color, '#3a2a1a'], 140, 0.35);
  pages(x, y, 3);
  rings.push({ x, y, r: 4, max: radius, speed: radius * 6, friendly: true, life: 1, faint: true, color: '255,184,107' });
  addLight(x, y, radius * 1.2, 0.18, color);
  sound.play('hit', 0.7);
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
      e.stun = e.type === 'boss' ? 0.4 : 1.5;
      damageEnemy(e, 1, 0, 0, false);
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
    flow = computeFlowField(arena.solid, COLS, ROWS, cx, cy);
    flowCell = c; flowT = 0.5;
  }
}

/** Direction toward the player: straight line if visible, otherwise follow the flow field. */
function seek(e) {
  const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
  if (lineOfSight(arena.solid, COLS, ROWS, CELL, e.x, e.y, player.x, player.y)) return { x: dx / d, y: dy / d, d };
  const [cx, cy] = cellOf(e.x, e.y);
  const i = idx(cx, cy);
  const fx = flow.dirX[i], fy = flow.dirY[i];
  if (!fx && !fy) return { x: dx / d, y: dy / d, d };
  // Aim at the centre of the next cell to avoid scraping shelf corners.
  const tx = (cx + fx + 0.5) * CELL - e.x, ty = (cy + fy + 0.5) * CELL - e.y, tl = Math.hypot(tx, ty) || 1;
  return { x: tx / tl, y: ty / tl, d };
}

function updateEnemies(dt) {
  const p = player;
  for (const e of enemies) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.orbitHit = Math.max(0, e.orbitHit - dt);
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
          e.atkT = Math.max(1.6, 3 - game.wave * 0.06);
          rings.push({ x: e.x, y: e.y, r: e.r, max: 196, speed: 140, width: 12, life: 1 });
          sound.play('ring');
        }
        break;
      }
      case 'worm': {
        if (e.leader && !e.leader.dead) {
          const L = e.leader, dx = e.x - L.x, dy = e.y - L.y, d = Math.hypot(dx, dy) || 1;
          if (d > 15) { e.x = L.x + (dx / d) * 15; e.y = L.y + (dy / d) * 15; }
        } else {
          if (e.leader) { e.leader = null; e.head = true; }
          const s = seek(e); const w = Math.sin(e.t * 5) * 0.5;
          mx = (s.x - s.y * w) * e.speed; my = (s.y + s.x * w) * e.speed;
        }
        break;
      }
      case 'boss': bossAI(e, dt); break;
    }
    // Elites return fire: an aimed page (a 3-page fan from wing 7) when they can see you.
    if (e.elite && e.stun <= 0 && game.state === 'playing') {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = (game.diff ? game.diff.eliteShootEvery : 3) * (0.8 + Math.random() * 0.4);
        if (lineOfSight(arena.solid, COLS, ROWS, CELL, e.x, e.y, p.x, p.y)) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          if (game.diff && game.diff.bossTier >= 2) fan(e.x, e.y, a, 3, 0.2, 150); else { shootHazard(e.x, e.y, a, 150); sound.play('shoot'); }
        }
      }
    }
    if (e.type !== 'boss' || e.mode !== 'charge') { e.x += (mx + e.vx) * dt; e.y += (my + e.vy) * dt; }
  }
  // Separation (cheap O(n²); n stays < ~100) + world collision
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (a.type === 'worm' && b.type === 'worm') continue;
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
    else if (!(e.type === 'worm' && e.leader)) collideWorld(e, e.r);
    // Contact damage
    if (game.state === 'playing' || game.state === 'waveclear') {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (d < p.r + e.r - 3) hurtPlayer(e.x, e.y);
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
}

function bossAI(e, dt) {
  const p = player;
  const frac = e.hp / e.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (phase !== e.phase) {
    if (e.phase) { banner(`PHASE ${phase}`, phase === 3 ? 'The author is furious!' : 'Plot thickens…'); shake(0.5); sound.play('boss'); }
    e.phase = phase;
  }
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
      if (hitWall) { shake(0.6); sound.play('explode'); radial(e.x, e.y, 14, 170, 0); }
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
  if (phase === 1 && e.atkT <= 0) { e.atkT = 1.25; fan(e.x, e.y, aim, tier >= 1 ? 7 : 5, 0.22, 210); }
  if (phase === 2) {
    e.spiral += dt * 2.3;
    const arms = tier >= 2 ? [0, TAU / 3, (2 * TAU) / 3] : [0, Math.PI];
    if (e.atkT <= 0) { e.atkT = tier >= 2 ? 0.17 : 0.14; for (const o of arms) shootHazard(e.x, e.y, e.spiral + o, 165); }
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = 7;
      for (let i = 0; i < 3; i++) telegraphs.push({ type: tier >= 3 ? 'notice' : 'bunny', ...spawnPoint(), t: 0, dur: 0.85, elite: tier >= 3 && i === 0 });
    }
  }
  if (phase === 3) {
    if (e.atkT <= 0) {
      if (Math.random() < 0.5) { e.mode = 'windup'; e.modeT = 0.6; e.cAim = aim; e.atkT = tier >= 1 ? 1.9 : 2.2; }
      else { e.atkT = 1.4; radial(e.x, e.y, tier >= 1 ? 22 : 18, 190, e.t); fan(e.x, e.y, aim, tier >= 2 ? 5 : 3, 0.15, 260); }
    }
  }
}
const MAX_HAZARDS = 260;
function shootHazard(x, y, a, s) {
  if (hazards.length >= MAX_HAZARDS) return;
  s *= game.diff ? game.diff.hazardSpeed : 1; // story: pages fly faster in later rooms and wings
  hazards.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 5, life: 6, rot: a });
}
function fan(x, y, a, n, spread, s) { for (let i = 0; i < n; i++) shootHazard(x, y, a + (i - (n - 1) / 2) * spread, s); sound.play('shoot'); }
function radial(x, y, n, s, off) { for (let i = 0; i < n; i++) shootHazard(x, y, off + (i / n) * TAU, s); sound.play('shoot'); }

function damageEnemy(e, dmg, kx, ky, crit) {
  if (e.dead) return;
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
    prev.text = prev.crit ? `${tot}!` : `${tot}`; prev.life = prev.max; prev.x = clamp(e.x, 70, W - 70);
    if (crit) { prev.color = '#ffd54a'; prev.size = 18; }
  } else if (crit || e.type === 'boss' || texts.length < 8) {
    floatText(e.x + (Math.random() - 0.5) * 10, e.y - e.r, crit ? `${shown}!` : `${shown}`, crit ? '#ffd54a' : '#e8e0cc', crit ? 18 : 11, crit ? 0.7 : 0.5);
    e.dmgText = texts[texts.length - 1]; e.dmgText.sum = dmg; e.dmgText.crit = crit;
  }
  sound.play(crit ? 'crit' : 'hit', e.type === 'boss' ? 0.6 : 1);
  // Hit-stop on the boss sells impact, but chained on every hit it slowed late fights to ~0.4x speed.
  // Budget: only crits / big hits, and at most one micro-freeze per 0.3s of game time.
  if (e.type === 'boss' && (crit || dmg >= stats.damage * 3) && game.time - (game.lastBossStop || -1) > 0.3) {
    game.lastBossStop = game.time;
    game.freeze = Math.max(game.freeze, 0.012);
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  game.kills++;
  game.combo++;
  game.comboT = 2.5;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const gained = Math.round(e.score * comboMult() * stats.scoreMult);
  game.score += gained;
  const colors = { bunny: ['#c9c2b6', '#8d867a'], notice: ['#f4efe1', '#e74c3c'], patron: ['#ff9f43', '#ffd8a8'], worm: ['#7bd88f', '#3c8d50'],
    golem: ['#d4a017', '#8a6d1a'], coin: ['#ffd54a'], boss: ['#6c3cff', '#b48cff', '#fff'] }[e.type];
  burst(e.x, e.y, e.type === 'boss' ? 90 : 16, colors, e.type === 'boss' ? 360 : 170, e.type === 'boss' ? 1.4 : 0.6);
  pages(e.x, e.y, e.type === 'boss' ? 40 : 3);
  addLight(e.x, e.y, e.r * 5, 0.35, colors[0]);
  sound.play('kill', 1 + Math.min(game.combo, 20) * 0.03);
  if (game.combo > 0 && game.combo % 10 === 0) floatText(player.x, player.y - 34, `${game.combo} COMBO!`, '#ffd54a', 18, 1.1);
  if (e.type === 'coin') { game.fines += 1; floatText(e.x, e.y - 12, '+1 🪙', '#ffd54a', 12, 0.7); }
  // From wing 4, elites burst into a ring of pages as they go down: don't stand on them.
  if (e.elite && game.diff && game.diff.deathBurst && game.state === 'playing') radial(e.x, e.y, game.diff.deathBurst, 120, Math.random() * TAU);
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

function hurtPlayer(sx, sy) {
  const p = player;
  if (p.inv > 0 || p.dashT > 0 || game.state !== 'playing') return;
  if (p.hp <= 1 && p.amnesty) {
    p.amnesty = false; p.inv = 1.6;
    floatText(p.x, p.y - 28, 'AMNESTY!', '#9be7dc', 20, 1.4);
    burst(p.x, p.y, 30, ['#9be7dc', '#fff'], 240, 0.7); shake(0.5); buzz([30, 30, 30]); sound.play('upgrade');
    rings.push({ x: p.x, y: p.y, r: 10, max: 120, speed: 500, friendly: true, life: 1 });
    return;
  }
  p.hp -= 1;
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


function updateBooks(dt) {
  for (let i = books.length - 1; i >= 0; i--) {
    const b = books[i];
    b.life -= dt;
    b.rot += b.spin * dt;
    const homing = b.homingBoost ? Math.max(stats.homing, 8) : stats.homing;
    if (homing > 0) {
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
      b.wraps--; b.life = Math.max(b.life, 0.9); b.hit.clear();
      if (stats.wrapHoming) { b.homingBoost = true; b.dmgMult = Math.min(4, b.dmgMult * 2); b.color = PLAYER.wrapped; }
      burst(b.x, b.y, 6, ['#9be7dc', '#fff'], 90, 0.3);
    }
    if (isSolidPx(arena.solid, b.x, b.y)) {
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
        if (stats.bounceBurst) inkBurst(b.x, b.y, stats.shelfBurst || 50, stats.damage * stats.burstMult, '#ffb86b');
        sound.play('ping');
      } else {
        remove = true; pages(b.x, b.y, 2);
        if (stats.shelfBurst) inkBurst(ox, oy, stats.shelfBurst, stats.damage * stats.burstMult, '#ffb86b');
      }
    }
    if (!remove) {
      for (const e of enemies) {
        if (e.dead || b.hit.has(e)) continue;
        const rr = e.r + b.r;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          b.hit.add(e);
          const crit = Math.random() < stats.critChance;
          const base = stats.damage * b.dmgMult * (stats.nookDamage && player.nookOn ? 2 : 1);
          const dmg = crit ? base * stats.critMult : base;
          const s = Math.hypot(b.vx, b.vy) || 1;
          damageEnemy(e, dmg, (b.vx / s) * 160, (b.vy / s) * 160, crit);
          burst(b.x, b.y, 5, [b.color, '#fff'], 120, 0.3);
          if (crit && stats.critBurst) inkBurst(e.x, e.y, stats.critBurst, stats.damage, '#7a5cff');
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
    if (remove) books.splice(i, 1);
  }
}

function orbiterPositions() {
  const n = stats.orbiters, out = [];
  for (let i = 0; i < n; i++) {
    const a = game.time * 3.2 + (i / n) * TAU;
    const rad = 48 + (stats.orbitPulse ? 30 * (0.5 + 0.5 * Math.sin(game.time * 2.2)) : 0);
    out.push({ x: player.x + Math.cos(a) * rad, y: player.y + Math.sin(a) * rad, a });
  }
  return out;
}
function updateOrbiters() {
  if (!stats.orbiters || game.state === 'dying') return;
  for (const o of orbiterPositions()) {
    for (const e of enemies) {
      if (e.dead || e.orbitHit > 0) continue;
      if ((e.x - o.x) ** 2 + (e.y - o.y) ** 2 < (e.r + 8) ** 2) {
        e.orbitHit = 0.35;
        const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy) || 1;
        damageEnemy(e, stats.damage, (dx / d) * 220, (dy / d) * 220, false);
      }
    }
  }
}

function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.life -= dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += dt * 6;
    let remove = h.life <= 0 || h.x < -20 || h.x > W + 20 || h.y < -20 || h.y > H + 20;
    if (!remove && isSolidPx(arena.solid, h.x, h.y) && h.x > 0 && h.y > 0 && h.x < W && h.y < H) { remove = true; burst(h.x, h.y, 3, ['#ff6b6b'], 60, 0.25); }
    if (!remove && (h.x - player.x) ** 2 + (h.y - player.y) ** 2 < (h.r + player.r - 2) ** 2 && player.inv <= 0 && player.dashT <= 0) {
      hurtPlayer(h.x, h.y); remove = true;
    }
    if (remove) hazards.splice(i, 1);
  }
}

function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.r += g.speed * dt;
    g.life = 1 - g.r / g.max;
    if (!g.friendly) {
      const d = Math.hypot(player.x - g.x, player.y - g.y);
      if (Math.abs(d - g.r) < g.width / 2 + player.r * 0.5) hurtPlayer(g.x, g.y);
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
const BOOK_PALETTE = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#f1c40f', '#7f8c8d', '#e84393', '#2c3e50', '#b33939', '#218c74'];

function buildBackground() {
  bg = document.createElement('canvas');
  bg.width = W * 2; bg.height = H * 2; // render at 2x for crispness on HiDPI
  const g = bg.getContext('2d');
  g.scale(2, 2);
  const r = new Rng(hashString(`bg:${game.seed}:${game.wave}`));
  // Story wings each have their own floor colour and rug.
  const wing = game.mode === 'story' ? WINGS[game.wingN - 1] : null;
  const hue = wing ? wing.floorHue : 25, sat = wing && (wing.floorHue < 10 || wing.floorHue > 60) ? 18 : 35;
  // Wooden floor planks
  const ph = 18;
  for (let y = 0; y < H; y += ph) {
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
  // Central rug
  const rx = SAFE.x0 * CELL + 6, ry = SAFE.y0 * CELL + 6, rw = (SAFE.x1 - SAFE.x0 + 1) * CELL - 12, rh = (SAFE.y1 - SAFE.y0 + 1) * CELL - 12;
  g.fillStyle = wing ? wing.rug : '#4a1622'; g.fillRect(rx, ry, rw, rh);
  g.strokeStyle = '#c9a227'; g.lineWidth = 3; g.strokeRect(rx + 6, ry + 6, rw - 12, rh - 12);
  g.lineWidth = 1; g.strokeRect(rx + 12, ry + 12, rw - 24, rh - 24);
  g.save(); g.translate(rx + rw / 2, ry + rh / 2);
  for (let i = 0; i < 8; i++) { g.rotate(TAU / 8); g.fillStyle = 'rgba(201,162,39,0.35)'; g.beginPath(); g.ellipse(26, 0, 18, 6, 0, 0, TAU); g.fill(); }
  g.restore();
  // Shelves: soft contact shadow, wooden case with a lit top edge and a dark front face,
  // then spines with the odd gap, leaning book and bookend.
  for (const s of arena.rects) {
    const horiz = s.w >= s.h;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 16; g.shadowOffsetX = 5; g.shadowOffsetY = 9;
    g.fillStyle = '#4a2f18'; g.fillRect(s.x, s.y, s.w, s.h);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(s.x + 6, s.y + 6, s.w, s.h);  // contact shadow
    g.fillStyle = '#5b3a1e'; g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = '#86592f'; g.fillRect(s.x, s.y, s.w, 3);                 // lit top edge
    g.fillStyle = '#1c1008'; g.fillRect(s.x, s.y + s.h - 7, s.w, 7);        // front face in shadow
    g.fillStyle = 'rgba(255,220,170,0.12)'; g.fillRect(s.x, s.y + s.h - 7, s.w, 1);
    g.fillStyle = '#140b05'; g.fillRect(s.x + 3, s.y + 3, s.w - 6, s.h - 10); // inside of the case
    let p = 4;
    const lenAxis = horiz ? s.w : s.h - 7;
    const across = horiz ? s.h - 10 : s.w - 6;
    // bookends at both ends
    g.fillStyle = '#8a6a3a';
    if (horiz) { g.fillRect(s.x + 3, s.y + 3, 4, across); g.fillRect(s.x + s.w - 7, s.y + 3, 4, across); }
    else { g.fillRect(s.x + 3, s.y + 3, across, 4); g.fillRect(s.x + 3, s.y + lenAxis - 4, across, 4); }
    p += 4;
    while (p < lenAxis - 10) {
      const thick = r.int(4, 8);
      if (r.chance(0.07)) { p += r.int(3, 6); continue; } // gap where a book is checked out
      const depth = across - r.int(0, 5);
      const col = r.pick(BOOK_PALETTE);
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
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.5; g.strokeRect(s.x + 0.75, s.y + 0.75, s.w - 1.5, s.h - 1.5);
  }
  // Reading lamps in the corners (also light sources)
  for (const [x, y] of LAMPS) {
    g.fillStyle = '#2b1d10'; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill();
    g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
  }
  // Walls
  g.strokeStyle = '#120b06'; g.lineWidth = 10; g.strokeRect(0, 0, W, H);
}
function lampPositions() { return [[26, H * 0.3], [W - 26, H * 0.3], [26, H * 0.66], [W - 26, H * 0.66]]; }
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
  for (const [x, y] of LAMPS) G(x, y, 90, 'rgba(255,190,90,0.6)', 0.5);
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
  for (const e of enemies) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x + 3, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.4, 0, 0, TAU); ctx.fill(); }
  for (let i = enemies.length - 1; i >= 0; i--) drawEnemy(enemies[i]);
  for (const b of books) drawThrownBook(b);
  if (game.state !== 'title' && game.state !== 'gameover' && !(game.state === 'dying' && game.deathT < 1.5)) {
    for (const o of orbiterPositions()) drawBook(o.x, o.y, o.a * 2, PLAYER.orbit, 1.1);
    drawPlayer();
  }
  drawHazards();
  for (const g of rings) drawRing(g);
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
  if (game.state === 'playing' || game.state === 'waveclear' || game.state === 'dying') drawHUD();
  if (touch.enabled && touch.moveId !== null) drawStick();
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

function eyes(x, y, sep, r, look, color = '#fff') {
  for (const s of [-1, 1]) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + s * sep, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + s * sep + Math.cos(look) * r * 0.4, y + Math.sin(look) * r * 0.4, r * 0.5, 0, TAU); ctx.fill();
  }
}

/** Elites wear a gold halo that flares red just before they fire. */
function drawEliteHalo(e) {
  const warn = e.shootT !== undefined && e.shootT < 0.4 && game.state === 'playing';
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = warn ? '#ff4d5e' : '#ffd54a';
  ctx.globalAlpha = warn ? 0.9 : 0.55 + Math.sin(e.t * 5) * 0.2;
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5 + (warn ? Math.sin(e.t * 40) * 1.5 : 0), 0, TAU); ctx.stroke();
  // little crown
  ctx.globalAlpha = 1; ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
  const y = e.y - e.r - 9;
  ctx.beginPath(); ctx.moveTo(e.x - 7, y + 5); ctx.lineTo(e.x - 7, y - 2); ctx.lineTo(e.x - 3.5, y + 1.5); ctx.lineTo(e.x, y - 4);
  ctx.lineTo(e.x + 3.5, y + 1.5); ctx.lineTo(e.x + 7, y - 2); ctx.lineTo(e.x + 7, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawEnemy(e) {
  if (e.elite) drawEliteHalo(e);
  const look = Math.atan2(player.y - e.y, player.x - e.x);
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.stun > 0) { ctx.rotate(Math.sin(e.t * 20) * 0.15); }
  const white = e.flash > 0;
  switch (e.type) {
    case 'bunny': {
      const sq = 1 + Math.sin(e.t * 14) * 0.08;
      ctx.scale(1 / sq, sq);
      ctx.fillStyle = OUTLINE;
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + e.t; ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 7.6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = white ? '#fff' : '#ddd5c6';
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + e.t; ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 7, 6, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      rim(13, 0.5);
      eyes(0, -1, 4, 3, look);
      break;
    }
    case 'notice': {
      ctx.rotate(Math.sin(e.t * 6) * 0.5);
      ctx.scale(Math.abs(Math.cos(e.t * 4)) * 0.5 + 0.6, 1);
      ctx.fillStyle = OUTLINE; ctx.fillRect(-10.5, -12.5, 21, 25);
      ctx.fillStyle = white ? '#fff' : '#f4efe1'; ctx.fillRect(-9, -11, 18, 22);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.strokeRect(-6, -3, 12, 7);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-6, -8, 12, 2);
      ctx.fillStyle = '#999'; ctx.fillRect(-6, 7, 9, 1.5);
      break;
    }
    case 'patron': {
      const charge = e.atkT < 0.5 ? 1 + (0.5 - e.atkT) * 0.6 : 1;
      ctx.scale(charge, charge);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#ff9f43'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#b85c12'; ctx.lineWidth = 2; ctx.stroke();
      rim(14);
      eyes(0, -5, 5, 3, look);
      ctx.fillStyle = '#3a0d0d'; ctx.beginPath(); ctx.ellipse(0, 5, 6, 4 + Math.abs(Math.sin(e.t * 12)) * 3, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'worm': {
      const head = !e.leader;
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, 0, head ? 13 : 11, 0, TAU); ctx.fill();
      ctx.fillStyle = white ? '#fff' : head ? '#ff8fb1' : '#7bd88f';
      ctx.beginPath(); ctx.arc(0, 0, head ? 11 : 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = head ? '#b34d6d' : '#3c8d50'; ctx.lineWidth = 2; ctx.stroke();
      rim(head ? 11 : 9, 0.45);
      if (head) {
        eyes(0, -2, 4, 3, look);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.stroke();
      }
      break;
    }
    case 'golem': {
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.roundRect(-22.5, -22.5, 45, 45, 10); ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#b8860b';
      ctx.beginPath(); ctx.roundRect(-20, -20, 40, 40, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,170,0.35)'; ctx.fillRect(-16, -19, 30, 2);
      ctx.strokeStyle = '#6b4f0c'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#6b4f0c'; ctx.font = 'bold 22px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 4);
      eyes(0, -10, 8, 3, look, '#ffef9f');
      ctx.textBaseline = 'alphabetic';
      if (e.hp < e.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(-18, 24, 36, 4); ctx.fillStyle = '#ffd54a'; ctx.fillRect(-18, 24, 36 * (e.hp / e.maxHp), 4); }
      break;
    }
    case 'coin': {
      ctx.scale(Math.abs(Math.cos(e.t * 8)) * 0.7 + 0.3, 1);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, 0, 8.8, 0, TAU); ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#ffd54a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case 'boss': drawBoss(e, look, white); break;
  }
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
  txt(`🪙 ${game.fines}`, 14, 48, 13, '#ffd54a');
  // Score + combo
  txt(Math.floor(game.score).toLocaleString(), W - 16, 32, 24, '#fff', 'right');
  const m = comboMult();
  if (game.combo > 1) {
    txt(`${game.combo} combo  ×${m}`, W - 16, 52, 13, m >= 3 ? '#ffd54a' : '#9be7dc', 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(W - 136, 58, 120, 4);
    ctx.fillStyle = '#9be7dc'; ctx.fillRect(W - 136, 58, 120 * clamp(game.comboT / 2.5, 0, 1), 4);
  }
  // Wave info
  const left = enemies.length + telegraphs.length + spawnQueue.length;
  if (isStory()) {
    txt(`ROOM ${game.wave}/${ROOMS_PER_WING}`, W / 2, 26, 18, game.diff && game.diff.kind !== 'normal' ? '#ffd54a' : '#e8d9b0', 'center');
    if (game.state === 'playing' && !game.boss) txt(`${short(wingDef().name, 18)} · ${left} left`, W / 2, 44, 11, 'rgba(232,217,176,0.8)', 'center');
  } else {
    txt(`WAVE ${game.wave}`, W / 2, 26, 18, '#e8d9b0', 'center');
    if (game.state === 'playing' && !game.boss) txt(`${left} disturbance${left === 1 ? '' : 's'} left`, W / 2, 44, 11, 'rgba(232,217,176,0.8)', 'center');
  }
  // Cooldowns
  const dashReady = player.dashStock > 0;
  const kDash = dashReady ? 1 : clamp(1 - player.dashCd / stats.dashCd, 0, 1), kShhh = clamp(1 - player.shhhT / stats.shhhCd, 0, 1);
  const dashLabel = stats.dashCharges > 1 ? `DASH×${player.dashStock}` : 'DASH';
  if (touch.enabled) {
    // On touch the on-screen buttons show their own cooldown rings + countdown.
    setTouchButton(btnDash, kDash, dashReady ? 0 : player.dashCd, dashLabel);
    setTouchButton(btnShhh, kShhh, player.shhhT, 'SHHH');
    if (player.rapidT > 0) cooldown(30, H - 30, '☕x2', player.rapidT / 6, '#c69c6d');
  } else {
    cooldown(30, H - 30, dashLabel, kDash, '#9be7dc', dashReady ? 0 : player.dashCd);
    cooldown(80, H - 30, 'SHHH', kShhh, '#b48cff', player.shhhT);
    if (player.rapidT > 0) cooldown(130, H - 30, '☕x2', player.rapidT / 6, '#c69c6d');
  }
  // Boss bar
  if (game.boss) {
    const b = game.boss, bw = Math.min(460, W - 120), bx = (W - bw) / 2, by = PORTRAIT ? 86 : H - 34;
    txt(`${b.name}`, W / 2, by - 6, 13, '#d6c8ff', 'center');
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
    ctx.fillStyle = b.phase === 3 ? '#ff2d55' : b.bar || '#6c3cff'; ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx + bw * 0.33, by, 2, 10); ctx.fillRect(bx + bw * 0.66, by, 2, 10);
  }
  // Banner
  if (game.bannerT > 0) {
    const a = clamp(Math.min(game.bannerT, 2.4 - game.bannerT) * 3, 0, 1);
    const slide = (1 - a) * 30;
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, H / 2 - 92, W, game.bannerSub ? 84 : 60);
    ctx.globalAlpha = a;
    txt(game.banner, W / 2 + slide, H / 2 - 50, 44, '#fff3c4', 'center');
    if (game.bannerSub) txt(game.bannerSub, W / 2 - slide, H / 2 - 22, 16, '#d6c8ff', 'center');
    ctx.globalAlpha = 1;
  }
  if (DEBUG) txt(`fps ${fps.toFixed(0)}  e${enemies.length} p${particles.length} seed ${game.seed}`, 10, H - 60, 11, '#0f0');
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
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(touch.mx0, touch.my0, 45, 0, TAU); ctx.stroke();
  const dx = touch.mx - touch.mx0, dy = touch.my - touch.my0, d = Math.hypot(dx, dy), k = d > 45 ? 45 / d : 1;
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(touch.mx0 + dx * k, touch.my0 + dy * k, 18, 0, TAU); ctx.fill();
}

// ======================================================================
// DOM screens, settings, leaderboard
// ======================================================================
const SCREENS = ['title', 'howto', 'settings', 'leaderboard', 'upgrade', 'doors', 'pause', 'gameover', 'codex', 'story', 'shop'];
let settingsReturn = 'title', shopReturn = 'title', currentScreen = 'title';
function showScreen(id) {
  for (const s of SCREENS) $('#' + s).hidden = s !== id;
  currentScreen = id;
  closeBuildPop();
  document.body.classList.toggle('in-game', id === null);
  if (id === 'title') renderFineBadges();
}

// ---- Late fees UI: fines balance, Renovations shop, story wing select ----
function renderFineBadges() {
  for (const el of document.querySelectorAll('.fine-balance')) el.textContent = `🪙 ${progress.fines.toLocaleString()} fines`;
  for (const el of document.querySelectorAll('.fine-count')) el.textContent = progress.fines ? `· ${progress.fines.toLocaleString()}` : '';
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
    const gain = document.createElement('small'); gain.textContent = r.gain;
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
  for (let w = 1; w <= progress.unlocked; w++) if (!progress.cleared.includes(w)) return w;
  return progress.unlocked;
}
function wingStatus(w) {
  if (w > progress.unlocked) return 'Locked';
  if (progress.cleared.includes(w)) return '✓ Cleared';
  const best = progress.best[w];
  return best ? `Best: room ${best}/${ROOMS_PER_WING}` : 'New';
}
function renderStory() {
  renderFineBadges();
  if (selectedWing > progress.unlocked) selectedWing = progress.unlocked;
  const grid = $('#wingGrid');
  grid.textContent = '';
  WINGS.forEach((def, i) => {
    const w = i + 1, locked = w > progress.unlocked;
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
  const def = WINGS[selectedWing - 1];
  if (progress.unlocked < WINGS.length) $('#wingLock').textContent = `🔒 Clear ${WINGS[progress.unlocked - 1].name} to unlock ${WINGS[progress.unlocked].name}.`;
  else $('#wingLock').textContent = '';
  $('#wingName').textContent = `${def.icon} Wing ${selectedWing}: ${def.name}`;
  $('#wingBlurb').textContent = def.blurb;
  const d1 = difficulty(selectedWing, 1);
  $('#wingInfo').textContent = selectedWing === 1
    ? '10 rooms · room 5 is elite · a Rogue Author waits in room 10'
    : `Enemies ×${d1.hpMult.toFixed(2)} tougher · ${Math.round(d1.eliteChance * 100)}% elites${d1.deathBurst ? ' · elites burst into pages' : ''}`;
  $('#btnEnterWing').textContent = `▶ Enter ${def.name}`;
}

/** Bank the run's fines once (game over, wing cleared, or quitting mid-run). */
function bankRun() {
  if (game.banked) return game.banked;
  const res = recordRun(progress, { fines: game.fines, mode: game.mode, wing: game.wingN, room: game.wave, cleared: game.wingCleared });
  progress = res.progress; saveProgress();
  game.banked = res;
  return res;
}
const inRun = () => ['playing', 'paused', 'upgrade', 'doors', 'waveclear', 'dying'].includes(game.state);

// ---- Progress tools (Settings): reset for a fresh start; debug helpers with ?debug=1 ----
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
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1600);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  sound.init(); sound.play('click');
  const act = b.dataset.act;
  if (act === 'play') startRun('endless');
  else if (act === 'again') startRun(game.mode, game.wingN);
  else if (act === 'story') { selectedWing = defaultWing(); renderStory(); showScreen('story'); }
  else if (act === 'enterwing') startRun('story', selectedWing);
  else if (act === 'nextwing') startRun('story', Math.min(WINGS.length, game.wingN + 1));
  else if (act === 'shop') { shopReturn = currentScreen || 'title'; renderShop(); showScreen('shop'); }
  else if (act === 'shopback') { if (shopReturn === 'story') renderStory(); showScreen(shopReturn); }
  else if (act === 'fullscreen') toggleFullscreen();
  else if (act === 'howto') showScreen('howto');
  else if (act === 'codex') { renderCodex(); showScreen('codex'); }
  else if (act === 'settings') { settingsReturn = game.state === 'paused' ? 'pause' : 'title'; showScreen('settings'); }
  else if (act === 'leaderboard') { showScreen('leaderboard'); loadLeaderboard($('#lbList')); }
  else if (act === 'back') showScreen(game.state === 'paused' ? settingsReturn : 'title');
  else if (act === 'resume') resume();
  else if (act === 'quit' || act === 'menu') {
    // Quitting mid-run still banks what you earned: every run counts.
    if (act === 'quit' && inRun()) { const res = bankRun(); if (res.banked) setTimeout(() => toast(`🪙 +${res.banked} fines banked`), 50); }
    game.state = 'title'; sound.setIntensity(0); sound.setMuffled(false); clearWorld(); player = makePlayer(); showScreen('title');
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

const BEST_KEY = 'overdue.best.v1';
function showGameOver() {
  const story = isStory(), won = story && game.wingCleared;
  const res = bankRun();
  game.state = 'gameover';
  sound.setMuffled(true);
  if (won) sound.play('wave');
  const score = Math.floor(game.score);
  // Personal best + Hall of Fame stay endless-only, so the numbers keep meaning the same thing.
  const best = loadJSON(BEST_KEY);
  const isBest = !story && score > (best.score || 0);
  if (isBest) saveJSON(BEST_KEY, { score, wave: game.wave });
  $('#goTitle').textContent = won ? `${wingDef().name}: cleared!` : 'Shift over';
  $('#goStats').innerHTML = '';
  const fineLine = `+${res.banked.toLocaleString()} 🪙${res.firstClear ? ' (first clear!)' : ''}`;
  const rows = [
    ...(story ? [['Wing', `${game.wingN} · ${wingDef().name}`], ['Room reached', won ? `${ROOMS_PER_WING}/${ROOMS_PER_WING} ✓` : `${game.wave}/${ROOMS_PER_WING}`]] : []),
    ['Fines banked', fineLine], ['Fines to spend', `${progress.fines.toLocaleString()} 🪙`],
    ...(res.unlockedWing ? [['Unlocked', `🔓 Wing ${res.unlockedWing}: ${WINGS[res.unlockedWing - 1].name}`]] : []),
    ['Score', score.toLocaleString() + (isBest ? ' ★ new personal best' : '')],
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
  showScreen('gameover');
  if (!story) loadLeaderboard($('#goList'));
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
document.querySelectorAll('.version-label').forEach((el) => { el.textContent = versionLabel(); });
let updateOffered = false;
async function checkForUpdate() {
  if (updateOffered || BUILD.commit === 'local') return;
  const live = await fetchLatestBuild();
  if (!live || live.commit === BUILD.commit) return;
  updateOffered = true;
  const bar = $('#updateBar');
  bar.textContent = `🔄 New version v${live.version} (${live.commit}) — tap to update`;
  bar.hidden = false;
}
$('#updateBar').addEventListener('click', () => {
  // Never yank a run out from under the player: only reload outside of play.
  if (game.state === 'playing' || game.state === 'waveclear' || game.state === 'dying') { toast('Finish or pause this shift first'); return; }
  location.reload();
});
setTimeout(checkForUpdate, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
setInterval(() => { if (game.state === 'title' || game.state === 'gameover' || game.state === 'paused') checkForUpdate(); }, 10 * 60 * 1000);
// iPhones have no Fullscreen API: hide the button rather than show one that does nothing.
if (!document.fullscreenEnabled) document.querySelectorAll('.fs-only').forEach((el) => el.remove());
updateSourceBadge();
showScreen('title');
document.body.classList.add('ready');
requestAnimationFrame(frame);

// Test hooks (only with ?debug) — used by the automated Playwright smoke test.
if (DEBUG) {
  window.__overdue = {
    game, get player() { return player; }, counts: () => ({ books: books.length, hazards: hazards.length, rings: rings.length, particles: particles.length, texts: texts.length, flashes: flashes.length, enemies: enemies.length }), get stats() { return stats; }, enemies, get content() { return content; },
    startRun, startWave, killAll: () => { for (const e of [...enemies]) killEnemy(e); spawnQueue.length = 0; telegraphs.length = 0; },
    get progress() { return progress; }, setFines: (n) => { progress = { ...progress, fines: n }; saveProgress(); renderFineBadges(); },
    unlockAll: () => { progress = { ...progress, unlocked: WINGS.length }; saveProgress(); },

    god: () => { player.hp = 999; stats.maxHp = 999; },
    grant: (id) => { const u = UPGRADES.find((x) => x.id === id); game.owned[id] = (game.owned[id] || 0) + 1; u.apply(stats, player); },
    showCards: (ids) => renderCards(ids.map(byId)),
    showUpgrades, showDoors, get door() { return game.door; }, setRenews: (n) => { game.renews = n; }, die: () => { player.hp = 1; player.inv = 0; hurtPlayer(player.x + 1, player.y); },
  };
}
