// Projectile colours. Pure module (no DOM), unit-tested.
//
// Rule: RED / ORANGE-RED / PINK belong to ENEMIES (their pages and sound rings). Everything the player
// throws stays in the gold → green → teal → blue → violet range, so the two never get confused.
// Normal books all look the same; a different look always means a perk is doing something.

export const PLAYER = {
  book: '#3f7fd6',     // standard library binding: every normal throw
  tome: '#c9a227',     // Leather-Bound Tome (Masterwork)
  saga: '#7bd88f',     // Complete Saga fan (Masterwork)
  volley: '#8f7bff',   // Silent Reading ring of books (combo)
  orbit: '#8f7bff',    // Audiobook Orbit
  wrapped: '#9be7dc',  // Interdimensional Loan: came back through a wall
};

export const ENEMY = { page: '#ff3b4e' };

/** Hue (0-360) of a #rrggbb colour. */
export function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Hues reserved for enemies: pinks, reds and orange-reds (270°..40°, wrapping through 0°). */
export const isEnemyHue = (hex) => { const h = hueOf(hex); return h >= 270 || h < 40; };
