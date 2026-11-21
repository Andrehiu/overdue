# Test plan

Run `npm run qa` for every change, then work through the section(s) below that match what you changed.
The automated suite catches regressions; the manual checks catch things only a person (or a careful
look at the screenshots) notices.

## What `npm run qa` checks automatically

| Area | Checks | Pass criteria |
|---|---|---|
| Unit | All `node:test` suites (arenas, pathfinding, waves, perks, previews, versioning) | 0 failures |
| Screens: iPhone portrait, iPhone landscape, iPad landscape, desktop | Title fully visible · arena fills screen · menu text readable · version label · run starts · perk cards render with plain text · Masterwork at 3/3 · pause + build strip · boss spawns · game-over text readable · score saves · Codex opens · **no page/console errors · no failed requests** | Fill ≥ 75% of screen; menu text luminance > 0.5; card title luminance < 0.3 |
| Story + late fees (every device) | Renovations shop readable · buying spends fines and saves · wing select (10 wings, only wing 1 open) · story room starts · 4-card hand fits the screen · elite room is all elites · room-10 boss · clearing wing 1 unlocks wing 2 | as listed |
| Performance | Wave-15 boss, ~25 perks + Masterworks, phone viewport; story wing 10 room 9 (elites shooting) | Game speed ≥ 0.85x, ≥ 50 fps (CI: ≥ 0.75x, fps not judged), books in flight ≤ 110 |
| Privacy | Secrets and email addresses in tracked files **and commit messages**; your private terms if `.qa-private-terms` exists | No hits |

Output: `qa-report/report.md` plus screenshots per device (`iphone-1-title.png` … `-13-wing-cleared.png`, `perf-late-boss.png`, `perf-story-late.png`).
Options: `npm run qa -- --only=perf` (or `unit`, `screens`, `security`, comma-separated) · `--ci` relaxes perf for slow machines.

## Checklist by type of change

### Gameplay / balance (enemies, perks, waves, bosses)
- [ ] Unit tests added or updated for any new rule (e.g. new perk: stats stay finite, unlock rules)
- [ ] Play a run to wave 6+ yourself (or with `?debug=1`: `__overdue.startWave(n)`, `grant(id)`, `god()`)
- [ ] New perk: its card shows a plain "gain" line, a level (●○○) and a combo hint where relevant
- [ ] Note the difficulty change in the commit message (what got easier or harder, by how much)

### Story / late fees balance
- [ ] `npm test`: the "every room harder" and "every wing harder" tests still pass
- [ ] Try a late wing with `?debug=1`: `__overdue.unlockAll()`, `__overdue.startRun('story', 8)`, `__overdue.startWave(9)`
- [ ] Renovation prices: a wing-1 run that dies in room 6 should still afford the cheapest Renovation (25 fines)

### Visual / UI / CSS
- [ ] Look at **title, perks, pause, game over and Codex** screenshots on **iPhone and desktop**, not just
      the screen you changed (one style change once broke every menu)
- [ ] New colour tokens are scoped to their component, not `:root`
- [ ] Nothing clipped or overlapping at iPhone portrait (390 px wide) and iPhone landscape

### Performance-sensitive (effects, particles, lights, more entities)
- [ ] `npm run qa -- --only=perf` passes locally (not just in CI)
- [ ] New per-entity effects have a budget or cap (see `MAX_BOOKS`, light budget, `particle()` cap)

### Saved data
- [ ] No localStorage key renamed or reshaped (see CLAUDE.md), or a migration was added and tested
      with an old save

### Shipping a release
- [ ] `"version"` bumped in package.json (patch for fixes, minor for features)
- [ ] `main` fast-forwarded, **"Deploy to GitHub Pages" run green** for that commit, CI green
- [ ] Open the live site: title shows the new `v<version> · <commit>`
- [ ] If the icon, name or manifest changed: tell players to re-add to Home Screen

### Things only a real device can tell you (do before telling friends)
- [ ] Sound plays after the first tap; music isn't too loud
- [ ] Touch: drag to move, DASH/SHHH reachable with thumbs, no accidental perk picks
- [ ] Feels smooth in a late boss fight on an actual phone
