# Morning brief: 2026-11-22

## TL;DR
- **Live:** v1.5.0 (meme text gone, menus fit every screen, readable build strip, reset note kept).
- **Ready but held for you:** v1.6.0 room shapes + v1.7.0 doors, merged together on `claude/brave-galileo-jyg38o`
  (`888de3c`), full QA green (0 failures). Say **"ship 1.7"** to put them live for your balance test.
- **Look at:** the Room Atlas, all 100 story rooms (private): https://claude.ai/artifact/5kXSXFYFDShVAGw81fPhzS
- **Balance bot done:** `npm run balance` plays 480 automated runs in ~75 s. Findings below.

## What happened overnight
| Item | Result |
|---|---|
| 1.5.0 | Shipped, Pages deploy green first try (`b6e745d`). |
| 1.6.0 room shapes | Maze/bridge/reading fixed with a better rule (no passage under 2 cells instead of "shelves never touch"). Endless layouts proven identical (hash test). |
| 1.7.0 doors | Your defaults. Unit 46/46, QA all green, perf 60–61 fps. Rare Books → next room 51% elites; Break Room heals 1. |
| Story text draft | `docs/plans/story-text-draft.md`: intro, original named boss + taunt, cleared line for all 10 wings. |
| Next ideas | `docs/plans/next-ideas.md`: story beats → room goals → balance pass → Daily Shift → weapons. Draft handoffs for 1.8.0 and 1.9.0 are ready. |
| Balance bot | Done and merged into the release branch (tooling only, debug-gated; unit 51/51, QA green). |

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
480 runs: wings 1, 4, 7, 10 × door policy (always Rare Books / always Break Room / mixed) × save (fresh / about half of
every Renovation), 20 runs each. **The bot plays worse than a person:** compare wings and doors with each other; don't read
absolute difficulty. Differences under ~15 points are noise.

| Wing | Fresh save: clear rate (rare / rest / mixed) | Half Renovations: clear rate (rare / rest / mixed) | Half: fines per run (rare / rest / mixed) |
|---|---|---|---|
| 1 | 30% / 45% / 30% | 70% / 95% / 85% | 137 / 159 / 155 |
| 4 | 0 / 0 / 0 | 10% / 15% / 5% | 109 / 93 / 74 |
| 7 | 0 / 0 / 0 | 5% / 0 / 0 | 114 / 94 / 98 |
| 10 | 0 / 0 / 0 | 0 / 0 / 0 | 64 / 34 / 47 |

**Takeaways (planner)**
1. **The doors are real trade-offs:** Break Room survives best in wing 1 (95% vs 70%), while Rare Books earns 1.2–1.9× the
   fines in wings 4 and 10. Neither door is simply better. That's the design working.
2. **There's a cliff between wing 1 and wing 4:** clear rate falls from 83% to 10% even with half the Renovations. The bot
   exaggerates it, but it's worth feeling for yourself in wings 2–4. If it feels like a wall, the lever is the per-wing HP
   step (+22% per wing, compounding) in `difficulty()`, not the doors.
3. **Room 5 (elite) is wing 1's main killer:** 40% of deaths on the half save. Its door ("★ Elite room") is fixed, so you
   can't route around it. Fine if intended; a warning line on the door card would help.
4. **Renovations matter a lot early:** wing 1 goes from 35% to 83% with half of each. Good for the progression loop.
5. **Wings 7 and 10 show no signal** (the bot dies in rooms 1–2). The next run needs a `--renos=max` pass or a stronger
   starting build before late wings can be judged. That's a small follow-up for a coder if you want it.

Re-run any time: `npm run balance -- --runs=20` (or `--wings=1,4 --policies=rare,rest`). The report lands in `balance-report/`.
