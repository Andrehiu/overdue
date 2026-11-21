# Morning brief: 2026-11-22

## TL;DR
- **Live:** v1.5.0 (meme text gone, menus fit every screen, readable build strip, reset note kept).
- **Ready but held for you:** v1.6.0 room shapes + v1.7.0 doors, merged together on `claude/brave-galileo-jyg38o`
  (`888de3c`), full QA green (0 failures). Say **"ship 1.7"** to put them live for your balance test.
- **Look at:** the Room Atlas, all 100 story rooms (private): https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS
- **Running:** balance bot (automated playtests of doors × wings). Its report will be added below when it lands.

## What happened overnight
| Item | Result |
|---|---|
| 1.5.0 | Shipped, Pages deploy green first try (`b6e745d`). |
| 1.6.0 room shapes | Maze/bridge/reading fixed with a better rule (no passage under 2 cells instead of "shelves never touch"). Endless layouts proven identical (hash test). |
| 1.7.0 doors | Your defaults. Unit 46/46, QA all green, perf 60–61 fps. Rare Books → next room 51% elites; Break Room heals 1. |
| Story text draft | `docs/plans/story-text-draft.md`: intro, original named boss + taunt, cleared line for all 10 wings. |
| Next ideas | `docs/plans/next-ideas.md`: story beats → room goals → balance pass → Daily Shift → weapons. Draft handoffs for 1.8.0 and 1.9.0 are ready. |
| Balance bot | Running (see below). |

## Doubts / things to check on your phone
1. **Bridge rooms** read as dashed walls rather than solid walls with gaps (Atlas → filter "bridge"). Playable; cosmetic.
2. **Door cards:** the small "1"/"2" key numbers overlap the top of the icons. Cosmetic.
3. **No door after the elite room (room 5 → 6).** The spec only listed doors after 1–3, 4, 6–8 and 9. Want a choice there too?
4. **Renovation margin:** the cheapest door route through wing 1 earns 26 fines by room 6; the cheapest Renovation costs 25.
   Any future cut to Break Room fines or price rise breaks that rule (a test guards it).
5. **Rare Books in late wings** = all elites (late wings are already ~50% elites). Watch wing 6+.
6. **Boss names:** the catalogue authors include a real person (Rick Astley), a real animal's memorial (Harambe) and a
   copyrighted character (Boromir). Not changed; the story draft uses original bosses instead.
7. **Safe areas** (iPad clock overlapping menus) were fixed in 1.5.0 but only tested in a simulated browser: check on your iPad.

## Decisions I need from you
1. **"ship 1.7"** (room shapes + doors live) — or play-test first.
2. Story beats: fixed original bosses per wing in story (recommended) vs random names everywhere.
3. Room goals: build Survive + Rescue first (recommended)?
4. Door after the elite room: yes / no.

## Balance bot report
_(pending: added here when the bot finishes)_
