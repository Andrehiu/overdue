// Pure matchers for the QA privacy scan (unit-tested in test/privacy-scan.test.js). No I/O here.
// Patterns are built from pieces so this file never matches its own scan.
const CODE = '[A-Za-z0-9_+/=.-]{20,}';
export const PASTED_CODE = new RegExp('\\b(?:OVD1|OVS1):' + CODE);
export const SAVE_JSON = /"overdue\.[a-z]+\.v1"\s*:\s*["{[0-9tfn-]/;
export const FIXTURE_MARK = '// synthetic fixture';

/** Split a QA_PRIVATE_TERMS-style value (comma or newline separated) into trimmed, non-empty terms. */
export function parseTerms(raw) {
  return String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Scan one text. Returns a list of hit labels (never the matched text or the term itself).
 * `file` is the path, or '(commit messages)'. Fixtures under test/ are exempt from the
 * pasted-data checks only when the file carries the synthetic-fixture marker.
 */
export function scanText(file, text, terms = []) {
  const hits = [];
  const exempt = /^test\//.test(file) && text.includes(FIXTURE_MARK);
  if (!exempt && PASTED_CODE.test(text)) hits.push(`pasted OVD1/OVS1 code in ${file}`);
  if (!exempt && SAVE_JSON.test(text)) hits.push(`save-like JSON in ${file}`);
  const lower = text.toLowerCase();
  for (const t of terms) if (lower.includes(t.toLowerCase())) { hits.push(`private term in ${file}`); break; }
  return hits;
}

/** Collapse hit labels to "N hit(s): <label>" lines. */
export function summarize(hits) {
  const counts = new Map();
  for (const h of hits) counts.set(h, (counts.get(h) || 0) + 1);
  return [...counts].map(([h, n]) => `${n} hit${n > 1 ? 's' : ''}: ${h}`);
}
