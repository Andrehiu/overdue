// Score storage. The game is fully static, so there are two places a Hall of Fame can live:
//  - on this device (localStorage) — the default, works anywhere, including GitHub Pages;
//  - a claude.ai hosted page's shared store, when the game runs as a claude.ai Artifact.

const NAME_RE = /^[A-Za-z0-9 _-]{1,12}$/;
const LOCAL_KEY = 'overdue.halloffame.v1';
const LOCAL_MAX = 50;

/** Top scores kept in this browser. */
function localBackend() {
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  return {
    kind: 'device',
    label: 'Best shifts on this device',
    async top(limit = 10) { return read().slice(0, limit); },
    async submit(payload) {
      const rows = read();
      const entry = { name: payload.name, score: payload.score, wave: payload.wave, kills: payload.kills, at: Date.now() };
      rows.push(entry);
      rows.sort((a, b) => b.score - a.score || a.at - b.at);
      const rank = rows.indexOf(entry) + 1;
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, LOCAL_MAX))); }
      catch { throw new Error('This browser blocked saving (private mode?).'); }
      return { rank, message: `Filed! #${rank} on this device.` };
    },
  };
}

/**
 * claude.ai hosted page: one document per player at scores/<viewer id> holding their personal best.
 * Publish with rules: scores read "view" / write "owner", and scores/{self} write "interact".
 */
function artifactBackend() {
  let dbP = null, userP = null;
  const db = () => (dbP ||= window.claude.use('db'));
  const user = () => (userP ||= window.claude.use('user'));
  const scores = async () => {
    const d = await db();
    if (!d) throw new Error('Sign in to claude.ai to see the shared Hall of Fame.');
    return d.collection('scores');
  };
  const clean = (doc) => {
    const v = doc.data() || {};
    return { name: NAME_RE.test(String(v.name)) ? v.name : 'Anonymous', score: Number(v.score) || 0, wave: Number(v.wave) || 1, kills: Number(v.kills) || 0 };
  };
  return {
    kind: 'shared',
    label: 'Hall of Fame',
    async top(limit = 10) {
      const snap = await (await scores()).orderBy('score', 'desc').limit(limit).get();
      return snap.docs.map(clean);
    },
    async submit(payload) {
      const col = await scores();
      const u = await user();
      const id = u && (await u.id());
      if (!id) throw new Error('Sign in to claude.ai to sign the shared logbook.');
      const ref = col.doc(id);
      const prev = await ref.get();
      const best = prev.exists ? Number(prev.data().score) || 0 : -1;
      let saved = false;
      if (payload.score > best) {
        try { await ref.set({ ...payload, at: Date.now() }); saved = true; }
        catch (e) {
          const code = e && e.code;
          if (code === 'permission_denied' || code === 'not_granted') throw new Error('Only people with Contributor access can sign this logbook.');
          throw new Error((e && e.message) || 'The logbook could not be saved.');
        }
      }
      const mine = saved ? payload.score : best;
      const higher = await col.where('score', '>', mine).limit(1000).get();
      const rank = higher.size + 1;
      return { rank, message: saved ? `Filed! You rank #${rank} in the Hall of Fame.` : `Your best (${mine.toLocaleString()}) still stands at #${rank}.` };
    },
  };
}

export function createBackend() {
  const hosted = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
  return hosted ? artifactBackend() : localBackend();
}
