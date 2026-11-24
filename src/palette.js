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
  // Perk traits drawn on normal books (shape/trail/attachment, never a new body colour)
  ribbon: '#d4a72c',   // Bouncy Bookmark: gold ribbon trailing behind
  streak: '#8cbeff',   // Speed Reader: motion streak
  trail: '#9be7dc',    // Dewey Decimal Guidance: teal dotted homing trail
  glint: '#ffffff',    // Plot Twist: white arrowhead (pierce)
  crack: '#ffd54a',    // Spine Breaker: glowing cracked spine
  cat: '#8fa6c0',      // Library Cat: grey-blue fur
  catCollar: '#2fc4b2', // Library Cat: teal collar
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
export function isEnemyHue(hex) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (Math.max(...c) - Math.min(...c) < 40) return false; // whites and greys belong to nobody
  const h = hueOf(hex);
  return h >= 270 || h < 40;
}

/**
 * How a normal thrown book looks, from the perks you own. Each perk adds one trait; they stack.
 * Hardcover makes the book look bigger (visual only, the hitbox is unchanged).
 */
export function bookLook(owned = {}) {
  const L = { size: 1 + 0.15 * (owned.hardcover || 0), ribbon: !!owned.bookmark, streak: owned.speedreader || 0,
    trail: owned.dewey || 0, glint: !!owned.plottwist, crack: !!owned.spinebreaker };
  L.pointed = L.ribbon || L.streak > 0 || L.trail > 0 || L.glint; // directional traits: fly nose-first, no spin
  L.plain = !L.pointed && !L.crack && L.size === 1;
  return L;
}
