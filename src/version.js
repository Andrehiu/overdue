// Which build of the game is running. The build script injects the real values
// (version from package.json, the git commit, the build date); a plain local
// `npm run dev` shows "dev".
export const BUILD = globalThis.__OVERDUE_BUILD__ || { version: 'dev', commit: 'local', built: '' };

/** "v1.1.0 · afd3fcb · 21 Nov 2026" */
export function versionLabel(b = BUILD) {
  if (b.commit === 'local') return 'dev build (not deployed)';
  const date = b.built ? new Date(b.built).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return [`v${b.version}`, b.commit, date].filter(Boolean).join(' · ');
}

/** Ask the server which build is live. Resolves to that build, or null when unknown (offline, dev, hosted elsewhere). */
export async function fetchLatestBuild() {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return v && typeof v.commit === 'string' ? v : null;
  } catch { return null; }
}
