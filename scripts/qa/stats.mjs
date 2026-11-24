// Pure helpers for the QA perf checks (unit-tested in test/qa-stats.test.js).
export const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const spread = (xs) => ({ min: Math.min(...xs), median: median(xs), max: Math.max(...xs) });
