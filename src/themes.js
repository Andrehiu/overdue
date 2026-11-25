// Act themes (v1.16.0): one object per act, read by buildBackground() and the lamp glow in main.js.
// Pure data (no DOM) so it is unit-tested. Act I is exactly what the game always looked like; the
// lighting system (dark room, lamp pools, lantern) is NOT part of a theme, only colours are.
// Later acts (Overgrown Conservatory, Clockwork Archive) are one more entry each.
export const ACTS = [
  { act: 1, name: 'The Library', short: 'Act I' },
  { act: 2, name: 'The Sunken Stacks', short: 'Act II' },
];

const BOOKS_WARM = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#f1c40f', '#7f8c8d', '#e84393', '#2c3e50', '#b33939', '#218c74'];
// Cool, desaturated spines: slate, teal, moss, dusty violet, bone (never warm, never enemy red).
const BOOKS_COOL = ['#3b6b8a', '#4f8a8b', '#58795e', '#6c6a99', '#8aa0a8', '#2f4f66', '#7a8f6a', '#9aa7b0', '#46607f', '#5b7f95', '#6a7d86', '#3f7f74'];

export const THEMES = {
  1: {
    act: 1,
    floor: { kind: 'planks' },                       // per-wing hue/rug still come from the wing
    shelf: { shadow: '#4a2f18', body: '#5b3a1e', top: '#86592f', face: '#1c1008', faceLine: 'rgba(255,220,170,0.12)', inside: '#140b05', end: '#8a6a3a', rim: '#8a5a2b' },
    books: BOOKS_WARM,
    lamp: { base: '#2b1d10', bulb: '#ffd27a', glow: 'rgba(255,190,90,0.6)' },
    wall: '#120b06',
  },
  2: {
    act: 2,
    floor: { kind: 'flagstone', stone: [196, 9, 14, 22], gap: 'rgba(0,0,0,0.5)', hue: 196, rug: '#173a44', rugLine: '#6fb7c4',
      water: { deep: '#06222b', mid: '#0b3a46', ripple: 'rgba(150,225,235,0.16)', edge: '#0c141a', foam: 'rgba(190,240,245,0.22)' } },
    shelf: { shadow: '#2a3238', body: '#434e55', top: '#7d8c95', face: '#161c20', faceLine: 'rgba(190,225,240,0.12)', inside: '#0c1114', end: '#7d8c95', rim: '#6e7f89' },
    books: BOOKS_COOL,
    lamp: { base: '#1b2a30', bulb: '#d6f6ff', glow: 'rgba(130,215,235,0.55)' },
    wall: '#070d10',
  },
};

/** The theme for an act number (unknown acts fall back to Act I). */
export const themeOf = (act) => THEMES[act] || THEMES[1];
