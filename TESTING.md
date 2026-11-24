# Test plan

Run `npm run qa` for every change, then work through the section(s) below that match what you changed.
The automated suite catches regressions; the manual checks catch things only a person (or a careful
look at the screenshots) notices.

## What `npm run qa` checks automatically

| Area | Checks | Pass criteria |
|---|---|---|
| Unit | All `node:test` suites (arenas, pathfinding, waves, perks, previews, versioning) | 0 failures |
| Screens, **full flow** on 3 targets: iPhone 13 landscape (844x390, Home Screen size), iPad landscape, iPad mini landscape 1133x744 (mobile only, no desktop target) | Title fully visible · arena fills screen · menu text readable · version label · run starts · perk cards render with plain text · Masterwork at 3/3 · pause + build strip · boss spawns · game-over text readable · score saves · Codex opens · **no page/console errors · no failed requests** (plus every row below) | Fill ≥ 95% of screen; menu text luminance > 0.5; card title luminance < 0.3 |
| Screens, **fit-only pass** on the other 4 sizes: iPhone SE 667x331, iPhone 13 Safari 750x342, iPhone 15 Pro Max 932x430, iPad Safari 1180x740 | Same layout checks as above, minus the rule/logic checks: title (fill, no scroll, every element on screen, contrast, version) · perk screen (cards, tip strip, build strip, popover on screen) · endless game over (stats readable, pinned row) · Renovations text · story wing select + story room fill · 4-card hand · door screen fit · room-7 boss + wing-cleared screen (buttons on screen with a big build, pinned row) · no page/console errors | as above |
| Menus (all 7 sizes) | Title, How to play, Settings, Leaderboard, Codex, Story, Renovations: bottom buttons on screen and tappable · pinned row covers nothing · How to play text/contrast | as listed |
| Rotation (cheap, all phones) | iPhone portrait: rotate overlay covers the title, rotating mid-run pauses, rotating back shows pause and the arena fills ≥ 95% · iPhone 13 / SE / 15 Pro Max: portrait→landscape and landscape→portrait→landscape keep fill ≥ 95% and the title fits | as listed |
| Story + late fees (**full-flow targets only**; fit-only targets run the layout rows) | Renovations shop readable · buying spends fines and saves · wing select (10 wings, only wing 1 open) · story room starts · 4-card hand fits the screen · elite room is all elites · Survive room counts down, keeps spawning and clears itself · room-7 boss · clearing wing 1 unlocks wing 2 | as listed |
| Performance | Wave-15 boss, ~25 perks + Masterworks, phone viewport; story wing 10 room 6 (elites shooting) | Game speed ≥ 0.85x, ≥ 50 fps (CI: ≥ 0.75x, fps not judged), books in flight ≤ 110 |
| App basics (v1.13.1) | Served under `/overdue/` with a 10-min HTTP cache like Pages: worker registers and caches · offline reload shows the title and a run starts · N → N+1: update bar appears, new build waits, tap → title shows N+1, opens offline, only newest cache kept · kill switch removes worker + caches · `--fragment` build has no worker · backup code copy / restore (confirm first, bad / truncated / wrong-version / tampered codes change nothing) · Home Screen nudge (shown once after a 3+ min run or cleared wing, never in standalone, Got it / Don't show again) · Backup screen fits all 7 sizes | as listed |
| Privacy | Secrets and email addresses in tracked files **and commit messages**; your private terms if `.qa-private-terms` exists | No hits |

Output: `qa-report/report.md` plus screenshots per device (`iphone-landscape-1-title.png` … `-13-wing-cleared.png`, `perf-late-boss.png`, `perf-story-late.png`). Fit-only targets produce the layout screenshots only (title, perks, build strip, doors, game over, wing cleared, menus).

### How long it takes, and what runs where
Typical `npm run qa`: **about 3 minutes on a 4-core machine** (median 170 s over 3 runs; was ~11 min / 661 s when all 7 sizes ran the whole flow one after another). On a slower or 2-core machine expect 5+ minutes.
Why it is faster: (1) most bugs here were layout/fit bugs on one size, which don't need the whole gameplay flow on every size, so only the 3 targets above run the full flow; (2) independent flows (targets, menus, rotation, shapes) run **in parallel browser contexts, 4 at a time** (`--jobs=N`, default min(4, CPUs)); (3) **perf always runs alone**, after the parallel part, so fps numbers stay comparable.

Options:
- `--only=perf` (or `unit`, `screens`, `menus`, `shapes`, `security`, comma-separated) still works.
- `--full`: run the full flow on **every** size. Use it for releases that change gameplay screens or flow (new screens, perk/door/game-over logic), or when a fit-only target fails and you need to see what happened earlier in the flow. Takes ~3.5–4 minutes (216 s measured).
- `--jobs=1`: run everything one at a time (slowest, most stable; use it if a flow only fails when the machine is busy).
- `--ci`: relaxed perf for slow machines.

A check that exists only in the full flow does not run on the fit-only sizes: those sizes can't catch rule bugs, only layout ones. If you change something that depends on screen size inside such a check (a new screen, a new pinned row), add it to the part of the flow that **both** tiers run (see `full` in `screensFlow` in `scripts/qa/run.mjs`).

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
- [ ] Look at **title, perks, pause, game over and Codex** screenshots on **iPhone landscape and iPad landscape** (plus How to play) plus `iphone-rotate-overlay.png` and `iphone-rotate-back.png`, not just
      the screen you changed (one style change once broke every menu)
- [ ] New colour tokens are scoped to their component, not `:root`
- [ ] Nothing clipped or overlapping at iPhone landscape (844×390) and the rotate overlay at portrait (390 px wide)

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

### Offline / backup / nudge
- [ ] `npm run qa` basics rows green (offline, update N→N+1, kill switch, backup, nudge)
- [ ] Never add a file to the game without adding it to `PRECACHE` in `sw.js` if it must work offline

### Things only a real device can tell you (do before telling friends)
- [ ] iPhone Safari: Share → Add to Home Screen works, the installed app opens offline (airplane mode), and the nudge never shows inside it
- [ ] iPhone Safari: "Copy backup code" really copies (clipboard API); long-press paste into Notes and back works
- [ ] After a new release: open the installed app online once, tap the update bar, title shows the new version
- [ ] Sound plays after the first tap; music isn't too loud
- [ ] Touch: drag to move, DASH/SHHH reachable with thumbs, no accidental perk picks
- [ ] Feels smooth in a late boss fight on an actual phone
