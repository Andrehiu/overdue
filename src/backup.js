// Save backup code (v1.13.1): all player data as one short text code you can copy and paste on another phone.
// Pure module (no DOM, no localStorage) so it is unit-tested. Format: "OVD1:" + base64url(JSON) + "." + 8-hex checksum.
// The JSON is { v: 1, keys: { "<localStorage key>": "<raw string value>" } }. Only the keys below are ever read or written.
export const BACKUP_KEYS = [
  'overdue.settings.v1', 'overdue.best.v1', 'overdue.name.v1', 'overdue.halloffame.v1',
  'overdue.codex.v1', 'overdue.progress.v1', 'overdue.tips.v1',
];
export const BACKUP_PREFIX = 'OVD1:';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });

/** FNV-1a 32-bit hash of a string, as 8 hex chars. Catches typos and truncated pastes (not a security feature). */
export function checksum(s) {
  let h = 0x811c9dc5;
  for (const b of enc.encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function toB64(str) {
  let bin = ''; for (const b of enc.encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Build a code from a `{ key: rawStringOrNull }` map (only BACKUP_KEYS with a value are included). */
export function encodeBackup(values) {
  const keys = {};
  for (const k of BACKUP_KEYS) if (typeof values?.[k] === 'string') keys[k] = values[k];
  const body = toB64(JSON.stringify({ v: 1, keys }));
  return `${BACKUP_PREFIX}${body}.${checksum(body)}`;
}

/** Fully validate a pasted code. Returns `{ ok: true, keys }` or `{ ok: false, error }` (plain-English). Writes nothing. */
export function decodeBackup(input) {
  const text = typeof input === 'string' ? input.replace(/\s+/g, '') : '';
  if (!text) return { ok: false, error: 'Paste a backup code first.' };
  if (!text.startsWith('OVD')) return { ok: false, error: 'That doesn’t look like an Overdue! backup code.' };
  if (!text.startsWith(BACKUP_PREFIX)) return { ok: false, error: 'This code is from a different version of the game and can’t be read here.' };
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text.slice(BACKUP_PREFIX.length));
  if (!m) return { ok: false, error: 'The code looks cut off or damaged. Copy it again in full.' };
  if (checksum(m[1]) !== m[2]) return { ok: false, error: 'The code is damaged (checksum doesn’t match). Copy it again in full.' };
  let data;
  try { data = JSON.parse(fromB64(m[1])); } catch { return { ok: false, error: 'The code could not be read.' }; }
  if (!data || typeof data !== 'object' || data.v !== 1) return { ok: false, error: 'This code is from a different version of the game and can’t be read here.' };
  if (!data.keys || typeof data.keys !== 'object' || Array.isArray(data.keys)) return { ok: false, error: 'The code has no saved data in it.' };
  const keys = {};
  for (const k of BACKUP_KEYS) {
    const v = data.keys[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: 'The code has damaged data in it.' };
    try { JSON.parse(v); } catch { return { ok: false, error: 'The code has damaged data in it.' }; }
    keys[k] = v;
  }
  if (!Object.keys(keys).length) return { ok: false, error: 'The code has no saved data in it.' };
  return { ok: true, keys };
}

/** What a restore would replace, for the confirm line: "12,340 fines · Wing 3". Reads the already-validated keys. */
export function describeBackup(keys) {
  try {
    const p = keys['overdue.progress.v1'] ? JSON.parse(keys['overdue.progress.v1']) : null;
    if (p && typeof p.fines === 'number') return `${Math.floor(p.fines).toLocaleString('en-US')} fines banked`;
  } catch { /* fall through */ }
  return `${Object.keys(keys).length} saved items`;
}
