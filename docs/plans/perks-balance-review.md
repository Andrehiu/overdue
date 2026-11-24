# Balance review: perks-new-and-fixes.md (v1.14.0 fixes + v1.15.0 mix)

Labels: **[code]** = read from source. **[model]** = my estimate. A model number should be checked by the bot before anyone tunes from it.

## Facts from the code that drive the verdicts [code]
- Throws: 4/s × 1 damage, 5% crit at ×2.5 (expected ×1.075). Books fly 520 px/s for 1.3 s, r 6, cap `MAX_BOOKS` 110. When the cap is full, a player throw deletes the **oldest** book.
- Pages: r 5, life 6 s. Elites fire one page at 150 × hazardSpeed (wing 1 ≈ 150, wing 8 ≈ 200 px/s), or a 3-fan from wing 7. Boss fans fly 210/260, radials 170–190, spirals 165.
- **`e.stun > 0` skips the whole AI switch, including `bossAI`, and stops the elite `shootT` timer.** Contact damage is still checked while stunned. Any stun therefore also silences elites and freezes bosses.
- `orbitHit` is one timer per enemy, shared by all orbit books, so the re-hit time caps damage no matter how many books there are.
- Enemy HP multiplier, mid-wing room (r = 5): wing 1 ×1.32, wing 5 ×2.48, wing 8 ×3.35. 1-HP enemies have 1 / 1 / 2 HP. Every wing starts with zero perks.
- The Reinforced Spines renovation adds damage **additively** (up to +1.0). With it maxed, a Hardcover pick is only +25%. Chute (fire rate) multiplies.

## 1. Audiobook Orbit rework (the owner's concern)
Hits per enemy per second = min(1/re-hit, n·ω/2π) = n × 0.64 [code geometry]. That is 1.27 / 1.91 / 2.55 for 2/3/4 books, and 4.0 (the 0.25 s cap) for Surround's 8.

**Page blocking [model].** In the book's rotating frame, a page crossing the ring is caught when it comes within 10 px of a book. Catch width along the ring = 20·√(v² + (ωr)²)/v. At v = 150 that is 42 px per book on a 440 px circle, so about **9.6% per book**. At 200 px/s it is 7.8%, at 260 px/s 6.7%. The fraction barely depends on the radius, so Surround's pulse doesn't dilute it.

| Books | Pages blocked (150 / 200 px/s) | Elite fire lost to stun | Ring DPS per enemy, HC0 | Ring DPS per enemy, HC3 |
|---|---|---|---|---|
| 2 (L1) | 19% / 16% | 19% | 2.0 | 5.1 |
| 3 (L2) | 29% / 23% | 29% | 3.1 | 7.7 |
| 4 (L3) | **38% / 31%** | 38% | 4.1 | **10.3** |
| 8 (Surround) | **~70% / ~60%** | **60%** | 6.5 | 16.1 |

- The plan's "6 damage/s at Hardcover 0" needs 7 or more books, so it only holds with Surround. At 3/3 the ring does 4.1.
- At Hardcover 3/3, the ring does **10.3 DPS to every enemy in the band**. That equals the whole single-target throw DPS of the build (4 × 2.5 × 1.075 = 10.75). With Footnotes 3/3 and Bibliography (expected crit ×3.0), one Surround enemy takes **45 DPS**, more than the build's throws (30).
- A 38% page block is worth about +3 max hearts against shooters, so it beats three Extended Loan picks. Surround would mostly delete wing-8 elites and boss pages.
- **Stun-lock [model].** Knockback 40 moves an enemy about 6.7 px. A bunny at about 120 px/s with 4 books crosses its 38 px band in about 0.8 s and takes 2–3 hits. The ring slows it but doesn't stop it. Under Surround its net inward speed falls to about 21 px/s (82% slow), so it takes about 7 hits, and wing-8 bunnies (about 7 HP) die in the band. Melee becomes nearly harmless.
- The real break is the boss. Its band is 22–118 px, so it sits in the ring while it drifts toward you and during charges. Stun pauses `bossAI` 38–60% of the time, including mid-charge.

**Verdict: too strong** (blocking, boss/elite stun, crit scaling). **Fair alternative:**
- Radius 64, spin 3.6, damage **1.25×**.
- Crits use `critChance` but at most ×2.5, so Bibliography doesn't apply. Orbit crits don't trigger Annotated.
- Re-hit 0.3 s. Knockback 90 (about 15 px) and **no stun**. If you want stickiness, give a 0.1 s stun to normal enemies only, never elites or bosses.
- **No blocking at L1–L3.** Surround Sound blocks, and each book blocks one page and then dims for 2.5 s (at most 3.2 pages/s).
- Result [model]: 2.3 / 2.3 / 3.1 / 4.5 × damage per enemy at L1 / L2 / L3 / Surround. Surround blocks about 50–60% of sparse elite fire and much less of a boss spiral.

## 2. Fixes table
| Item | Verdict | Number | Change |
|---|---|---|---|
| Dewey × Interlibrary | Fair; it breaks endless retries | Max homing life goes from ≥ 1.3 + 0.9 × wraps (4.0 s at L3, 5.3 s with Congress) to about 2.5 s, straight after the first wrap [code+model] | Keep. The card says "each perk alone unchanged", but the wrap refill goes from ≥ 0.9 to +0.4: shorter on left/right exits, longer on top/bottom. Interlibrary alone is still weak [model, about +5–12% DPS]. Watch for **CYOA retarget** (aims at the nearest enemy within 700 and clears `hit`), which becomes the new never-miss route with Infinite Bookmark |
| Speed Reader +30% of base | Fair | ×1.3 / 1.6 / 1.9 vs Hardcover ×1.5 / 2.0 / 2.5. Each pick is ×1.30 / 1.23 / 1.19 vs Hardcover's ×1.50 / 1.33 / 1.25 [code math] | Implement as `+= 1.2` (30% of 4). Otherwise Chute makes it 30% of 5.9. The GAIN line would print +30 / +23 / +19%, so fix the card text |
| Hardcover + Speed Reader + Trilogy | Not a new must-pick | The triad goes from 10.8× to 11.9× (+10%) [model]. It was already the generic stack | None |
| Footnotes +15% | Slightly weak but fine | ×1.30 / 1.53 / 1.75. Each pick is ×1.21 / 1.17 / 1.15, below Hardcover [code math] | Keep. Measure Annotated: 50% crits means a splash on every second hit |

## 3. New perks and combos (value per pick, Hardcover L1 = 1.0) [model]
| Perk | W1 | W5 | W8 | Verdict | Note / change |
|---|---|---|---|---|---|
| Leaky Pen | 0.8 | 0.45 | 0.35 | L1 weak; L3 fair | +12.5% on one target. Ink adds a fixed "hits worth" per enemy, so it fades as HP grows. **Indelible loops across frames**: ink kills don't go through the depth guard, which only works within one frame. At L3 HC3 (7.5 ink) it kills wing-8 bunnies (7 HP), so one kill can wipe a room. Splashed ink should be "weak" (50%) and never splash again (`inkGen`) |
| Cold Storage | 0.5 | 0.7 | 0.8 | Fair; grows late | A 40% slow gives about 1.67× time before contact. **Deep Freeze locks**: Trilogy plus fast throwing lands 30 or more hits/s on a boss, which is about 6 × 0.2 s freezes per second, so the boss is frozen all the time. Bosses immune; 3 s freeze cooldown per enemy |
| Static Cling | 0.3 | 0.3 | 0.3 | L1 too weak; Power Grid too strong | Extra damage per hit: +15% / +21% / +60%, and 0 against a lone boss. Power Grid is +200% in crowds. A zap of 0.6 doesn't kill a 1-HP notice. Try L1 35%; Power Grid jumps 3 times at 75%. Zaps must never cause zaps |
| Margin Notes | 0.8–1.6 (crowd), 0 (single) | same | same | **Too strong with Dewey** | Dewey turns 7.2 rad/s, so a 45° book turns in 0.11 s and a rear book in 0.44 s. With Dewey, L3 = 6 homing books per throw, more than Trilogy 3/3's 4, and about **4× Hardcover per pick**. Side and rear books should not home and should be `bonus: true` (skipped at the cap) |
| Last Chapter | 0.4–0.8 on average; 1.6 at 1 heart | rises late | rises late | **Too strong at 1 heart** | L3 at 1 heart = ×2.6, and Cliffhanger doubles that to ×5.2. Grace Period 3/3 (1.7 s safe time), Amnesty and Second Wind make 1 heart a stable state. Cap at 3 missing hearts, +15 / 25 / 35%, Cliffhanger +50% throw speed |
| Library Cat | 0.6 | 0.6 | 0.6 | L2 too weak | 2 × damage / 1.6 s = +29% DPS and it never misses. L2 (30% faster) adds only +9%. Make L2 also +50% pounce damage. Stray Colony's stuns must skip bosses and elites |
| Pop-up Book | 0.8 | 0.4 | 0.25 | Fair; fades late | 1 × damage vs bunny HP 3 / 5 / 7. A golem's 4 coins (1 HP up to wing 5) pop in a chain. Excess pops over 6 per frame must be **dropped, not queued** |
| Brittle Pages | 0.5 | 0.5 | 0.6 | Fair | Execute at 20% means enemies effectively take +25%. It scales with HP, so it is slightly better late |
| Conductive Ink | ? | | | Unclear spec | If "always jump" means a 100% zap chance on inked enemies, then L1 becomes +60% per hit and it spreads ink (the Indelible loop). Keep the zap chance and only bias the target |
| Superconductor | 1.0 or more | grows | grows | **Too strong** | At L3, about one 0.5 s freeze per hit, so everything within 150 px stays frozen and elites stop shooting. Same rule as Deep Freeze: bosses immune, cooldown per enemy |
| Ink Bombs | 1.2 | 0.6 | 0.5 | Loop risk | Pop → ink → ink kill → pop runs across frames. Ink kills must not pop, or pop ink must not spread |
| Crossfire | **too strong / perf** | | | | ×2 radius is ×4 area. Spine Breaker 85 becomes 170, and with Demolition 340, a screen-wide ×3 burst. Margin L3 plus fast throwing gives about 38 bursts/s. Use +50% radius, a 160 px cap, and at most 8 shelf bursts per second |

## 4. Perf red flags
- **Book cap:** Trilogy 3, Margin 3, Speed Reader 3, In the Zone and Saga need about 9 × 15.2 × 1.3 + 46 ≈ **220 books** against a cap of 110 [model]. Throws then delete the oldest books, so range and homing quietly halve.
- **Bursts:** each `inkBurst` loops over every enemy and adds 7 particles, 3 pages, a ring, a light and a sound. Crossfire can reach 40–70 per second.
- **Status damage noise:** ink ticks call `damageEnemy`, which plays a sound every time (80 enemies × 2 ticks/s = 160 hit sounds/s). Status damage should be silent.
- Orbit blocking costs 8 × 260 distance checks at 120 Hz. That is fine.

## 5. New dominant builds (replacing homing + wrap)
1. **Dewey + Margin Notes (+ Trilogy)**: the most likely new "the build".
2. **Audiobook 3/3 + Surround + Hardcover / Footnotes**: stand still, block pages, freeze the boss.
3. **Static + Cold Storage (Superconductor) + Speed Reader**: freezes everything.
4. **Leaky Pen + Pop-up (Ink Bombs / Indelible)**: room-wipe chains in wings 1–5.
5. **Last Chapter + Grace Period / Amnesty (+ Banned Book)**.

## The 5 most important changes
1. **Orbit:** no blocking at L1–L3, and Surround blocks 1 page per book per 2.5 s. No stun on elites or bosses (preferably none at all). Damage 1.25×, crits capped at ×2.5, re-hit 0.3 s.
2. **One stun and freeze rule for everything:** bosses never stun or freeze (they take +damage instead). Elites and normal enemies get a 3 s cooldown after a freeze. This covers Deep Freeze, Superconductor, Stray Colony and orbit.
3. **Side and rear books from Margin Notes don't home and are `bonus`.** Crossfire: +50% radius, a 160 px cap, and a global limit on bursts per second.
4. **A generation rule for chains that works across frames:** damage from ink, zaps or pops never creates more ink, pops or zaps (applies to Indelible, Ink Bombs, Grand Finale and Conductive Ink).
5. **Last Chapter:** cap at 3 missing hearts, +15 / 25 / 35%, Cliffhanger +50%. Also implement Speed Reader as `+= 1.2` and buff Static L1 and Cat L2.

## What the balance bot must measure (target ranges)
- Forced-perk clear rate for each new perk vs a Hardcover pick, at wings 1, 5 and 8: **within ±10 points**.
- Orbit: share of would-hit pages blocked (L3 **0%**, Surround **≤ 50%**); orbit share of all damage (L3 **15–30%**, Surround **≤ 40%**); boss kill time with Surround **≥ 80%** of the no-orbit time.
- Share of time stunned or frozen: bosses **≤ 5%**, elites **≤ 25%**.
- Thrown-book hit rate: Dewey 3/3 alone **85–92%**; Dewey + Interlibrary **≤ Dewey + 5 points**; book life p95 **≤ 2.5 s**.
- Speed Reader 3/3 vs Hardcover 3/3 clear rate: **within 5 points**.
- Chains: kills from one trigger within 1 s **≤ 6**; share of kills by ink **≤ 30%**.
- Books in flight p95 **≤ 100**, evictions per second **≈ 0** outside the stress build. Bursts per second p95 **≤ 20**. Stress build (Trilogy, Margin, Speed Reader, Zone, Saga, Crossfire, Demolition) on the wave-15 boss: **≥ 50 fps, ≥ 0.85× speed**.
- Last Chapter: share of the run spent at 1 heart; average damage multiplier **≤ 1.6×** at L3.
- Best pair or triple clear rate **≤ the best current pair + 10 points**.
