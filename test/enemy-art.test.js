// Enemy art colours and the patron ripple (pure data from src/enemy-art.js; no canvas needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { COL, BURST, GOLD_TYPES, rippleOf, shadowK } from '../src/enemy-art.js';
import { isEnemyHue, hueOf } from '../src/palette.js';

test('every enemy colour is in the enemy hue range, except the gold golem and coin', () => {
  for (const [type, cols] of Object.entries(COL)) {
    if (GOLD_TYPES.includes(type)) continue;
    for (const [name, hex] of Object.entries(cols)) assert.ok(isEnemyHue(hex), `${type}.${name} ${hex} (hue ${hueOf(hex).toFixed(0)}) is outside the enemy hues`);
  }
  for (const type of GOLD_TYPES) for (const hex of Object.values(COL[type])) assert.ok(hueOf(hex) >= 35 && hueOf(hex) <= 50, `${type} ${hex} should stay gold`);
});

test('kill-burst colours follow the body hues (gold types excepted)', () => {
  for (const [type, cols] of Object.entries(BURST)) {
    if (GOLD_TYPES.includes(type)) continue;
    for (const hex of cols) assert.ok(isEnemyHue(hex), `${type} burst ${hex}`);
  }
  assert.deepEqual(Object.keys(BURST).sort(), ['bunny', 'coin', 'golem', 'notice', 'patron', 'worm']);
});

test('patron ripple shows only while charging, and stays faint', () => {
  assert.equal(rippleOf(0), null);
  for (const ch of [0.05, 0.3, 0.5, 0.8, 1]) {
    const r = rippleOf(ch);
    assert.ok(r && r.alpha <= 0.3 && r.phase >= 0 && r.phase < 1, `ch ${ch}`);
  }
});

test('only bunnies bob their shadow', () => {
  assert.equal(shadowK({ type: 'golem', t: 1 }), 1);
  assert.ok(shadowK({ type: 'bunny', t: 0.17 }) < 1);
});
