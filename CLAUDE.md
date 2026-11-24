# CLAUDE.md: how to work on OVERDUE!

Claude Code reads this file automatically at the start of every session. Follow it. If a rule here
conflicts with a request, ask the owner, don't silently pick one.

## What this is
A static, phone-first arcade roguelite (HTML canvas + ES modules, no server). The live site is
GitHub Pages: https://andrehiu.github.io/overdue/ (auto-deployed from `main`). See README.md for the code map.

## Session roles: planners plan, coders code
Every session is either a **planner** or a **coder**. A session is a coder only if its system prompt or first
message says "You are a coder session"; every other session is a planner.

**Planner (default):**
- Reads **`ROADMAP.md`** right after this file, and keeps it current (decisions, plan status, parked ideas).
  Saves each coder prompt in `docs/handoffs/<version>-<topic>.md`.
- Talks with the owner: ideas, design, priorities, reviewing results. **Never edits game code** (`src/`, `index.html`,
  `test/`, `scripts/`). It may edit docs only (CLAUDE.md, README.md, TESTING.md, ROADMAP.md, `docs/`).
- Hands each coding task to a **new coder session**: model Sonnet, on this repo (`https://github.com/Andrehiu/overdue`, so
  it is grouped with the other Overdue sessions), one task per session and branch.
  - Title: `Overdue · v<version> <short topic>`, e.g. `Overdue · v1.3.1 stuck fix`.
  - Tag: `overdue-coder`.
  - Start its prompt with "You are a coder session" and make it stand alone: goal, known cause, exact scope, tests,
    definition of done, and what to report back.
- Checks on the coder until it finishes, then **reviews its work itself**: fetches the branch, reads the diff, runs
  `npm test` and `npm run qa`, and looks at the screenshots. Only then reports to the owner, with numbers.
- If the coder's work is wrong, sends it fixes, or (after asking the owner) deletes its branch and starts again.
- Ships to `main` only when the owner says so.

**Coder:** does the task it was given, following everything below. It never hands work to another session.

## Find code cheaply (read this first)
**`CODEMAP.md`** lists every file, every section of `src/main.js` and every function with its line number, plus a
"where to change what" table. Read it first, then read only the lines you need (`Read` with offset/limit, or
`grep -n`). Don't read `src/main.js` (~2,200 lines) whole. After editing code, run `npm run codemap`;
`npm test` fails while CODEMAP.md is stale.

## Commands
```bash
npm run codemap # regenerate CODEMAP.md after code changes
npm run dev     # local play at http://localhost:5173 (add ?debug=1 for test hooks)
npm test        # unit tests for the pure game modules (fast)
npm run qa      # FULL QA: unit tests + every screen on phone/tablet/desktop + perf budget + privacy scan
npm run build   # dist/overdue.html (single file) + dist/version.json; this is exactly what deploys
```

## Definition of done (every change)
1. Work on a branch: `claude/<short-topic>`. One task per session/branch.
2. `npm run qa` passes. **Open the screenshots in `qa-report/`** (title, perks, game over at least),
   because several bugs here were only visible by eye.
3. Follow the checklist in **TESTING.md** for the kind of change you made.
4. Release: bump `"version"` in package.json for anything players will notice (patch = fix, minor = feature).
5. Ship: fast-forward `main` to your branch (`git push origin HEAD:main`) only when the owner asked to ship.
6. **Never say "live" until the "Deploy to GitHub Pages" run for that commit is green.** If it fails with
   "Fetching artifact metadata failed", that's a GitHub hiccup: re-run the workflow and check again.
7. Players see the new version on next open; the title screen shows `v<version> · <commit>`.

## Product rules (owner decisions, don't change without asking)
- **Mobile only, landscape** (since v1.10.1): iPhone landscape is the main target; iPad must also fill the screen. In portrait, touch devices show a rotate overlay. **Desktop is unsupported:** it may keep working, but it isn't tested, designed for or fixed; keep the keyboard/mouse code (handy for debugging) but don't build desktop features. Gamepads stay supported (they work with phones and iPads).
- **Keep the dynamic lighting** (dark room, lamp pools, lantern) as it is.
- **Auto-aim prefers enemies in line of sight** (sticky, 50% lead); with none visible it targets the nearest enemy behind shelves (feeds Spine Breaker).
- **Perk cards speak plainly:** "just the gain" (e.g. "+50% damage"). Never show internal units (px, rad/s).
- Perks stack to 3/3; 3/3 unlocks that perk's Masterwork. Combos ("Collected Works") unlock from pairs.
- The app icon and name ("Overdue!") are baked in when players add to Home Screen; changing them
  forces everyone to re-add. Don't change them casually.
- **Saved data must survive updates.** These localStorage keys are player data; never rename or reshape
  without a migration: `overdue.settings.v1`, `overdue.best.v1`, `overdue.name.v1`,
  `overdue.halloffame.v1`, `overdue.codex.v1`, `overdue.progress.v1` (fines, Renovations, story unlocks;
  `normalizeProgress()` in src/meta.js repairs old or partial saves).
- **Difficulty only goes up:** in story mode every room is harder than the one before it, and every wing harder
  than the previous wing at the same room. `test/story-meta.test.js` enforces this; keep it passing when tuning.
- **Endless mode stays as it was** (same waves for the same seed, Hall of Fame scores stay comparable). Story
  runs aren't ranked. Renovations apply to both modes.

## Lessons learned (each became a QA check)
| What slipped | Rule |
|---|---|
| Card colours were defined on `:root` and turned every menu dark-on-dark | Scope component tokens to the component; QA checks menu text contrast |
| A deploy was reported live but had failed | Check the Pages run is green before saying live |
| Late boss ran at 0.4x speed (hit-stop chained on every hit) | Perf budget (median of 5 samples): wave-15 boss with a stacked build ≥ 0.85x speed and game update ≤ 4 ms/frame; ≥ 50 fps fails only with a GPU, else ⚠️ warning (software raster swings 35-59 fps) |
| A privacy scan checked files but not commit messages | QA scans files *and* commit messages |
| Flow-field heap compared float64 keys to a Float32Array | Pure logic stays in pure modules with unit tests |

## Privacy and security
- Never put the owner's personal details (email, full name) in code, docs or commit messages.
- `.qa-private-terms` (gitignored, one term per line) lets `npm run qa` scan for them locally.
- No secrets exist or are needed: the game is static. Keep it that way.

## Also exists
- A claude.ai-hosted copy (shared Hall of Fame) is built with `npm run build -- --fragment` and
  republished from a Claude session; it doesn't update from `main` automatically.
