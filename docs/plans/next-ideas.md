# Next ideas (1.8+), ranked: planner proposal for the owner

Focus: story mode (owner priority). Ranked by player impact per effort. Nothing here is started; the top two have draft
handoffs ready to go in `docs/handoffs/` (marked "draft, not started").

| Rank | Idea | What players get | Effort | Risk | Owner rules it touches |
|---|---|---|---|---|---|
| 1 | **Story beats** (v1.8.0): wing intro line, a named Rogue Author per wing with a taunt, a "wing cleared" line. Copy drafted in `docs/plans/story-text-draft.md` | Story mode finally has a story; each wing gets a nemesis you remember | 1 coder session (small) | Low: data + banners | Endless unchanged; bosses in endless keep random catalogue names |
| 2 | **Room goals** (v1.9.0): some story rooms swap "kill everything" for Survive 30s, Rescue the stolen books (pick up 5 glowing books), or Catch the thief (a fast enemy flees to an exit) | "Every room plays the same" fixed at the root: rooms ask different things of you | 1–2 coder sessions | Medium: new HUD lines, new enemy behaviour, balance | **Difficulty only goes up**: a goal room must be at least as hard as the plain room it replaces (rule: same or bigger spawn budget, test via `threat`) |
| 3 | **Door + wing balance pass** (v1.7.x): tune door numbers from the balance bot report + owner playtest | Doors that feel like real trade-offs, not traps | Small, mostly numbers | Low | Difficulty only goes up; Renovation affordability test |
| 4 | **Daily Shift**: one shared endless seed per day, own best score + streak | A reason to open the game every day | 1 coder session | Low | Endless stays comparable (separate daily board); new saved key `overdue.daily.v1` (additive, no migration) |
| 5 | **Weapon types** (parked): Paperback / Encyclopedia / Index Cards / Drawer / Ink Pot | Build variety beyond stat perks | 2 coder sessions | Medium–high: every perk must work with every weapon | Perk cards speak plainly; books stay library blue; story-only first so endless stays comparable |

## Why this order
- **Story beats first:** cheapest visible change, and the copy is already drafted, so a coder only wires it up.
- **Room goals second:** the biggest gameplay change in the list, and it builds on room shapes (1.6.0) and doors (1.7.0):
  a door could later promise a goal ("🏃 Chase: catch the thief for ×3 fines").
- **Balance pass is not ranked first** because it needs data: the overnight balance bot plus your two test runs.
- **Weapons stay parked:** they're the costliest, and story mode benefits more from 1–3.

## Decisions needed from the owner
1. Story beats: fixed original bosses per wing in story (recommended) vs random catalogue authors everywhere.
2. Room goals: which of the three goals to build first (recommended: Survive + Rescue; Thief needs a new enemy behaviour).
3. The catalogue author list includes a real person, a real animal's memorial and a copyrighted character. Keep, or swap for
   original meme-flavoured names? (Not urgent; mentioned because boss names are about to become more prominent.)
