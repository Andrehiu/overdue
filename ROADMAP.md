# Roadmap

The plan and the owner's decisions, kept current by the planner session. **Planners: read this after CLAUDE.md.**
Coder sessions are tagged `overdue-coder` and titled `Overdue · v<version> <topic>`; their prompts are saved in `docs/handoffs/`.

## Current state (planning 6, 2026-11-26 01:40 UTC)
- **Live:** v1.16.1 (unchanged). **1.16.2** (`claude/buttons-bannedbook` 5d8df76, Banned Book +50%, owner said ship): the flaky act2 shore
  check is a **real game bug** (golems/walkers freeze ~15 s depending on leftover state from the previous room; seeds w11 r2 s32, w12 r6 s9).
  Coder hit its usage limit 14:30, resumed 00:45, fixing in game code. After the fix: short re-check by tester `session_014kswNkdTkdwNKhsVebkjUq`, then ship.
- **1.16.3** (`claude/playtest-fixes` 582b255, built on 1.16.2): done, idle; after 1.16.2 ships it rebases, runs full QA once, then tester + owner "ship".
  Note for owner: Codex is exempt from the fit check (catalogue scrolls). Trilogy 3/3 bot w10 76.7→82.3.
- **1.17.0** wings 13–15 + Harbourmaster: handoff `docs/handoffs/1.17.0-wings13-15-harbourmaster.md` written; start after 1.16.2 ships (2-coder limit).
- Coders can't send_message to a planner that isn't their parent (1.16.3 was blocked); planning 5 forwards. New coders: create them from the current planner.

## Earlier state (planning 5, 2026-11-25 13:35 UTC)
- **Live:** v1.16.1 (6e23f80), Pages + CI green first try (2/2 since the build → deploy split). = Act II wings 9 rooms (elite 5,
  survive 7 in wing 11, boss 9), +15% enemies (ACT2_BUDGET_MULT 1.15), wing 11 boost 1.25 / wing 12 boost 1.22 + elite 0.14 + gap 0.75;
  **bug fix:** walkers used `arena.solid` for line of sight and stood at pond shores forever (now `walkGrid()`); What's-new card
  blocks taps except the version line, text "New in 1.16", flag `whatsnew-1.16.0`. Bot (max Renos, 180/wing): 10 52%, 11 38%, 12 31%;
  fresh save 0% in Act II. Before: 1.16.0 Act II wings 11–12 (live 08:30 UTC).
- **Ready, not shipped:** v1.16.2 `claude/buttons-bannedbook` (27ecfef, being rebased on 1.16.1 by coder
  `session_014kswNmfiiQKdCmUrzteg2D`): DASH right 1.35em/bottom 6.7em, SHHH 7em/1.6em, #touchUI fixed to the screen (likely cause of the
  owner's bigger iPad gap), pause + guide Skip clear of iOS status/HUD, Banned Book +75% dmg / pierce 1 / lose ⅓ max hearts. Tester passed
  except balance: take vs walk (60 runs, half Renos) wing 7 87/75, wing 10 50/33 (target ±5). **Needs owner: balance call + "ship".**
- **Owner is playtesting** (log only; start nothing until "done testing"). Log so far:
  1. bug: wing-cleared screen (iPad) — bottom buttons cover the "not ranked" line; rule: every screen fits without scrolling.
  2. balance: Banned Book B (+75%, pierce, −⅓ hearts) — in 1.16.2.
  3. feature: Renovation cards show the benefit now → next level.
  4. fix: "+1 book" perk extra books fly side by side (parallel), not angled outward.
- **Owner said "done testing" + approved (13:45 UTC):** 1.16.2 with Banned Book **A (+50% dmg)**, ship authorized; 1.16.3 = playtest notes 1, 3, 4 in one release (Trilogy 2–4 books side by side), coder `session_014kswNhXrL8KCuKhNuJym7M`, needs owner "ship". **Level plan (owner: go):** wings 13–15 next with gentle steps (max-Reno bot targets ~28 / 25 / 22%, wing 15 new boss), then Book Bag (Renovations 2.0, `docs/plans/renovations-2.md`) before wings 16–20 (target ~20% at wing 20). Max Renovations cost ~5,180 fines total, so most players are maxed by wing 11–12. **Next planner task: 3-option wing-15 boss page** (concept, attack patterns, Sunken Stacks look), then the 13–15 handoff.
- **Usage (owner asked):** planner session was the biggest cost ($37 by 13:45 vs coders $10 / $1.4 / $0.3, testers $1.3 / $0.4): a long planner context is re-read on every check-in. Rules: start a fresh planner per ~half day (handover via this section); one start check, then rely on the coder's report message (it wakes the planner) plus one late fallback check; testers stay (caught 4 real bugs today) but re-run the bot only when the coder's numbers are near a target edge; coders run full `npm run qa` once at the end and cap bot tuning at baseline + 3 passes.
- **Open decisions (lower priority):** Banned Book still +12–17 pts over walking (A +50% dmg = planner pick, B drop pierce, C leave);
  Act II is 0% on a fresh save (intended end-game, or soften?); optional heart refill after room 7 in Act II.
- **Planner rules learned today (CLAUDE.md):** push the handoff before starting a session, full prompt in `create_session` (a task sent by
  `send_message` is untrusted and the session stops to ask); start check 5–10 min, then progress by size, 5-min check after any hiccup.
  A usage-limit stop kills coder turns: after a reset, message each coder "continue" and check 5 min later.
- **Roles / habits / deploys:** unchanged (see CLAUDE.md). Planner branch `claude/brave-galileo-jyg38o`.
- **Next (owner-approved, not started):** cat readability; strong perks (tester data); Act II wings 13–20 + 2 bosses + crab; later
  Acts III/IV, Book Bag, Player look. Owner to do: phone checks (aim, buttons, swipe vs iOS back, 7-tap switch, eels/boats, water fps,
  Act II islands rooms: no enemy stuck at a shore); GitHub secret `QA_PRIVATE_TERMS`; secret scanning + push protection.

## Decisions (newest first)
| Date | Decision | Why |
|---|---|---|
| 2026-11-26 | Wing 15 boss = **A, The Harbourmaster** (paper flagship, broadsides with gaps, boat launches, anchors, rams). Old Inkmaw (giant eel) parked for the wing-20 finale; Lamplighter parked for a later act. Page https://claude.ai/artifact/Y2okcfTgkycMZzwahoxEWB | Owner |
| 2026-11-26 | Every Overdue session is tagged `overdue` (plus `overdue-coder` / `overdue-tester`) so they group together; 53 old sessions retagged | Owner (sessions getting messy) |
| 2026-11-25 | 1.16.2 (owner, playtest): DASH/SHHH between mockups A and B (closer to corner); Banned Book B: +75% dmg, keep pierce, lose ⅓ max hearts (min 1) | Owner |
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
| 1.16.1 | **Act II longer:** 9 rooms per Act II wing, +15% enemies, wing 11 clearly harder than 10; What's-new card vs version line; pond-shore stuck-enemy fix | Shipped 2026-11-25 (6e23f80) |
| 1.16.2 | Buttons closer to the corner (screen-anchored), pause/Skip clear of iOS status, Banned Book +75% / −⅓ hearts | Ready; waiting on owner balance call + ship |
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
