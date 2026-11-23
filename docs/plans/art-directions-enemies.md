# Enemy art: three directions (art director brief, 2026-11-22)

What the screenshots show: in combat-w10 the elite bunny, elite patron and elite worm are all "pale disc + gold ring + crown" at 30 px. The grey bunny outside the lantern (top of w10) is a smudge. The golem and the notice already read well, so keep their shapes.

**Colour fixes that apply to every direction.** Some current colours break `isEnemyHue`, so bring them into the rule:
- Bunny grey `#ddd5c6` becomes dusty rose `#c98a9e` (hue 340°). Its shadow tone is `#7a3f55`.
- Notice paper `#f4efe1` becomes pink slip `#f7c9c4` (hue 6°). Its ink is `#b3202e`.
- Worm segment green `#7bd88f` becomes `#e0607f`. The head stays `#ff8fb1`.
- Golem `#b8860b` (43°) becomes copper-gold `#c97a1e` (32°). Its dark tone is `#6b3a0c`.
- Coin `#ffd54a` (45°) becomes `#ffb43a` (37°). Its rim is `#a8560f`.
- Unchanged: `OUTLINE #120a06`, the white hit flash `#fff`, the patron `#ff9f43`, and the elite red flare `#ff4d5e`.

The lighting layer and the hitboxes (`DEF.r`) stay untouched in all three directions. "r" below always means the hitbox radius.

---

## Direction 1: "Shape Alphabet" (silhouette first)
**Pitch:** every type gets its own geometric primitive and its own size step, so you can tell them apart from the black outline alone.
**Solves best:** telling types apart at a glance in a crowd, including in silhouette at the edge of the light.

| Enemy | Drawing (sizes relative to the visual radius R) | Idle / move | Tell |
|---|---|---|---|
| Bunny | A **6-point soft star**. Outer points at 1.0R, inner points at 0.6R, traced with `quadraticCurveTo` so the points are blunt. Fill `#c98a9e`, 2 px outline. Two dot eyes (1.5 px, `#fff`) with no pupils. | Rotates slowly (0.8 rad/s) and squash-bounces at 10 Hz. | none |
| Notice | Keep the **rectangle**, 0.9R wide × 1.2R tall, with a **folded top-right corner**: a 0.35R triangle in `#d99a95`. Draw a red "OVERDUE" bar (`#b3202e`) on it. | Flutter as today, but limit the scale-X squeeze to ≥ 0.75 so it never turns into a line. | none |
| Patron | A **wide capsule**, top-down "head + shoulders". The shoulders are an ellipse 1.3R × 0.8R in `#c2571f`. The head is a 0.6R circle in `#ff9f43`, set 0.2R toward the player. Draw only an open mouth (dark `#3a0d0d` ellipse) and no eyes, so it is the only "mouth" enemy. | Shoulders sway ±0.1 rad while walking. | Existing charge-up, but scale the **shoulders only** (up to 1.4×). Draw a thin ring at R+4 (`#ff9f43`, alpha 0.6) that shrinks inward. |
| Worm | One **tapered tube**. Stroke a single path through head → segments with `lineCap/lineJoin='round'`: an outline pass at 2R+3 px, then a body pass in `#e0607f`. Add a 1 px `#7a2a40` band across each segment joint. The head is a 1.1R circle in `#ff8fb1` with 2 dot eyes. | The body follows its existing positions, so the motion is free. | none |
| Golem | Keep the **square**, at 1.15R. Add 2 small "feet" (0.3R rectangles) under it. | Rocks ±0.06 rad with each step. | none |
| Coin | A **thin disc**: spin squash as today, but the minimum width is 0.35. Add one sparkle tick (2 px white cross) every 0.6 s. | | |
| Elite | Remove the full ring. Draw the type's **own silhouette, enlarged by 2.5 px, in `#ffd54a`** behind the body as a cached "gold outline" sprite, and keep the crown. | | The red flare recolours that outline to `#ff4d5e` and pulses it 1.5 px, as today. |

**Size ladder (visual R):** coin 7 · bunny 9 (smaller than the hitbox of 11; that is OK and reads as swarm fodder) · notice 11 · worm head 10, segments 9 → 7 tapering · patron 17 · golem 25. Elites are ×1.25 as today.

**Performance:** cache one canvas per type, made at `devicePixelRatio`, holding the body, outline and eyes. Also cache a white-flash copy and a gold-outline copy per type (the outline made once by drawing the silhouette 8 times offset ±2.5 px in gold). Per entity per frame this costs 1–2 `drawImage` calls plus the rotation transform. Today a bunny costs about 23 `arc` fills, so this is **cheaper than now**. The worm costs 2 strokes per chain instead of 2 fills per segment.

**Risks:** it is the least "cute" direction, because the faces mostly disappear. The bunny star could read as a hazard or pickup. The patron without eyes may feel faceless.

---

## Direction 2: "Cast of Characters" (personality and face language)
**Pitch:** each enemy is a little library character with **its own face grammar**, so no two share eyes again.
**Solves best:** charm and memorability ("the angry slip", "the shushing guy"), and teaching what each one does.

| Enemy | Drawing | Face | Idle / move | Tell |
|---|---|---|---|---|
| Bunny | A fluffy ball of 5 cached lumps (not 9 live arcs), radius 0.85R, in `#c98a9e`. Two **long ears**: ellipses 0.3R × 0.8R pointing up and away from the player, with inner ear `#e8b4c3`. A 2 px **dust tail puff**. | Two tiny **bead eyes** (1.6 px, `#120a06`) on a lighter `#e8b4c3` face patch. | **Hops**: y-offset `-abs(sin(t·9))·4` px, with a shadow ellipse that shrinks at the top of each hop. | none |
| Notice | A paper slip as today, in `#f7c9c4`. | **One big angry eye**: a 0.35R white circle with a `#b3202e` pupil and a slanted brow line. Under it a **red date stamp** "DUE" drawn as a rotated rectangle. | Flutters and leans toward its heading. | none |
| Patron | Top-down person. Shoulders are a `#c2571f` ellipse 1.3R × 0.8R. The head is a `#ff9f43` 0.62R circle. Add a **phone** (a 0.25R `#120a06` rectangle) held at one side. | Two half-closed eyes (flat arcs) and an **open mouth** that faces the player. | Shoulders bob with each step. | The charge grows the head 1.3× and turns the mouth into a wide rectangle. Two "))" arcs appear in front of the mouth. |
| Worm | Joined segments drawn as cached **book spines**: rounded rectangles 1.4R × 1.0R in alternating `#e0607f` / `#c94a6a`, with a 1 px `#7a2a40` band. Each one rotates to its heading, overlaps the next by 35% and gets 10% smaller. | The head (`#ff8fb1`) wears **round reading glasses**: two 0.3R `#120a06` 1.2 px rings joined by a bridge, with pupils showing through. | The head wiggles side to side (±0.2 rad, 8 Hz). | When it burrows, the glasses glint (a white 1 px tick). |
| Golem | A stack of **3 ledgers**, each a rounded rectangle 2.2R × 0.7R in `#c97a1e` / `#a8601a` / `#c97a1e`. The edges are offset ±2 px so it looks stacked. Keep the "$" on the front ledger. | Two **slot eyes** (`#ffd9a0`, 5 × 2 px rectangles) set into the top book. | A stomp: the stack compresses 6% on each step. | none |
| Coin | `#ffb43a` disc with a `#a8560f` rim. | **Tiny smug face**: two 1 px dots and a smile arc. Visible only when the spin squash is above 0.6. | | |
| Elite | Keep the crown (perched on the bunny's ears, the patron's head, the worm's glasses), plus a gold outline on the own shape (as in Direction 1). Elites get **red irises** (`#ff3b4e`) in their type's own eye style. | | | The red flare: outline plus irises flash `#ff4d5e`. |

**Size ladder:** coin 7 · bunny 9 (with ears it reaches 14 px tall) · notice 11 · worm 10/8 · patron 17 · golem 26 (tall stack).

**Performance:** cache bodies per type as 4-frame animations (bunny hop, golem stomp, patron bob), plus white and gold-outline variants. Draw the eyes/pupils live: at most 4 small arcs, as today. Cost per entity is about 2–3 `drawImage` + 2–4 arcs, which is **about equal to or cheaper than now**. The bunny hop shadow is 1 ellipse.

**Risks:** the most detail per pixel. At 9 px the bunny ears and worm glasses are only 2–3 px, so they **must be checked on a 3× iPhone screenshot**. It is also the largest drawing job.

---

## Direction 3: "Signatures in the Dark" (motion and trace readability)
**Pitch:** you recognise each enemy by **how it moves and what it leaves behind**, even outside the light. Bodies change only modestly.
**Solves best:** the dark-room problem. Enemies at the edge of the lantern stay identifiable in wings 7–10.

| Enemy | Body change (minimal) | Signature motion / trace | Tell |
|---|---|---|---|
| Bunny | 5-lump cached ball in `#c98a9e`, visual R 9. | **Hops**: same formula as in Direction 2. Each landing drops a dust puff: a ring 4 → 10 px in `#c98a9e`, alpha 0.4 → 0, lasting 0.35 s. These come from a shared particle pool, max 40. | none |
| Notice | Pink slip as above. | **Zig-zag streak**: keep the last 4 positions and draw one 1.5 px `#f7c9c4` polyline at alpha 0.35 behind it. | none |
| Patron | Body as today but R 17, with the mouth facing the player. | **Constant faint sound ripple**: one 1 px `#ff9f43` ring that expands from R to R+10 every 1.2 s at alpha 0.3. | The ripple rate rises to 6/s and goes solid. The body swells (existing). |
| Worm | One stroked tube, as in Direction 1. | The tube **undulates** with a sine offset along its length. A dirt-crumb trail (3 dots, `#7a2a40`) marks where it burrowed. | none |
| Golem | Square as today, in `#c97a1e`. | **Stomp**: every 0.5 s a 1 px dark ring (`#6b3a0c`, alpha 0.35) expands 0 → 30 px from its feet. | none |
| Coin | Disc. | A **glint trail**: 2 fading 2 px `#ffb43a` squares. | |
| Elite | Gold outline on its own shape plus the crown (as in Direction 1). | It drags a **red page-flutter**: one `#ff3b4e` 3 × 4 px rectangle shed every 0.4 s, which hints that it shoots pages. | The red flare is unchanged. |

**Optional (needs owner OK):** draw **glowing eyes above the light layer** in a single pass after lighting. Each type has its own eye pattern:
- bunny: 2 pink dots, `#ff8fb1`
- notice: 1 red dot, `#ff3b4e`
- patron: 2 orange slits, `#ff9f43`
- worm: 2 tiny rings (glasses)
- golem: 2 wide slots, `#ffb43a`

Each is 1–2 px at alpha 0.85, with **no glow and no shadowBlur**. Only draw them for enemies more than 0.5 of the lantern radius from the player, so they don't double up inside the light.

**Size ladder:** coin 7 · bunny 9 · notice 11 · worm 10/8 · patron 17 · golem 24.

**Performance:** trails and rings are the cost. They use one shared pooled particle array with a hard cap (≈ 80 total) and are drawn **batched per colour inside a single `beginPath`**. Expect about +0.3 ms per frame at 60 enemies, so it **needs the QA perf budget run**. The bodies are cached as in Directions 1 and 2.

**Risks:** more motion means more noise in an already busy screen with 100+ pages, and the rings can be confused with the patron's attack ring or the Shhh rings. The bodies are still fairly alike up close.

---

## Comparison

| | 1 Shape Alphabet | 2 Cast of Characters | 3 Signatures in the Dark |
|---|---|---|---|
| Readability at a glance (crowd) | **5** | 4 | 3 (4 with eyes) |
| Readability in the dark | 3 | 3 | **5** (with eyes) |
| Charm | 2 | **5** | 3 |
| Effort (1 = small) | 2 | 4 | 3 |
| Perf risk | lowest (faster than today) | low | medium (particles) |

## Recommendation
Build **Direction 2's characters on Direction 1's silhouettes**. Shapes and the size ladder do the identification work; faces give the charm. Concretely:
- bunny: hopping eared puff
- patron: wide shoulders and a mouth
- worm: a single tube of book spines with glasses
- golem: a ledger stack
- elites: an outline on their own shape instead of the ring

Ship it with the cached-sprite pipeline, which makes enemy drawing cheaper than today. From Direction 3, take only two things: the **bunny hop** (free) and the **patron ripple tell**. Offer the **glowing eyes** to the owner as a separate yes/no.

Before merging, check on an iPhone 3× screenshot that the 9 px details survive, and that `isEnemyHue` passes for every new hex.
