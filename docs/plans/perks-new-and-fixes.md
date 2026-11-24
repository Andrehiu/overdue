# Overdue! perk directions (design proposal, v1.14.0 fixes + v1.15.0 new perks)

Baseline read from code: 4 throws/s × 1 damage = 4 damage/s, 5% crits at 2.5×, books fly 520 px/s for 1.3 s, cap 110 books. Enemy HP: notice 1, bunny/worm 2, patron 5, golem 14.

## 1. Fix the existing perks

**(a) Dewey × Interlibrary.** Cause: every wrap sets `life = max(life, 0.9)` and clears `hit`, and homing (2.4–7.2 turn/s, reach 240+) keeps steering. So a book can live up to about 4 s and will find a target sooner or later.
- Rule: **homing only works on a book's first trip.** In `updateBooks`, on wrap set `b.wrapped = true`. Homing becomes `b.wrapped && !b.homingBoost ? 0 : homing`. Dewey's card gets the line "Homing stops once a book comes back through a wall".
- Wrap life: `b.life += 0.4` (was refilled to at least 0.9). Wraps still clear `hit`.
- Give Interlibrary its own reason to exist: **wrapped books deal +25% damage per trip** (`dmgMult *= 1.25`, cap ×2). It becomes the long-shot perk and pays off with wide shots (Margin Notes below).
- Interdimensional Loan (Masterwork): wrapped books home in at strength 6 (was 8) **on their first wrap only**, and deal ×2 damage. It stays the 3/3 reward, but with a time limit.
- Each perk alone is unchanged. Together, a missed book gets one more strong pass rather than endless tries.

**(b) Audiobook Orbit rework** (`orbiterPositions`, `updateOrbiters`):
| | today | proposed |
|---|---|---|
| radius | 48 | 70 (enemies reach it before they reach you) |
| spin | 3.2 | 4.0 |
| damage | 1× damage, never crits | 1.5× damage, uses `critChance`/`critMult` |
| re-hit per enemy | 0.35 s | 0.25 s |
| knockback | 220 outward | 40 outward, plus `e.stun = 0.15` (sticks in the ring) |
| new | – | orbit books block enemy projectiles (`hazards` within 10, cheap loop over a short list) |
| books per level | 1/2/3 | 2/3/4 (L1 card "+2 orbiting books") |
- Surround Sound: doubles the books and pulses out by +60 (was +30).
- Result: an enemy touching the ring takes 6 damage/s at Hardcover 0, which is 1.5× the base throw rate. Orbit becomes a real close-range defence, not filler.

**(c) Other outliers**
- **Speed Reader is weaker than Hardcover.** Speed Reader ×1.2 compounds to 1.73× at 3/3. Hardcover +50% adds up to 2.5×. Fix: **+30% of base per level** (4 → 5.2 → 6.4 → 7.6/s, so 1.9×). Faster throwing also helps every on-hit perk below.
- **Footnotes is weak.** At 3/3 it gives 41% crit, which is an expected ×1.62. That is about the same as one Hardcover level, spent over 3 picks. Fix: **+15% per level** (50% crit at 3/3, ×1.75).
- **Interlibrary alone, after the fix,** is still niche, but the damage-per-trip bonus gives it a role.
- Everything else looks in band. Check Spine Breaker in the 1.14.0 damage-share bot: auto-aim through shelves makes most books burst.

## Shared engine work (cheap status system)
- Per-enemy fields `inkT, inkDps, chillT, chill, staticT` are ticked inside the existing `updateEnemies` loop. Ink damage lands every 0.5 s (`e.inkTick`), so damage numbers merge and `damageEnemy` isn't called every frame.
- Speed uses `e.speed * (1 - chill)`; bosses take half.
- Status visuals are one cached 16×16 sprite per status (built once, like `glowSprite`), drawn with `drawImage` beside the enemy. No `shadowBlur`. Status colours stay out of enemy hues (`isEnemyHue` false): ink indigo `#5b6cff`, chill ice `#bfe6ff`, static gold `#ffe066`. Add them to `PLAYER` in palette.js so the palette test covers them.
- Chain arcs come from a pool of at most 12 polylines (3 segments, 0.12 s).
- On-kill bursts carry a depth guard (`game.burstDepth ≤ 2`) and at most 6 per frame, so `killEnemy → inkBurst → killEnemy` can't run away.
- Weapon types: the chance of a per-hit effect scales by `4 / weaponHitsPerSec` (clamped 0.5–2), so Index Cards don't proc 2.5× as often as Paperback.

---

## 2. Three directions

### Direction A: "Marginalia & Reactions" (status effects that meet each other)
| Perk | L1 / L2 / L3 card | Masterwork | Mechanics |
|---|---|---|---|
| 🖊️ **Leaky Pen** | Hits soak enemies in ink: +1 hit of damage over 2s / Ink hurts 50% more / Ink hurts twice as much and lasts 3s | **Indelible**: inked enemies that die splash ink on everything nearby | `stats.ink` 0.5/0.75/1.0 × damage per second. Refresh, no stacking. Weak on one target (+12% at 4 hits/s), strong spread across a crowd |
| ❄️ **Cold Storage** | Hits slow enemies 20% / 30% / 40% | **Deep Freeze**: every 5th hit on a slowed enemy freezes it for 1s | `stats.chill`, 1.5 s timer. The freeze uses `e.stun` (bosses 0.2 s) |
| 🔌 **Static Cling** | 25% of hits zap a nearby enemy / 35% / 50%, and zaps jump twice | **Power Grid**: zaps jump to 4 enemies at full damage | Arc to `nearestEnemy` excluding the one hit, reach 150, 60% damage |
| 🧾 **Late Fees** | +20% damage to enemies with ink, cold or static / +35% / +50% | **Collections**: enemies that die pass their effects to the nearest enemy | Multiplier in the `updateBooks` damage line |
| 🔕 **Quiet Hours** | SHHH! slows everything it hits / and inks it / and SHHH! recharges 20% faster | **Dead Silence**: SHHH! freezes for 1s on top of its stun | Hooks into `doShhh`. Works even without the other status perks (uses the L1 numbers of each) |
| 📏 **Fine Print** | Effects last 30% longer / 60% / 100% | **Small Print Everywhere**: every book applies every effect you own at 2× | `stats.statusDur` multiplier |
| Combo | Parents | Effect |
|---|---|---|
| 🧊 Brittle Pages | Leaky Pen + Cold Storage | Inked and slowed enemies shatter at 20% health (bosses: +25% damage taken instead) |
| ⚡ Conductive Ink | Static Cling + Leaky Pen | Zaps always jump between inked enemies, and spread ink |
| 🥶 Superconductor | Cold Storage + Static Cling | Zaps freeze slowed enemies for 0.5s |
| 📝 Errata | Footnotes + Late Fees | Crits copy the target's effects onto enemies nearby |
| 🤐 Gag Order | Quiet Hours + Quiet Please | SHHH! leaves a lingering cold field for 3s (re-applies chill every 0.5 s) |

### Direction B: "Angles & Nerve" (where books go, and risk/reward)
| Perk | L1 / L2 / L3 card | Masterwork | Mechanics |
|---|---|---|---|
| ↗️ **Margin Notes** | +2 books thrown diagonally / +1 book thrown behind you / +2 more diagonal books | **Compass Rose**: every 3rd throw fires 8 ways | Extra `spawnBook` at aim ±45° (then ±30/±60), and at aim+π. These are normal books with every trait |
| 🔄 **Pass It On** | Books that hit an enemy bounce to another (+1 pass) / +2 passes / Passes lose no damage | **Chain Letter**: every pass also bursts | On hit with `b.passes > 0`, re-aim at the nearest unhit enemy within 200, −25% damage per pass |
| 🎯 **Close Reading** | +30% damage to enemies near you / +50% / +70% | **Point Blank**: close hits knock back and stun | Distance under 110 from the player at hit time |
| 🔭 **Long Read** | Books hit harder the farther they fly, up to +40% / +70% / +100% | **Overdue by Miles**: books never expire before hitting a wall | Track `b.dist`. Bonus = min(1, dist/500) × max |
| 📉 **Last Chapter** | +20% damage per missing heart / +30% / +40% | **Cliffhanger**: at 1 heart, throw speed doubles | Counts at most 4 missing hearts. Recomputed when hit or healed |
| 🏃 **On the Go** | Books thrown while moving pierce +1 / and fly 20% faster / and +20% damage | **Momentum**: after dashing, the next 3 throws are tomes | Check `player.moving` in `fire()` |
| Combo | Parents | Effect |
|---|---|---|
| ✖️ Crossfire | Margin Notes + Spine Breaker | Side and rear books burst twice as big on shelves |
| 🌍 Long-Distance Loan | Long Read + Interlibrary | Trips through the wall count as distance, +1 trip |
| 🛡️ Plot Armor | Last Chapter + Grace Period | At 1 heart: +1s safety after a hit and SHHH! recharges 2× faster |
| 🏃‍♀️ Hit and Run | On the Go + Espresso | Dashing throws a fan of 5 books behind you |
| 📇 Cross-Reference | Pass It On + Footnotes | Passes can crit, and crit passes add +1 pass |

### Direction C: "Staff & Chain Reactions" (helpers, on-kill effects)
| Perk | L1 / L2 / L3 card | Masterwork | Mechanics |
|---|---|---|---|
| 🐈 **Library Cat** | A cat pounces on enemies for 2× damage / Pounces 30% more often / Pounces hit everything nearby | **Stray Colony**: a second cat joins, and pounces stun | One entity, pounce every 1.6 s at `nearestEnemy` (ignores line of sight: it's a cat). Grey-blue with a teal collar |
| 🎉 **Pop-up Book** | Defeated enemies pop, hurting enemies nearby / Bigger pops / Pops hit twice as hard | **Grand Finale**: pops set off more pops | `inkBurst` from `killEnemy`, radius 45/60/60 × damage 1/1/2, teal and gold ring (never red: the red wing-4 elite page ring means "danger") |
| 📗 **Sequel** | Each defeat throws a free book at the nearest enemy / +1 free book / Free books pierce | **Series**: free books can trigger more free books | Bonus `spawnBook` with `bonus: true` (skipped first at the cap) |
| 🍪 **Snack Break** | Defeated enemies have +2% chance to drop a heart / +3.5% / +5% | **Potluck**: every 40 defeats heals 1 | Extends the drop roll in `killEnemy` (only when hurt) |
| 🛒 **Book Cart** | A cart rolls across the room every 6s, flattening enemies / every 4.5s / hits 2× | **Bookmobile**: the cart follows you and rams the nearest crowd | Line sweep, 3× damage, one simple sprite |
| 📈 **Page-Turner** | Defeats give +3% throw speed for 3s, stacking to 10 / 15 / 20 | **Binge Read**: at full stacks, books pierce +2 | Uses the existing `game.combo` timer |
| Combo | Parents | Effect |
|---|---|---|
| 🧶 Cat's Cradle | Library Cat + Audiobook | Pounces pull enemies into your orbit, and orbit hits on stunned enemies deal 2× |
| 🎊 Confetti Cannon | Pop-up Book + Sequel | Pops fling 3 books outward |
| 🙀 Scaredy Cat | Library Cat + Quiet Please | SHHH! makes the cat pounce 3 stunned enemies at once |
| 🧨 Pile-up | Book Cart + Spine Breaker | The cart bursts every shelf it passes |

## 3. Synergy map
- **A** makes more interesting: Speed Reader, Trilogy, Plot Twist, Unreliable Narrator (more hits means more effects), Quiet Please / Silence, Footnotes (Errata), Hardcover (ink scales with damage). Pressure: Annotated Edition's splash overlaps Indelible. Dewey matters less, which is good.
- **B** makes more interesting: **Interlibrary** (wide books wrap back in, Long-Distance Loan), Spine Breaker (side books hit shelves), Bookmark, Grace Period and Extended Loan (risk buffer for Last Chapter), Espresso. Risk of making obsolete: Margin Notes overlaps Trilogy, and Pass It On overlaps Choose Your Own Adventure / Dewey.
- **C** makes more interesting: Audiobook (Cat's Cradle), Quiet Please, Spine Breaker, and Trilogy (more kills). Risk of making obsolete: Pop-up overlaps Annotated/Spine Breaker bursts, and Sequel overlaps Dewey as "free accuracy".

## 4. Comparison and recommendation
| | A Reactions | B Angles & Nerve | C Staff & Chains |
|---|---|---|---|
| Fun / variety | 5: emergent combos | 4: feel changes at once | 4: helpers are charming |
| Clarity on a phone | 3: three new icons on enemies | 5: you see where books go | 4: cat and pops are readable; the cart is busy |
| Build effort (1–5) | 4: status system and sprites | 2: mostly `fire()` and the hit line | 4: cat and cart entities, art |
| Balance risk | Medium: execute and freeze chains | Medium–high: Last Chapter, Pass It On | Medium: pop chains in crowds |
| Perf risk | Low–medium (tick timers, ≤ 12 arcs) | Medium (Margin Notes pushes toward 110 books) | Low–medium (burst depth cap) |

**Recommendation: one 1.15.0 release of 7 perks that combines the strongest of each direction.**
1. 🖊️ Leaky Pen, ❄️ Cold Storage, 🔌 Static Cling: the status core.
2. ↗️ Margin Notes: the directional shots. They give Interlibrary its new role.
3. 📉 Last Chapter: risk/reward.
4. 🐈 Library Cat: the one pet.
5. 🎉 Pop-up Book: on-kill.

Combos (5):
- Brittle Pages, Conductive Ink and Superconductor: the three status-meets-status reactions.
- **Ink Bombs** (Pop-up Book + Leaky Pen): pops spread ink.
- **Crossfire** (Margin Notes + Spine Breaker).

Total perks: 22 (15 + 7).

Keeping the pool healthy:
- Give the new perks weight 5, so existing combos stay reachable.
- Bias the roll slightly toward combo partners of owned perks, so pairs still land in a 15–20-pick run.

Order and rules:
- Ship the 1.14.0 fixes first (Dewey/Interlibrary, Orbit, Speed Reader, Footnotes), then measure new perks with the same forced-perk bot. Target: each new perk gives about the clear rate of a Hardcover pick (±10 points).
- Endless: add the perks to both pools like the existing ones. Waves stay seed-identical, but perk rolls shift. Suggest a small "v1.15+" mark on Hall of Fame rows, so old and new scores are told apart without ranking them separately.
- Cut list if effort is tight: Cold Storage plus Superconductor (A still works with Ink + Static).
