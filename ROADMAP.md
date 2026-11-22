# Roadmap

The plan and the owner's decisions, kept current by the planner session. **Planners: read this after CLAUDE.md.**
Coder sessions are tagged `overdue-coder` and titled `Overdue · v<version> <topic>`; their prompts are saved in `docs/handoffs/`.

## Decisions (newest first)
| Date | Decision | Why |
|---|---|---|
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
| 1.7.1 | **Balance fixes:** Rare Books option C (+30% enemies; from wing 4 elites +50% HP, fire 30% faster), SHHH ready each story room, Mystery bonus-pick label, end-screen buttons never cover text | In progress: coder "Overdue · v1.7.1 balance fixes". Handoff: `docs/handoffs/1.7.1-balance-fixes.md` |
| — | **Bigger map (parked):** ~40×24 cells (1.7× floor), camera follows the player with a dead zone; light layer screen-sized (same look; owner OK needed since CLAUDE.md says keep lighting); auto-aim only on screen; spawns just off-screen; edge arrows for off-screen enemies; perf budget must hold. Build behind `?bigmap=1` first | Parked: 1.3.1 fixed the cramped feeling. Revisit only if it comes back |

### 1.3.1 phone checklist (wing 1, rooms 1–10)
1. Run through gaps: no rubbing. 2. Steer slightly into a shelf end: slide around it. 3. Straight into a shelf face: stop, never pass through.
4. Same at ~45° (known weak spot: assist needs mostly-straight movement). 5. Dash along/into shelves. 6. Enemies don't box you in or get stuck.
7. Narrow dodges feel fair. 8. Room 5 elite and room 10 boss have room to dodge. 9. The Stacks (wing 5), if unlocked. 10. Still cramped? (decides 1.5.0)
Report problems as "row + wing/room + what happened".

## Next ideas
Morning brief: `docs/plans/morning-brief.md`. Room Atlas (private): https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS
Ranked proposals for 1.8+ with draft handoffs: `docs/plans/next-ideas.md` (story beats → room goals → balance pass → Daily Shift → weapons).

## Parked ideas
- **Room goals (story):** survive 30s, rescue stolen books, defend the returns desk, catch a thief. Fixes "every room plays the same".
- **Weapon types:** Paperback (4 × 1 = 4 dmg/s), Encyclopedia (1.3 × 3.5 = 4.6, slow, knockback), Index Cards (10 × 0.4 = 4, flurry),
  Card Catalogue Drawer (5-card shotgun, 4.8), Ink Pot (lobbed, puddle). Keep damage per second within ±25%; every perk must work with
  every weapon or be removed from that weapon's card pool. Open questions: unlock at run start with fines vs found mid-run; endless or story only.
- **Daily Shift:** one shared endless seed per day, best daily score + streak (separate board so endless scores stay comparable).
- **Code health:** split `src/main.js` (rendering, DOM screens) when a feature touches those parts, not as a standalone task.
