# Art review: enemies (2026-11-22, planner)

Owner: "the enemies look kind of the same". Screenshots: iPhone 13 landscape (844×390), lineup + wing 7 room 3 + wing 10 room 5.
Code: `drawEnemy()` / `drawEliteHalo()` in `src/main.js`, sizes in `DEF`, colour rule in `src/palette.js` (`isEnemyHue`).

## Why they look the same
| # | Problem | Evidence |
|---|---|---|
| 1 | 3 of 5 types are "a circle with two eyes" | Bunny (grey fuzzy circle), patron (orange circle), worm head (pink circle) all use the same `eyes()` |
| 2 | Almost no size range | Radius 9–14 px for 4 of 5 types; only the golem (22) stands out |
| 3 | Colour can't carry the difference | Enemies must stay in the warm "enemy" hues (pink → orange), so hue alone can't separate them |
| 4 | Dark enemies vanish | Grey bunny outside the lantern is nearly invisible (wing 10 shot) |
| 5 | Elites flatten everything further | Same gold ring + crown on every type; elite bunnies read as "white ball in a gold ring" |
| 6 | Worm doesn't read as a worm | Segments drawn as separate circles that spread out while chasing |

Distinct already: overdue notice (paper rectangle), late fee golem (big square with $).

## Proposals (cheap on performance)
| Fix | What | Performance cost |
|---|---|---|
| A. Silhouettes | Bunny: fluffy dust ball with 2 ears; Patron: head + shoulders, big mouth (a person, not a ball); Worm: joined segments, head with tiny glasses | Neutral or faster if each type is pre-drawn into a cached sprite (bunny is 19 arc fills per frame today) |
| B. Size ladder | Small: bunny, notice · medium: worm (long), patron (bigger, ~16) · big: golem | Free (visual radius; hitboxes can stay) |
| C. Motion | Bunny hops (bounce + shadow), worm wiggles as one body, patron puffs before shouting (exists, exaggerate) | Free |
| D. Eyes in the dark | Tiny glowing eyes visible outside the lantern | Free, but drawn above the light layer: owner OK needed (lighting rule) |
| E. Elite trim | Keep the crown, replace the full gold ring with a gold outline on the enemy's own shape; red flare before firing stays | Free |

Recommendation: A + B + C + E as one session (v1.12.0 "enemy readability"), D only if the owner OKs it.
Gate: QA perf budget (≥ 0.85x speed, ≥ 50 fps), hitboxes unchanged, colours stay in enemy hues, lighting untouched.
