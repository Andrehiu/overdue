# Roadmap

The plan and the owner's decisions, kept current by the planner session. **Planners: read this after CLAUDE.md.**
Coder sessions are tagged `overdue-coder` and titled `Overdue · v<version> <topic>`; their prompts are saved in `docs/handoffs/`.

## Current state (planning 5, 2026-11-25)
- **Live:** v1.16.0 (46889c7): Pages run green first try (run 37, the first with the build → deploy split). CI for 46889c7 was still running at 08:33 UTC. = Act II
  "The Sunken Stacks" wings 11–12 (water, stone walkways, Ink Eel, Paper Boat, act swipe on the wing map, hidden tester switch:
  7 taps on the title version line, `overdue.tester.v1`) + deploy split (pages.yml build job → deploy job; first real test is this
  push). Before: 1.15.0 new perks, 1.15.1 look & feel, 1.15.2 story HP −5%, 1.15.3 Margin 30% narrower + auto-aim (line of
  sight, sticky, 50% lead), 1.15.4 diagonal see-through SHHH/DASH. **Running:** 1.16.1 coder `session_014kswNmJdTHfULWiYMAJkcn` (branch `claude/act2-longer`, handoff `docs/handoffs/1.16.1-act2-longer.md`), started 08:32 UTC; check-in at 09:49 UTC; tester after.
- **Planner branch:** `claude/brave-galileo-jyg38o` (= main + docs). Review worktree used: scratchpad `rev`.
- **Roles (CLAUDE.md):** planner plans; Sonnet coders code (max 2 at once); **one Sonnet tester per release** (tag `overdue-tester`,
  template `docs/handoffs/tester-template.md`, doesn't count toward the 2). First tester (1.16.0) worked well: ~12 min, caught the
  wing 10→11 step, What's-new card blocking the tester taps, old-save Act II unlock. Keep it.
- **Owner habits:** short replies; ships only on "ship"; playtest mode = numbered log only; 3-option pages for visual choices;
  to-scale phone pictures for UI tweaks (scratchpad/btn/shot*.cjs: serve a worktree on :5199 and screenshot iPhone 13);
  08:00 SGT morning update when going to sleep. Usage limit was hit once (2026-11-25): keep coder tasks tight.
- **Deploys:** if the Pages run fails, start a fresh run (workflow_dispatch); never "re-run failed jobs". Watch whether the
  build/deploy split stops the hiccup (it failed first-try in 4 of 6 releases before).
- **Next (owner-approved, not started):**
  1. **1.16.1 Act II longer:** Act II wings 9 rooms (elite room 5, boss last) + ~15% more enemies per room; re-tune so wing 11
     is clearly harder than wing 10 (tester bot: 10 50%, 11 52%, 12 43% at max Renovations; target steps ≤ 15–20 pts, wing 11
     below wing 10). Fix What's-new card covering the version line (blocks tester taps). Act I + endless unchanged.
  2. **Cat readability:** Library Cat mistaken for an enemy when it moves → teal outline like the player, trail to the player.
  3. **Strong perks:** owner collects perk names + Share stats codes (in chat only) from testers; then bot measure, then tune.
  4. **Act II wings 13–20** in batches, 2 new bosses (wings 15, 20), crab enemy; later Acts III (Overgrown Conservatory) and
     IV (Clockwork Archive) from https://claude.ai/artifact/9wgzQWpVvdovMR5fiGdu95.
  5. Book Bag (Renovations 2.0) and Player look after that.
- **Owner to do:** phone checks for 1.15.3/1.15.4/1.16.0 (aim feel, buttons reach, swipe vs iOS back gesture, 7-tap switch,
  eel/boat readability, water fps); add GitHub secret `QA_PRIVATE_TERMS`; enable secret scanning + push protection.

## Decisions (newest first)
| Date | Decision | Why |
|---|---|---|
| 2026-11-25 | Longer levels: Act II wings get 9 rooms (was 7; elite room 5, boss room 9) + ~15% more enemies per room. Act I and endless unchanged (planner default, owner may extend). Keep max-Renovation steps ≤ ~15–20 pts. Planned as 1.16.1 after 1.16.0 ships | Owner: "A + a bit of B" |
| 2026-11-25 | Future (owner, from testers): (1) Library Cat is mistaken for an enemy when it moves → make it read as friendly; (2) levels ~30% longer (rooms per wing vs room length: open); (3) some perks feel too strong: specifics to collect from the tester (perk names + Share stats codes in chat, never committed) | Owner |
| 2026-11-25 | Tester role: one Sonnet tester session per release reviews the branch (QA, screens, try-to-break, bot) and reports; planner reads the report, spot-checks, then asks to ship. Testers don't count toward the 2-coder limit. CLAUDE.md + `docs/handoffs/tester-template.md` | Owner: go |
| 2026-11-25 | Act II look A (Sunken Stacks) first; B and C later acts. Wing map: Act II visible but locked, unlocked sequentially (wing 11 after wing 10), swipe between acts. Hidden tester switch (7 taps on version line, `overdue.tester.v1`, never touches progress). Lighting system unchanged. Max-Renovation targets wing 11 ~25%, 12 ~20% | Owner |
| 2026-11-25 | **Act II (10 new wings, 11–20)** chosen over 5 wings; must look completely different. Lighting system stays (CLAUDE.md rule), floor/shelves/lamp colour/enemies/bosses change. Looks page https://claude.ai/artifact/9wgzQWpVvdovMR5fiGdu95 (A Sunken Stacks = pick, B Overgrown Conservatory, C Clockwork Archive), waiting for letter. Act II becomes 1.16.x; Book Bag → after | Owner |
| 2026-11-25 | More wings: owner wants them ("definitely"); also "a bit too easy with the right perks and maxed Renovations". 3-option page https://claude.ai/artifact/AUvSEnVqQyuEgX4kn5zRt6 (A Basement wings 11–15 = pick, B Act II 11–20, C 3 wings + Overtime), waiting for letter. Buttons 1.15.4: owner picked diagonal (DASH up right edge, SHHH lower-left), see-through .12 | Owner |

Older decisions (2026-11-21 to 23, all shipped): `docs/roadmap-archive.md`. Product rules from them live in CLAUDE.md.

## Plan
| Version | What | Status |
|---|---|---|
| 1.15.0–1.16.0 | New perks; look & feel; story −5%; Margin + auto-aim; diagonal buttons; Act II wings 11–12 + eels/boats + tester switch + deploy split | Shipped 2026-11-24/25 (details: `docs/roadmap-archive.md`) |
| 1.16.1 | **Act II longer:** 9 rooms per Act II wing, +15% enemies, wing 11 clearly harder than 10; What's-new card vs version line | Coder running |
| 1.16.x | Cat readability; strong-perk tuning (after tester data); Act II wings 13–20 in batches + 2 bosses + crab | Planned |
| later | Acts III (Conservatory) and IV (Clockwork); Book Bag (Renovations 2.0); Player look | Planned |
| — | **Bigger map (parked):** camera-follow map; revisit only if the cramped feeling returns | Parked |

## Next ideas
**Queued feature (owner, 2026-11-23): cursed books feel never worth taking.** Today (`src/upgrades.js` 60–62): Banned Book +100% damage / −1 max heart; Loud Reader SHHH 3× faster / enemies +15% speed everywhere; Lights Out +50% score / half lantern (score doesn't matter in story, so pure downside there). Planner proposal: (1) measure first with the bot (policy that always takes cursed vs never, wings 1/4/7); (2) Lights Out upside → +50% fines and score (useful in story); Loud Reader upside → also +50% SHHH size and stuns longer, cost stays; Banned Book keep but add +1 pierce; target: taking a cursed book ≈ same clear rate as a normal perk pick, with a bigger swing; (3) Mystery: show the cursed book and let the player take it or walk away (walk away = nothing).
**Queued art (owner, 2026-11-23): nicer player ("less plain").** Same process as the enemies: art agent writes 3 directions → coder prototypes behind `?player=a|b|c` → planner proposal page → owner picks. Constraints: stays teal/player hues (`PLAYER` in `src/palette.js`, never enemy hues), clear facing + aim direction, keeps hit flash / invulnerability blink, readable inside the lantern at phone size, hitbox unchanged, cached sprites (perf budget). Design it in layers (body, outfit, hat, held book) so later cosmetics (parked: ways to spend fines) can swap parts.
**Queued feature (owner, 2026-11-23):** Rare Books reward option A (see Decisions). Planner splits all queued items into releases when the owner's playtest is done (Codex toast over game-over heading, CI iPhone SE boss flake).
**Known CI flake (2026-11-24):** `basics · basics flow completed` (1.13.1 offline/update QA) fails ~1 in 5 CI runs with "Execution context was destroyed" (service worker navigation race); docs-only commits, neighbours green. Fix sent to the 1.14.0 part A coder. **Older known CI flake:** GitHub CI runner (`qa --ci`) failed `iphone-se-landscape · room 7 boss spawns` + `boss taunt` on 0e037ea (slow runner timing; local QA green). Fix with deterministic `stepN` when next touching QA.
Morning brief: `docs/plans/morning-brief.md`. Room Atlas (private): https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS
Ranked proposals for 1.8+ with draft handoffs: `docs/plans/next-ideas.md` (story beats → room goals → balance pass → Daily Shift → weapons).

## Parked ideas
- **Renovations 2.0 (proposal, 2026-11-24):** A Book Bag kits (gain + cost, packed before a run) · B New Acquisitions (buy new perks/doors/cursed books into the story pool) · C Signature Editions (weapon types). Planner pick: A then B, C later; drop Forbidden Satchel (≈ free starting perk) and Fire Drill (clashes with max 1 Survive/wing). Owner picked A (2026-11-24), kits permanent, built as 1.16.0. Page (private): https://claude.ai/artifact/2ZFt6ufDiCVLJ3ma128vrT · spec: `docs/plans/renovations-2.md`. Build after 1.14.0.
- **More ways to spend fines (owner, 2026-11-23, later):** cosmetics (librarian outfits/hats, book skins, lantern colours, rug/floor themes), maybe a few more Renovations. Rules to respect: cosmetics never change gameplay or hitboxes; books stay library blue and enemies stay in enemy hues (palette rule); new saved data in its own additive key (no reshape of `overdue.progress.v1`). Pairs well with Daily Shift (streak rewards).
- **Room goals (story):** survive 30s, rescue stolen books, defend the returns desk, catch a thief. Fixes "every room plays the same".
- **Weapon types:** Paperback (4 × 1 = 4 dmg/s), Encyclopedia (1.3 × 3.5 = 4.6, slow, knockback), Index Cards (10 × 0.4 = 4, flurry),
  Card Catalogue Drawer (5-card shotgun, 4.8), Ink Pot (lobbed, puddle). Keep damage per second within ±25%; every perk must work with
  every weapon or be removed from that weapon's card pool. Open questions: unlock at run start with fines vs found mid-run; endless or story only.
- **Daily Shift:** one shared endless seed per day, best daily score + streak (separate board so endless scores stay comparable).
- **Code health:** split `src/main.js` (rendering, DOM screens) when a feature touches those parts, not as a standalone task.
