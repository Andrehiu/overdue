# Roadmap

The plan and the owner's decisions, kept current by the planner session. **Planners: read this after CLAUDE.md.**
Coder sessions are tagged `overdue-coder` and titled `Overdue · v<version> <topic>`; their prompts are saved in `docs/handoffs/`.

## Current state (planning 3 → planning 4, 2026-11-24)
- **Live:** v1.14.1 (c36ac35, Pages run green 2026-11-24) = 1.14.0 (bigger story rooms, run log + Share stats, late-game
  flattening, perk fixes) + 1.14.1 (Rare pick, softer Rare door, cursed upsides, Mystery take/walk away). No coder running.
- **Planner branch:** `claude/brave-galileo-jyg38o` (= main + docs).
- **Owner habits:** short replies (tables, a pick, the one word needed); ships only on "ship"; playtest mode = numbered log only;
  3-option pages only for visual choices; 08:00 SGT morning update when going to sleep; max 2 coders (usage).
- **Token rules:** keep this file short (move shipped rows to `docs/roadmap-archive.md` at each release); filter tool output
  (failing lines, last result only); one roadmap commit per conversation; coders wait on background jobs, don't poll; review only
  the changed screens (2–3 screenshots). The owner compacts the planner chat when they choose (no fresh planner per release),
  so keep this section current: it must be enough to carry on after a compaction.
- **Gotchas:** parallel coders conflict in `CODEMAP.md`, `package.json`, `src/main.js`, `src/game.css`, `scripts/qa/run.mjs`
  (usually additive; after a merge run `node --check scripts/qa/run.mjs`). QA seeds a "returning player" save since 1.13.0.
  Coders sometimes report the planner branch name by mistake: verify with `git log origin/<branch>`. Pages runs can sit in
  "waiting" a minute. "Show tips again" also clears the 1.13.0 unlock flags (small follow-up if the owner notices).
- **1.15.0 new perks:** status colours picked (A: ink violet `#9a6bff`, chill cyan `#74e6ff`, static lime `#c8ff4d`; page
  https://claude.ai/artifact/9mMLXf7yUJ9Je2TgHw9Vhs). Owner said go (2026-11-24); 2 coders running (sessions session_014kswNma1ffcy55DKfyTXLx = A, session_014kswNm1QrbdV3FpTgcFFxh = B), check-in 11:43 UTC: `docs/handoffs/1.15.0a-status-perks.md`
  (status engine + Leaky Pen, Cold Storage, Static Cling, Pop-up Book + 4 combos, `claude/status-perks-1150`) and
  `docs/handoffs/1.15.0b-new-perks.md` (Margin Notes, Last Chapter, Library Cat, Crossfire, What's new card, NEW badges,
  `claude/new-perks-1150`), both from main, in parallel. New perks in endless too (owner OK by go).
- **Owner to do when convenient:** playtest wings 7–8 + an Orbit run on v1.14.1; phone checks: Take it / Walk away tap comfort,
  5-card Rare hand readability, Surround dimmed-book cue, Settings captions fit. Optional: add the CI docs `paths-ignore` to
  `.github/workflows/ci.yml` (auto-mode blocked coders from it; the owner can edit it on GitHub).
- **Later (only if the playtest still finds issues):** 1.14.2 tuning: wing 8 room 5 maze, wings 7/9 easier than neighbours,
  3→4 cliff, Orbit L3 too weak (6% of damage), Spine Breaker outlier. Then 1.16.0 Book Bag → 1.17.0 player look.

## Decisions (newest first)
| Date | Decision | Why |
|---|---|---|
| 2026-11-24 | Privacy: history audit clean (203 commits: no emails except Claude noreply, no owner name, no save/backup/stats codes, no big binaries). CLAUDE.md rule: tester exports never committed; no new network calls without OK. Queued after 1.15.0: stronger QA scan (`docs/handoffs/1.15.1-privacy-scan.md`); owner to enable GitHub secret scanning + push protection | Owner asked how to verify nothing from players leaks to the public repo |
| 2026-11-24 | Status colours A: ink violet `#9a6bff`, chill cyan `#74e6ff`, static lime `#c8ff4d`; Pop-up Book ring teal + white (not gold); Annotated Edition card text drops "ink" | Owner picked A (planning 4) |
| 2026-11-24 | Rare Books door softened (A): elite share +0.5 → +0.35, budget ×1.3 → ×1.15, from wing 4 elite HP +50% → +30% and fire 30% → 15% faster; ×2 fines and the new Rare pick stay. Rare ≈ safe door in wings 4–7 (bot); re-check after the 1.14.0 merge | Owner picked A (1.14.1) |
| 2026-11-24 | "What's new" for players: a one-time card only for big releases (first use 1.15.0 new perks), plus NEW badges on new perk cards the first time each is offered (cleared once seen/tapped), reusing the 1.13.0 earned-menus pattern. No popup on small releases. Flags additive in `overdue.tips.v1` (last seen release + seen perk ids). Goes into the 1.15.0 handoff | Owner (from a side chat) |
| 2026-11-24 | Old playtest list dropped; replaced by one focused playtest after 1.14.0 (wings 7–8 + an Orbit run) | Owner: 'drop it' (bot covers it) |
| 2026-11-24 | New perks (1.15.0): bosses are immune to freeze and stun (they take +25% damage while chilled instead); elites and normal enemies get a 3 s cooldown after a freeze. Applies to Cold Storage/Deep Freeze, Superconductor, Static, Library Cat/Stray Colony, Orbit. Balance-review changes accepted (Margin Notes side books don't home, Last Chapter cap, Crossfire +50% radius capped, chains never start chains, Static L1 / Cat L2 buffs). Status colours: 3-option page before 1.15.0; static not gold (clashes with elite outline and crits) | Owner picked A |
| 2026-11-24 | Bigger rooms (+20%) apply to story only; endless keeps today's grid (seeds and Hall of Fame stay comparable) | Owner picked A |
| 2026-11-24 | Rooms 20% bigger (phone grid 34×16 → ~40×19): HUD/buttons keep their size, lamps and shelves scale with the room. First part of 1.14.0, before balance tuning. Bigger-map-with-camera stays parked | Owner (mock-ups of today / +20% / +40%) |
| 2026-11-24 | New perks: owner wants the proposed mix (Leaky Pen, Cold Storage, Static Cling, Margin Notes, Last Chapter, Library Cat, Pop-up Book + Brittle Pages, Conductive Ink, Superconductor, Ink Bombs, Crossfire) for 1.15.0, adjusted by the independent balance review; Audiobook "blocks pages" questioned by owner (too strong) | Owner |
| 2026-11-24 | Order: 1.14.0 late game + perk balance → 1.14.1 Rare Books + cursed → 1.15.0 new perks → 1.16.0 Book Bag (Renovations A, kits permanent) → 1.17.0 player look. Dewey + Interlibrary is dominant (never miss); Audiobook Orbit useless; new perks take inspiration from genre classics (mechanics only, original names) | Owner |
| 2026-11-24 | Loud Patron shout ring reach −20% (196 → 157 px), story and endless; added to the 1.13.0 coder | Owner: still too big for the small rooms |
| 2026-11-24 | Late-game reachability: NO free starting perks. Measure with a maxed-Renovations bot save (wings 6–10, ≥ 60 runs), then flatten the steepest per-wing dials (enemy HP +22%/wing compounding with budget) toward: maxed Renovations wing 8 ~40%, wing 10 ~20% clears (bot). Top item of 1.14.0 | Tester: wing 8 extremely hard even with all Renovations; planner math: wing 8 ≈ 6× the damage-per-second of wing 1 with the same starting power |
| 2026-11-24 | More Renovation tiers: yes, but owner finds pure stat tiers one-dimensional; planner to propose Renovations that change how you play (sidegrades/unlocks), not just +numbers | Owner |
| 2026-11-23 | Difficulty: gentle smoothing only. Soften the two cliffs (wing 3→4 and wing 7, tester feedback) so each wing is a steady step up; don't lower the overall difficulty; wings 9–10 stay the real challenge. Target, half Renovations: wing 1–2 ~85%, 3–4 ~65%, 5–6 ~50%, 7–8 ~35%, 9–10 ~20%; no wing > ~15 pts harder than the one before | Owner: 'slightly less difficult', keep it interesting. Bot: wing 3→4 72%→11%, wings 8/10 0% |
| 2026-11-23 | Rare Books door gets an in-run reward, option A: after clearing, the perk pick shows +1 card and one card is guaranteed to complete a combo or advance a perk toward its Masterwork. Keeps ×2 fines. Target: rare clear rate ≈ safe door in wings 4–7 (bot) | Owner playtest; today the only reward is meta fines, so the door is a trap for winning the run |
| 2026-11-22 | Off-centre title seen on the owner's "Duo" device: not fixed. Optimise for normal iPhones (iPad keeps filling the screen) | Owner: "it's fine, I'm on the Duo, optimise for normal iPhones". Title measured centred on iPhone 13 and on iPad sizes |
| 2026-11-22 | Arena follows the phone's aspect up to ~2.2:1 so phones fill the screen; 16:9 and iPad grids unchanged | Owner saw black side bars on iPhone |
| 2026-11-22 | Teach perks just-in-time (learn as you go), not a tutorial run | Owner: players don't understand perks |
| 2026-11-22 | Second-finger aiming becomes a floating joystick (drag to aim), not aim-at-finger | Owner: pressing all over the screen to shoot left makes no sense |
| 2026-11-22 | Mobile only (option A): desktop unsupported and dropped from QA, code kept; iPad + gamepad stay. How to play becomes a simple touch-first list (no WASD/mouse) | Owner: "stick with a mobile game moving forward" |
| 2026-11-22 | Setting to turn off auto-aim; off = second finger aims and throws (twin-stick) | Owner |
| 2026-11-22 | Wings shrink to 7 rooms (elite 4, boss 7); add Survive room goal (Rescue/Thief not now) | Owner: shorter runs, rooms that play differently |
| 2026-11-22 | Door after the elite room: yes. Bosses keep random catalogue names (story + endless). Replace all real-person/trademarked catalogue authors with original parody names | Owner |
| 2026-11-22 | Rare Books option C; SHHH resets each story room (endless unchanged) | Owner playtest: wing 4 cleared easily, elite door not scary; SHHH should be fresh per room |
| 2026-11-21 | Story doors (v1.7.0) with the planner's default numbers; balance to be tuned after the owner plays | Owner: turn 10 fixed rooms into a route you plan |
| 2026-11-21 | Story rooms get shapes per wing; endless keeps today's generator | Owner: "every room feels the same"; endless must stay comparable |
| 2026-11-21 | Remove all meme book-title text (banner, kill pop-ups), keep author-named bosses | Owner |
| 2026-11-21 | Remove the meme book-title line at the bottom of the screen | Owner: it no longer serves a purpose |
| 2026-11-21 | Build strip shows names; combo partners are linked visually; chips open details | Owner: perk names are hard to remember |
| 2026-11-21 | Loud Patron shout reaches 30% less far (280 → 196 px), story and endless; thickness and speed unchanged. Done by the planner as an owner-approved one-line exception | Owner playtest: the ring felt too big |
| 2026-11-21 | After playing 1.3.1 the arena **no longer feels cramped**: the bigger map (1.5.0) is parked | Owner playtest |
| 2026-11-21 | Wide shelf gaps (≥ 2 cells) apply to **story and endless**. Endless waves are unchanged, but endless room layouts changed in v1.3.1, so newer Hall of Fame scores come from slightly easier rooms | Getting stuck on shelves was a bug, not intended difficulty |
| 2026-11-21 | Planner sessions plan; Sonnet coder sessions write the code (see CLAUDE.md "Session roles") | Planning keeps context; coding is delegated and reviewed |
| 2026-11-21 | Story mode is the focus for now | Owner priority |
| 2026-11-21 | Going **landscape-only** is agreed in principle (v1.4.0). It overrides the "portrait iPhone is the main target" rule in CLAUDE.md, which v1.4.0 must update | The game is only played in landscape; it makes the bigger map practical |

Older decisions (2026-11-21 to 23, all shipped): `docs/roadmap-archive.md`. Product rules from them live in CLAUDE.md.

## Plan
| Version | What | Status |
|---|---|---|
| 1.14.0 | **Rooms +20% (story) + late game reachable + perk fixes + run analytics:** story grid ~+20% per side (HUD same size), run log `overdue.runs.v1` + Share stats, bot tooling (max Renovations, damage by source, forced/banned perks); wing scaling flattened (HP/budget/boss HP/speed etc.), Orbit fair version, Dewey×Interlibrary first-trip homing, Speed Reader +1.2/lvl, Footnotes +15% | Shipped 2026-11-24 as v1.14.1 with 1.14.1 (planner review: 101/101 tests, QA 800 green, perf boss 0.94x/61 fps). Bot after: half wings 4–10 63/45/32/53/12/45/7%, max 8 53%, max 10 15%. Open (1.14.2, after owner playtest): wing 8 room 5 maze, wings 7/9 easier than neighbours, 3→4 cliff 27 pts, Orbit L3 6% of damage (target 15–30%), Spine Breaker 100% clears. CI docs paths-ignore not applied (auto-mode blocked; owner can edit ci.yml). Reports: `docs/balance/1.14.0-*.md` |
| 1.14.1 | **Rare Books better pick + cursed books:** Rare pick +1 card with one guaranteed combo/Masterwork card, Rare door softened (owner A); cursed upsides (Lights Out +50% fines, Loud Reader bigger SHHH + stun, Banned Book +1 pierce); Mystery cursed prize = Take it / Walk away | Shipped 2026-11-24 (with 1.14.0). Post-merge bot (half, n=30): Rare vs safe wings 4–7 93/83, 67/80, 40/43, 50/70%. Nit: "Walk away" wraps to 2 lines |
| 1.15.0 | **New perks:** 6–8 new perks + effect combos (genre-inspired: angles, status effects, on-kill, risk/reward, helpers), from a 3-option proposal | Proposal ready (2026-11-24), owner picked the mix (2026-11-24); independent balance review done: `docs/plans/perks-balance-review.md` (orbit no page-blocking before Surround Sound, bosses immune to stun/freeze, Margin Notes side books don't home, no chains from chain damage, Last Chapter capped). Page (private): https://claude.ai/artifact/BKrDdNKrMjbVQyxuBcDKRX · spec incl. 1.14.0 perk fixes: `docs/plans/perks-new-and-fixes.md`. Planner pick: mix (Leaky Pen, Cold Storage, Static Cling, Margin Notes, Last Chapter, Library Cat, Pop-up Book + 5 combos); effect colours must not read as book blue. Also: "What's new" card + NEW badges on new perk cards (see Decisions) |
| 1.16.0 | **Book Bag (Renovations 2.0 A):** kits bought once, pack before a run, gain + cost; drop Forbidden Satchel and Fire Drill | Planned |
| 1.17.0 | **Player look:** art agent → 3 looks → owner pick → final, layered for cosmetics | Planned (2 sessions) |
| — | **Bigger map (parked):** ~40×24 cells (1.7× floor), camera follows the player with a dead zone; light layer screen-sized (same look; owner OK needed since CLAUDE.md says keep lighting); auto-aim only on screen; spawns just off-screen; edge arrows for off-screen enemies; perf budget must hold. Build behind `?bigmap=1` first | Parked: 1.3.1 fixed the cramped feeling. Revisit only if it comes back |

Shipped releases 1.3.1–1.13.1 (with review numbers and handoff links): `docs/roadmap-archive.md`.

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
