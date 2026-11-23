# Roadmap

The plan and the owner's decisions, kept current by the planner session. **Planners: read this after CLAUDE.md.**
Coder sessions are tagged `overdue-coder` and titled `Overdue · v<version> <topic>`; their prompts are saved in `docs/handoffs/`.

## Handover note (2026-11-22, from "Overdue · planning" to "Overdue · planning 2")
**State (updated 2026-11-23):** v1.12.0 live (5c67b92). Original note: v1.11.2 was live (`0e037ea`, shipped with the QA trim). Nothing is merged-but-unshipped and no coder is running.
The planner's working branch is `claude/brave-galileo-jyg38o` (equal to `main` plus docs). Work for a new release goes on a new
coder branch from `origin/main`, then the planner merges into its own working branch, runs QA and ships with `git push origin HEAD:main`
only when the owner says "ship".

**How this owner works (learned over 13 releases):**
- Prefers short replies with tables, a clear recommendation, then "say X to ship". Asks "what's next" often; offer 3–5 options + a pick.
- Usually says "ship when ready / if all good" → you may ship after your own review + green QA, then confirm the Pages deploy.
- Plays on an **iPhone in landscape** (also an iPad). Their screenshots are the best bug reports; measure before guessing.
- Usage credits are OFF; plan limits apply. Keep sessions lean; batch small things.

**Gotchas:**
- Pages deploys often fail with GitHub-side "Deployment failed, try again later" / "Fetching artifact metadata failed": re-run
  (`mcp__github__actions_run_trigger` rerun_workflow_run); it has always gone green by the 3rd attempt. Never say "live" before green.
- The auto-mode classifier once blocked `git push origin HEAD:main`; an explicit owner "push X to main" unblocked it.
- Coders' containers sometimes have a stale local `main` or no `node_modules`: handoffs say "start from origin/main"; QA needs `npm ci`.
- Merges: expect `package.json` version and `CODEMAP.md` conflicts every time (take the newer version, `npm run codemap`); when two
  coders both add tests in the same spot, keep both. Re-run QA after every merge.
- Watch coders weakening rule tests (e.g. 1.9.0 relaxed a budget sub-check: acceptable only because `threat` stayed strict).
- QA: `npm run qa` ≈ 3 min (full flow on iPhone 13 / iPad / iPad mini, fit-only on 4 more sizes, parallel); `--full` ≈ 3.5 min.
  Flaky checks get fixed (deterministic `stepN` + counters), never ignored.

**Next for the new planner:**
1. ✅ Done 2026-11-22 (v1.11.2: 70 rooms, 34×16 grid, survive rooms tagged). Regenerate the **Room Atlas** (private artifact https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS) for 7-room wings and the
   wider phone grids (it still shows v1.6.0's 10-room layouts). Method: ad-hoc Playwright script in the scratchpad screenshotting
   every story room at iPhone 13 Home Screen size (844x390) with `?debug=1` hooks (`unlockAll`, `startRun('story', w)`, `startWave(r)`,
   `killAll`, `game.bannerT = 0`), images embedded as data URIs, republished to the same URL.
2. Wait for the owner's playtest notes (see "Waiting on owner playtest" under Next ideas), then a **balance pass** (bot:
   `npm run balance -- --runs=20`).
3. Then the owner's pick among: Daily Shift, Rescue rooms, weapon types (all in Next ideas / parked).

## Decisions (newest first)
| Date | Decision | Why |
|---|---|---|
| 2026-11-23 | Rare Books door gets an in-run reward, option A: after clearing, the perk pick shows +1 card and one card is guaranteed to complete a combo or advance a perk toward its Masterwork. Keeps ×2 fines. Target: rare clear rate ≈ safe door in wings 4–7 (bot) | Owner playtest; today the only reward is meta fines, so the door is a trap for winning the run |
| 2026-11-23 | Owner is playtesting and dumping notes; planner collects them and decides how to split releases afterwards | Owner |
| 2026-11-23 | Enemy art: look C "Blend" (own face + own outline per enemy); glowing eyes in the dark: not now | Owner, from the 3-option proposal |
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

## Plan
| Version | What | Status |
|---|---|---|
| 1.3.1 | **Stuck fix:** shelf gaps ≥ 60 px, player 18 px wide against shelves (22 vs enemies), corner assist | Shipped 2026-11-21; owner playtest: no longer cramped. Handoff: `docs/handoffs/1.3.1-stuck-fix.md` |
| 1.3.2 | **Smaller patron shout:** Loud Patron ring reach 280 → 196 px | Shipped 2026-11-21 together with 1.4.0 |
| 1.4.0 | **Landscape only:** "rotate your phone" screen in portrait, manifest `orientation: landscape`, update CLAUDE.md / README / QA devices | Built by coder session "Overdue · v1.4.0 landscape only" (branch `claude/landscape-only`), reviewed and merged with 1.3.2 by the planner; shipped 2026-11-21. Handoff: `docs/handoffs/1.4.0-landscape-only.md` |
| 1.4.1 | **Remove the meme book-title text:** HUD bottom line, wave-banner subtitle and floating kill titles (catalogue kept: bosses are named after authors) | Shipped 2026-11-21 (with 1.5.0) |
| 1.4.2 | **Menus fit:** sticky Back row on every menu, Renovations/Settings fit short screens, safe areas (Codex Back was cut on every device) | Shipped 2026-11-21 (with 1.5.0) |
| 1.5.0 | **Build strip:** owned perks as chips with short names, combo partner glows, tap a chip for details | Shipped 2026-11-21 (live, b6e745d), incl. reset note kept on short screens |
| 1.6.0 | **Room shapes per story wing:** aisles, pillars, maze, reading room, bridge (+ today's scatter); 2–3 per wing; rooms 5/10 open; endless layouts unchanged | Shipped 2026-11-22 with 1.7.0 (7ebfdad) |
| 1.7.0 | **Pick your next door** (story): 2 doors after rooms 1–3 and 6–8: 💰 Rare Books (+0.5 elite share, ×2 fines), ☕ Break Room (heal 1, ×0.5 fines min 3), 🎲 Mystery Shelf (cursed book or bonus perk); 🚪 Stacks replaces Break Room at full HP | Shipped 2026-11-22 (7ebfdad); owner balance-testing. Balance bot: `npm run balance` |
| 1.7.1 | **Balance fixes:** Rare Books option C (+30% enemies; from wing 4 elites +50% HP, fire 30% faster), SHHH ready each story room, Mystery bonus-pick label, end-screen buttons never cover text | Shipped 2026-11-22 (a19bd61). Bot: Rare Books wing 4 half-save clears 10% → 0%, fines/run 102 → 66 |
| 1.8.0 | **Story polish:** wing intros, boss taunts, cleared lines; door after the elite room; original parody names for all 10 catalogue authors | Shipped 2026-11-22 (0d559a0) |
| 1.9.0 | **7-room wings + ⏱️ Survive rooms:** elite at 4, boss at 7, difficulty envelope kept (rooms map onto the old curve), fines rescaled; Survive 30 s rooms (never 1/4/7, ≤1–2 per wing) | Shipped 2026-11-22 (cf4c466). Survive budget ×1.15; owner to judge whether harder is needed |
| 1.10.0 | **Auto-aim off setting:** twin-stick style, throw only while a 2nd finger is down, toward it; default stays on | Shipped 2026-11-22 (3a8c1e0) |
| 1.10.1 | **Mobile only:** desktop QA target removed (iPad mini added to full screens), touch-first How to play (no WASD/mouse; one line on 2nd-finger aiming), outdated boss text fixed | Shipped 2026-11-22 with 1.10.2 (49a845a) |
| 1.10.2 | **Aim joystick:** second finger becomes a floating aim stick (drag direction, deadzone), drawn like the move stick; also overrides auto-aim while deflected | Shipped 2026-11-22 (49a845a; Pages deploy green on 3rd attempt) |
| 1.11.0 | **Learn perks as you go:** one-time tips (stack to 3/3, combos), Masterwork previews at 2/3, UNLOCKED + reason on special cards, level-up pips, Perks box in How to play, "Show tips again" (new key `overdue.tips.v1`) | Shipped 2026-11-22 with 1.11.1 (416b4d4) |
| 1.11.1 | **Fill the screen:** arena widens to the phone's shape (no black side bars; iPhones were at 81–88% fill), title fits on iPad mini / iPad Safari, QA fill ≥ 95% + more phone sizes + rotation checks | Shipped 2026-11-22 (416b4d4) |
| 1.11.2 | **Polish:** door key numbers off the icons; touching shelves draw as one solid wall (bridge/maze/reading) | Shipped 2026-11-22 (0e037ea) with the QA trim |
| 1.11.3 | **Balance pass (bot-driven):** bot now reports per-room death share + reach-conditional death rate (handles Survive); Survive budget ×1.15 → ×1.2 (only outlier; partly fixed, capped by the difficulty-only-goes-up test). Elite room 4 and Rare Books: fine | Merged into planner branch (d04bba9), reviewed: 67/67 tests, QA all green 2m50s. Shipped 2026-11-22 (4fda8ab; Pages deploy green 1st attempt). Open: Survive still easy (6/15 cells < 0.6×), wing 4 room 5 spike (54% of deaths), wing 1 room 6 (40%). Reports: `docs/balance/1.11.3-*.md` |
| 1.11.4 | **Survive rooms build up + spike rooms:** Survive spawns 20/30/50% over 0–20 s (same total; pooled Survive death rate 0.55× → 0.68× of plain rooms, 11/16 cells ≥ 0.6×); reading-room openings 2 → 4 cells (story only); elite room budget ×0.6 → ×0.75. Wing 4 room 5 rate 67% → 53%; wing 1 room 6 18% → 8% but still 50% share (few deaths overall) | Shipped 2026-11-23 (3c5a509), reviewed: 68/68 tests, QA all green. Handoff: `docs/handoffs/1.11.4-survive-and-spikes.md` |
| 1.12.0 | **Enemy readability:** look C "Blend" is the only enemy look (own face + outline per type, one-tube worm, hopping bunny, elite gold outline + crown); patron ripple only in the last 0.5 s of charge-up; A/B/eyes removed | Merged into planner branch (5a42ede), reviewed: 72/72 tests, QA 0 failures, perf boss 0.92x/61 fps, wing 10 0.93x/61 fps. Shipped 2026-11-23 (5c67b92). Handoff: `docs/handoffs/1.12.0-enemy-art-final.md` |
| — | **QA trim** (tooling): full flow on 3 devices, fit-only on 4, parallel contexts; target ~5 min | Merged: QA 11 min → 3 min (full flow on 3 devices, fit-only on 4, parallel); `--full` ~3.5 min |
| — | **Bigger map (parked):** ~40×24 cells (1.7× floor), camera follows the player with a dead zone; light layer screen-sized (same look; owner OK needed since CLAUDE.md says keep lighting); auto-aim only on screen; spawns just off-screen; edge arrows for off-screen enemies; perf budget must hold. Build behind `?bigmap=1` first | Parked: 1.3.1 fixed the cramped feeling. Revisit only if it comes back |

### 1.3.1 phone checklist (wing 1, rooms 1–10)
1. Run through gaps: no rubbing. 2. Steer slightly into a shelf end: slide around it. 3. Straight into a shelf face: stop, never pass through.
4. Same at ~45° (known weak spot: assist needs mostly-straight movement). 5. Dash along/into shelves. 6. Enemies don't box you in or get stuck.
7. Narrow dodges feel fair. 8. Room 5 elite and room 10 boss have room to dodge. 9. The Stacks (wing 5), if unlocked. 10. Still cramped? (decides 1.5.0)
Report problems as "row + wing/room + what happened".

## Next ideas
**Queued fix (owner, 2026-11-23):** when the door screen has only one door (e.g. the fixed ★ elite door), don't make the player tap it: skip the screen and go straight in, with a short banner/toast ("★ Elite room next") so it isn't a surprise. Code: `showDoors()` in `src/main.js` already detects `offer.length === 1` ("the next door"). **Queued fix (owner, 2026-11-23):** free random perks at the start of a room/run are only a 1.6 s text toast (`toast()`), easy to miss under the room banner: 🎒 Head Start perks (`startRun`) and 🎲 Mystery Shelf cursed books (`resolveMystery`). Show each as a small perk card (icon, name, the plain gain line) for ~3 s, non-blocking, tap to dismiss, and pulse its chip in the build strip. **Queued fix (owner, 2026-11-23, Duo screenshot):** with 4 perk cards (Renovation "catalogue") the pick screen wraps 3 + 1 on the Duo and pushes the build strip off screen. Measured: iPhone 13 and iPad fit 4 in one row; iPhone 15 Pro Max overflows by 25 px ("Tap a card" below the fold). Fix: 4 (and 5) cards always one row, cards shrink to fit, no scroll at any QA size; add a QA check with `game.cards = 4` and 5. **Queued fix (owner, 2026-11-23): Survive rooms clearer and less samey.** (a) Timer too small: today a 13 px HUD line "⏱️ Survive 0:30" (`main.js` ~1990). Make a big countdown (top centre, ring or large digits), pulsing in the last 5 s. (b) Objective not clear: banner/first-time tip "SURVIVE 30 s — stay alive, you don't need to clear the room". (c) "Not 2 Survive rooms in a row": data never has them adjacent (`SURVIVE_ROOMS` gaps ≥ 3), so owner likely felt 2 per wing was too many. Planner default: at most 1 Survive per wing (pending owner confirm); keep the difficulty-ordering tests green. **Queued bug (owner, 2026-11-23, high priority):** after switching apps and coming back in landscape, the "plays in landscape / turn your phone sideways" overlay stays up. Cause (code read): the overlay only re-checks on `resize` (`updateRotateOverlay`, `main.js` ~85–96) using `innerHeight > innerWidth * 1.15`; iOS fires a portrait-sized resize while the app is in the background/app switcher and often no resize on return. Fix: ignore resizes while `document.hidden`; re-check on `visibilitychange` (visible), `pageshow`, `orientationchange` and `matchMedia('(orientation: portrait)')` change, plus a re-check after ~300 ms; re-run `applyLayout()` on the title screen at the same time. QA: simulate hidden → portrait resize → visible in landscape, overlay must be hidden.
**Queued bug (owner, 2026-11-23, Codex screenshot):** the pinned bottom row (Back) floats above the bottom and is narrower than the screen, so scrolled list items show through below and beside its dark band. Reproduced: iPad 1180×820 row ends 24 px above the screen bottom and spans 103–1077 of 16–1164 px; iPhone 13 gap 6 px. Cause: `position: sticky; bottom: 0` sits inside the `.screen` padding (`game.css` ~394, ~413), and `width: 100%` is the content box. Fix for every screen with the pinned row (Codex, Hall of Fame, Renovations, Story, Settings, game over): band reaches the screen's bottom edge and full width (negative margins = the screen padding, safe-area padding inside the band). QA: extend "pinned row covers nothing" with "band reaches bottom edge and spans the width while scrolled".
**Queued fix (owner, 2026-11-23):** Banish animates every card: the click handler (`main.js` ~539–549) calls `renderCards(next)`, which re-deals all cards. Fix: only the banished card leaves (slides/fades away, optional red ✕ stamp), the replacement deals into that same slot; other cards don't move. Respect reduced motion.
**Queued feature (owner, 2026-11-23):** Rare Books reward option A (see Decisions). Planner splits all queued items into releases when the owner's playtest is done (Codex toast over game-over heading, CI iPhone SE boss flake).
**Known CI flake:** GitHub CI runner (`qa --ci`) failed `iphone-se-landscape · room 7 boss spawns` + `boss taunt` on 0e037ea (slow runner timing; local QA green). Fix with deterministic `stepN` when next touching QA.
**Waiting on owner playtest:** Survive difficulty (×1.15 budget), wing 1 room 5 spike, Rare Books from wing 4, wider phone arena edges, tip timing. Then a balance pass (B), Daily Shift (C), Rescue rooms (D). Room Atlas regenerated for v1.11.2 (2026-11-22).
Morning brief: `docs/plans/morning-brief.md`. Room Atlas (private): https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS
Ranked proposals for 1.8+ with draft handoffs: `docs/plans/next-ideas.md` (story beats → room goals → balance pass → Daily Shift → weapons).

## Parked ideas
- **Room goals (story):** survive 30s, rescue stolen books, defend the returns desk, catch a thief. Fixes "every room plays the same".
- **Weapon types:** Paperback (4 × 1 = 4 dmg/s), Encyclopedia (1.3 × 3.5 = 4.6, slow, knockback), Index Cards (10 × 0.4 = 4, flurry),
  Card Catalogue Drawer (5-card shotgun, 4.8), Ink Pot (lobbed, puddle). Keep damage per second within ±25%; every perk must work with
  every weapon or be removed from that weapon's card pool. Open questions: unlock at run start with fines vs found mid-run; endless or story only.
- **Daily Shift:** one shared endless seed per day, best daily score + streak (separate board so endless scores stay comparable).
- **Code health:** split `src/main.js` (rendering, DOM screens) when a feature touches those parts, not as a standalone task.
