// Run log (v1.14.0): one compact record per finished run, kept on this phone, plus the "Share stats" code.
// Pure module (no DOM, no localStorage), shared by the game and the balance bot so both measure the same things.
// Stored under its own key `overdue.runs.v1` (additive: no existing player key is touched, and the backup code skips it).
import { checksum, toB64, fromB64 } from './backup.js';

export const RUN_KEY = 'overdue.runs.v1';
export const MAX_RUNS = 50;
export const STATS_PREFIX = 'OVS1:';

/** Where the player's damage comes from. Fixed keys, so counting a hit is one number add (no allocation). */
export const DEALT_SOURCES = ['throw', 'crit', 'dash', 'orbit', 'burst', 'splash', 'shhh', 'other'];
/** burst = Spine Breaker / Collapsing Stacks shelf bursts, splash = Annotated Edition crit splash. */
export const FLIGHT_BINS = 64, LIFE_BINS = 40, LIFE_BIN_S = 0.1;

/** Fresh counters for one run. dealt: damage points by source; taken: hearts lost by source (keys appear on first hit). */
export function newCounters() {
  const dealt = {};
  for (const k of DEALT_SOURCES) dealt[k] = 0;
  return {
    dealt, taken: {},
    thrown: 0, thrownHit: 0, ended: 0, evict: 0,                 // thrown books: ended = finished flying, thrownHit = ones that hurt something
    life: new Uint32Array(LIFE_BINS), flight: new Uint32Array(FLIGHT_BINS), samples: 0,   // histograms: book age at end, books in flight per step
    pages: { hits: 0, crossed: 0, crossedHit: 0 },                // pages that hit you; pages that flew through an orbit book; ...and went on to hit you
    bossKills: [], steps: 0,
  };
}

/** Damage the player dealt (effective points, overkill excluded). One add. */
export function addDealt(c, src, n) { c.dealt[src in c.dealt ? src : 'other'] += n; }
/** One heart lost to `src` (an enemy type, 'page:fan', 'ring', ...). */
export function addTaken(c, src) { c.taken[src] = (c.taken[src] || 0) + 1; }
/** A thrown book finished flying (hit something or not), after `age` seconds. */
export function bookEnded(c, age, hitAny) {
  c.ended++; if (hitAny) c.thrownHit++;
  c.life[Math.min(LIFE_BINS - 1, (age / LIFE_BIN_S) | 0)]++;
}
/** Sample how many books are in flight (call once per simulation step while playing). */
export function sampleFlight(c, n) { c.flight[n < FLIGHT_BINS ? n : FLIGHT_BINS - 1]++; c.samples++; }

/** p-th percentile (0..1) of a histogram, as the bin's lower edge times `unit`. */
export function histPercentile(hist, p, unit = 1) {
  let total = 0; for (const v of hist) total += v;
  if (!total) return 0;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= total * p) return i * unit; }
  return (hist.length - 1) * unit;
}

const round = (n) => Math.round(n * 10) / 10;
const roundMap = (m) => { const o = {}; for (const k of Object.keys(m)) { const v = round(m[k]); if (v) o[k] = v; } return o; };

/**
 * The compact record that is stored and shared (versioned: v 1).
 * info: { version, mode, wing, room, result: 'c'|'d'|'q', killer, elite, perks[], banished[], cursed[], doors[], reno{}, time, maxHp, counters }
 */
export function buildRecord(info) {
  const c = info.counters || newCounters();
  const rec = {
    v: 1, ver: String(info.version || ''), mode: info.mode === 'story' ? 's' : 'e',
    wing: info.mode === 'story' ? info.wing | 0 : 0, room: info.room | 0,
    res: info.result === 'c' || info.result === 'd' ? info.result : 'q',
    perks: (info.perks || []).slice(0, 60), ban: (info.banished || []).slice(0, 30), cur: (info.cursed || []).slice(0, 12),
    doors: (info.doors || []).slice(0, 12), reno: { ...(info.reno || {}) },
    t: Math.round(info.time || 0), hp: info.maxHp | 0,
    dealt: roundMap(c.dealt), taken: roundMap(c.taken),
  };
  if (rec.res === 'd') { rec.killer = String(info.killer || 'other'); rec.elite = info.elite ? 1 : 0; }
  return rec;
}

/** Append a record and keep the newest MAX_RUNS (ring buffer). Returns a new array. */
export function pushRun(runs, rec, max = MAX_RUNS) {
  const list = Array.isArray(runs) ? runs.filter(isRecord) : [];
  list.push(rec);
  return list.length > max ? list.slice(list.length - max) : list;
}

const isRecord = (r) => !!r && typeof r === 'object' && r.v === 1 && typeof r.ver === 'string';
/** A clean run list from whatever was saved (missing, junk or oversized data is repaired). */
export function normalizeRuns(raw) {
  return Array.isArray(raw) ? raw.filter(isRecord).slice(-MAX_RUNS) : [];
}

/** "OVS1:" + base64url(JSON {v:1, runs}) + "." + 8-hex checksum (same scheme as the backup code). */
export function encodeStats(runs) {
  const body = toB64(JSON.stringify({ v: 1, runs: normalizeRuns(runs) }));
  return `${STATS_PREFIX}${body}.${checksum(body)}`;
}

/** Validate a pasted code: `{ ok: true, runs }` or `{ ok: false, error }`. Never throws. */
export function decodeStats(input) {
  const text = typeof input === 'string' ? input.replace(/\s+/g, '') : '';
  if (!text) return { ok: false, error: 'Paste a stats code first.' };
  if (!text.startsWith(STATS_PREFIX)) return { ok: false, error: 'That is not an Overdue! stats code (it should start with OVS1:).' };
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text.slice(STATS_PREFIX.length));
  if (!m) return { ok: false, error: 'The code looks cut off or damaged.' };
  if (checksum(m[1]) !== m[2]) return { ok: false, error: 'The code is damaged (checksum does not match).' };
  let data;
  try { data = JSON.parse(fromB64(m[1])); } catch { return { ok: false, error: 'The code could not be read.' }; }
  if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.runs)) return { ok: false, error: 'This code is from a different version and cannot be read.' };
  return { ok: true, runs: normalizeRuns(data.runs) };
}
