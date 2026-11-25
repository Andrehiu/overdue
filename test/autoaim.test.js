import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTarget, leadPoint } from '../src/autoaim.js';

const P = { x: 0, y: 0 };
const en = (x, y, extra = {}) => ({ x, y, ...extra });
const all = () => true;

test('autoaim: nearest visible wins over a nearer hidden enemy', () => {
  const near = en(100, 0), far = en(300, 0);
  assert.equal(chooseTarget(P, [near, far], 460, (e) => e === far), far);
});
test('autoaim: nobody visible -> nearest enemy behind shelves (Spine Breaker)', () => {
  const a = en(200, 0), b = en(100, 0);
  assert.equal(chooseTarget(P, [a, b], 460, () => false), b);
});
test('autoaim: out of range and empty -> null', () => {
  assert.equal(chooseTarget(P, [en(500, 0)], 460, all), null);
  assert.equal(chooseTarget(P, [], 460, all), null);
});
test('autoaim: sticky target is kept unless a visible one is 30% closer', () => {
  const s = en(200, 0), c1 = en(150, 0), c2 = en(139, 0);
  assert.equal(chooseTarget(P, [s, c1], 460, all, s), s);       // 25% closer: stay
  assert.equal(chooseTarget(P, [s, c2], 460, all, s), c2);      // 30.5% closer: switch
});
test('autoaim: a visible target beats a hidden sticky one, however far', () => {
  const s = en(50, 0), v = en(400, 0);
  assert.equal(chooseTarget(P, [s, v], 460, (e) => e === v, s), v);
});
test('autoaim: hidden sticky kept with nobody visible, unless another is 30% closer; dead/out-of-range sticky drops', () => {
  const s = en(200, 0), c = en(100, 0), c2 = en(180, 0);
  const none = () => false;
  assert.equal(chooseTarget(P, [s, c2], 460, none, s), s);
  assert.equal(chooseTarget(P, [s, c], 460, none, s), c);
  assert.equal(chooseTarget(P, [c2], 460, all, s), c2);          // sticky no longer in the list (died)
  assert.equal(chooseTarget(P, [en(470, 0, {}), c2], 460, all, en(470, 0)), c2);
});
test('autoaim: 50% lead, capped lead time', () => {
  const e = en(300, 0, { pvx: 0, pvy: 100 });
  const L = leadPoint(e, P, 600);                                // t = 0.5 s, lead = 0.5 * 100 * 0.5
  assert.ok(Math.abs(L.x - 300) < 1e-9 && Math.abs(L.y - 25) < 1e-9);
  const far = leadPoint(en(5000, 0, { pvy: 400 }), P, 100);      // t capped at 0.6 s
  assert.ok(Math.abs(far.y - 400 * 0.5 * 0.6) < 1e-9);
  assert.deepEqual(leadPoint(en(10, 10), P, 600), { x: 10, y: 10 });   // no velocity yet: aim at the enemy
});
