# OVERDUE! — Night Shift at the Meme Library

The library is closed. The books are not. You're the night librarian: throw books, dash through danger and **SHHH!** the chaos back into silence.

A free arcade roguelite for iPhone and iPad, played in landscape. Desktop may work but isn't supported or tested. It's fully static: no server, no database, no build step needed to play.

## Play

```bash
npm run dev      # http://localhost:5173  (zero-dependency static server)
```

**Landscape only:** the game plays in landscape on phones and tablets. Held in portrait, touch devices show a "rotate your device" screen (a run in progress is paused). Desktop browsers letterbox the arena.

Or play online at **https://andrehiu.github.io/overdue/**. On a phone, use **Share → Add to Home Screen** (iPhone, Safari) or **⋮ → Add to Home screen** (Android, Chrome). It installs with its own icon and opens full-screen like an app.

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Drag anywhere |
| Throw books | Aim + hold click | Right stick / RT | Automatic; with Settings → Auto-aim off, hold a 2nd finger to aim and throw |
| Dash (invulnerable) | Space / Shift | A / RB | DASH (shows a countdown while recharging) |
| SHHH! shockwave | E / Q / right-click | B / LB | SHHH |
| Pause | P / Esc | Start | ❚❚ |

**F** toggles auto-fire and **M** mutes.

## What's inside

- **Two modes:**
  - **Story: the library wings.** Ten handmade wings (Front Desk, Children's Wing, Periodicals … The Restricted Section), unlocked in order. A run is one wing of **7 rooms**: pick a perk after every room. Room 4 is an **elite room**, and room 7 is a **Rogue Author**. Some rooms are **⏱️ Survive rooms** (never rooms 1, 4 or 7; at most one per wing in wings 1–2, two after that): instead of killing everything you survive 30 seconds while enemies keep coming, then whatever is left vanishes. They are never easier than a plain room and pay the same fines. Each room is harder than the last, and each wing is harder than the one before it. Wings also have their own **room shapes** (long aisles, pillared halls, mazes, reading-room rings, bridges), fixed per room:
    - tougher, faster enemies, and more of them;
    - a growing share of **★ elites**, which wear a gold crown and fire pages at you (from wing 7, three at a time);
    - faster enemy pages;
    - elites burst into pages when they die (from wing 4);
    - bosses learn a new pattern every 3 wings.

    **Pick your next door:** after most rooms you choose the next room from two doors: 💰 Rare Books (more enemies and elites, double fines; from wing 4 the elites are tougher and fire faster), ☕ Break Room (heal a heart, fewer fines), 🎲 Mystery Shelf (a cursed book or a bonus perk when you clear it), or 🚪 The Stacks (a plain room, offered instead of Break Room when you're at full health). Doors never make enemies weaker. There is a door after the elite room too (room 4 to 5). Each wing opens with a one-line intro, its Rogue Author taunts you when they appear in room 7, and clearing the wing shows a closing line. Endless mode has no doors or story lines.

    Each wing has its own enemy mix, shelf density, floor and rug. Shelf layouts are the same every time you play a room.
  - **Endless shift:** the original wave mode with the Hall of Fame. It plays exactly as before.
- **Late fees (permanent progression):** every run earns **fines 🪙**:
  - from Late Fee Golem coins, cleared rooms or waves, elite rooms and bosses;
  - plus a one-time bonus the first time you clear a wing.

  Fines are banked when a run ends, **even if you lose or quit**. Spend them on **Renovations**, permanent upgrades for both modes:
  - +10% damage (×10), +1 heart (×3), +8% throw speed (×5), +5% move speed (×5);
  - a 4th perk card;
  - start with random perks;
  - extra Banishes and Renews;
  - +20% fines (×5);
  - **Second Wind**, a once-per-run revive.

- **Enemies:** Dust Bunny, Overdue Notice, Loud Patron, Bookworm and Late Fee Golem, plus a three-phase **Rogue Author** boss every 5th wave.
- **Perks between waves:**
  - **15 core perks**, including shelf-play perks: Spine Breaker makes books burst on shelves, Reading Nook speeds up throwing next to a shelf, and Interlibrary Loan sends books back through the opposite wall.
  - **3 cursed books**: big upsides with a real cost.
  - **6 Collected Works combos** that unlock when you own both of their perks, for example Bouncy Bookmark + Dewey = *Choose Your Own Adventure*, where ricochets turn toward the nearest enemy.
  - **Renew**: beating a boss earns a free reroll of the perk choices.
  - **The perk screen**: cards are styled as library catalogue index cards and state plainly what each one gives you. A card is marked when it would complete a combo with a perk you already own, and NEW the first time you ever see it. You can **Banish** one perk per run, the **"Your build" strip** shows everything you own as chips (icon, short name, level pips), and chips glow with a 🔗 when a card on offer pairs with them into a combo (card hints name the partner with its icon, too). Tap a chip for a popover with its full name, what it does, its level, the Masterwork it unlocks and its combos (✓ owned / needed); tap outside, tap again or press Esc to close. Cards ignore taps for half a second so a thumb that's still steering can't pick one by accident. **Learn as you go (v1.11.0):** one short tip strip above the cards teaches each rule once ever (perks stack to ●●●, pairs unlock Collected Works, unlocked cards take the first slot; stored in `overdue.tips.v1`, "Show tips again" in Settings). Cards at 2/3 tease a locked Masterwork without revealing it, level-ups show ●●○ → ●●●, and Masterwork / Collected Work cards carry an UNLOCKED stamp and a "because …" line.
  - **Library Codex**: a title-screen collection of every combo and Masterwork you've discovered.
  - **Masterworks**: every perk tops out at 3/3. Taking it to 3/3 unlocks its Masterwork, a one-time card with outsized power. For example Hardcover leads to Leather-Bound Tome (every 5th throw is a giant tome that pierces everything) and Quiet Please leads to Absolute Silence (SHHH! freezes the whole library).
- **Readable at a glance:**
  - your books are always library blue, and enemy pages are always red;
  - perks change how your books look: Hardcover makes them bigger, Bouncy Bookmark adds a gold ribbon, Speed Reader a motion streak, Dewey a teal homing trail, Plot Twist an arrowhead and Spine Breaker a glowing cracked spine, and these stack;
  - perk cards name their combo partners, the pause screen lists **combos in reach**, and the Codex shows every combo's recipe.
- **Scoring:** a combo multiplier up to ×4 and a flawless-wave bonus.
- **Layouts:** a new mirror-symmetric library each wave. The arena is tall on phones held upright and wide everywhere else.
- **Pathfinding:** enemies route around the shelves using a shared Dijkstra flow field.
- **Look and sound:** dynamic lighting, particles, hit-stop and screen shake. All audio is synthesised in the browser, including an adaptive soundtrack.
- **Controls:** keyboard and mouse, gamepad, and one-thumb touch. On phones it also buzzes when you're hit and keeps the screen awake.
- **Accessibility:** auto-fire, a reduced-motion setting and auto-pause when you switch away.
- **Hall of Fame:** kept on the device. When the game is hosted as a claude.ai page, it uses the page's shared store instead.

## Make it yours

The thrown books and the boss names come from `src/catalogue.js`. Edit that file to fill the shelves with your own titles.

## Develop

```bash
npm install          # dev dependencies: esbuild (build) and Playwright (QA)
npm test             # unit tests for the pure game logic
npm run qa           # full QA: every screen on iPhone/iPad, perf budget, privacy scan
npm run build        # dist/overdue.html: the whole game in one file (this is what deploys)
```

Finding your way around: **CODEMAP.md** (generated by `npm run codemap`) indexes every function by line. How to test changes: see **TESTING.md**. Rules for working on the project (people and AI sessions): see **CLAUDE.md**.

```
index.html          page shell + menus
src/main.js         game loop (fixed 120 Hz), entities, AI, rendering, lighting, input, UI
src/arena.js        procedural shelf layouts + connectivity check            (unit-tested)
src/flowfield.js    Dijkstra flow field + grid line of sight                 (unit-tested)
src/waves.js        budget-based, seeded wave composer                       (unit-tested)
src/story.js        story wings: rooms, difficulty curve, rewards            (unit-tested)
src/doors.js        story doors: offers, difficulty and fines modifiers      (unit-tested)
src/meta.js         late fees: fines, Renovations, saved progress            (unit-tested)
src/upgrades.js     perk definitions + weighted roller                       (unit-tested)
src/util.js         seeded RNG, hashing, collision helpers                   (unit-tested)
src/audio.js        Web Audio synth: sound effects + look-ahead music sequencer
src/runlog.js       run log records, damage-by-source counters, Share stats code (shared with the bot) (unit-tested)
src/backend.js      Hall of Fame storage (this device, or a claude.ai page's shared store)
src/catalogue.js    the book titles and authors
src/game.css        menus and overlay styles
```

Add `?debug=1` to the URL for an FPS counter and test hooks (`window.__overdue`).

## Deploy

- **GitHub Pages:** go to Settings → Pages → Source and choose **GitHub Actions**. Every push to `main` then publishes the game through `.github/workflows/pages.yml`.
- **Anywhere else:** upload `index.html` and `src/`, or the single file from `npm run build`.

## Versions and updates

- **Version label:** the title screen and Settings show which build is running, e.g. `v1.1.0 · afd3fcb · 21 Nov 2026`. That's the version from `package.json`, the exact git commit and the build date, stamped in automatically when the game is built.
- **Updates:** every push to `main` deploys a new build. If a newer build is live, players see a **"🔄 New version available, tap to update"** button. It never interrupts a run in progress.
- **Releases:** to mark a notable release, bump `"version"` in `package.json` (e.g. 1.1.0 → 1.2.0). Small fixes don't need a bump, because the commit code changes on every deploy anyway.
- **What gets deployed:** the live site is a single bundled page (`npm run build`), so a phone can never end up with a mix of old and new code from caching.

## Offline play, Home Screen nudge and backup code (v1.13.1)

- **Offline play:** the game registers a service worker (`sw.js`, stamped with the build's version + commit by `npm run build`). After one online visit the game opens with no network. The page, icons and manifest are cached cache-first; `version.json` is never cached. A new build downloads in the background and **waits**; tapping the "New version" bar lets it take over and reloads, so a new version always replaces the old one (old caches are deleted). Only real builds register it: `npm run dev` and the claude.ai `--fragment` build never do. It works under the GitHub Pages `/overdue/` path because everything is relative to the worker's scope.
- **Kill switch:** if the worker ever misbehaves, ship a release built with `OVERDUE_KILL_SW=1 npm run build` (set it on the Build step of `pages.yml`). That `sw.js` deletes every `overdue-*` cache, unregisters itself and reloads open pages; the page it ships stamps `"sw": false`, so nothing registers again. Remove the variable in a later release to bring offline play back.
- **Home Screen nudge:** once, after the first cleared story wing or the first run of 3+ minutes, a card explains Share → Add to Home Screen (Safari can erase a website's saved data after ~7 days unused; installed apps are exempt). Never shown when already installed (`navigator.standalone` or `display-mode: standalone`). Flags `a2hs` / `a2hs-off` live in the existing `overdue.tips.v1` store.
- **Backup code** (Settings → Backup progress, `src/backup.js`): `OVD1:` + base64url of `{"v":1,"keys":{<localStorage key>: <raw string>}}` + `.` + an 8-hex FNV-1a checksum. It carries `overdue.settings.v1`, `best`, `name`, `halloffame`, `codex`, `progress`, `tips`. Restore validates everything (prefix, checksum, version, every value is JSON) before writing anything, runs `normalizeProgress()` on the progress key, then reloads. Bad codes change nothing.

## Bigger rooms and run analytics (v1.14.0)

- **Story rooms are ~20% longer on every side** (`gridForAspect(aspect, true)` in `src/arena.js`; `CELL` stays 30). iPhone landscape goes from 34×16 to 42×19 cells, iPad mini 28×19 to 34×22. The grid still follows the screen's shape (no black bars). Shelf counts scale with the room (`areaK()`) and a top and bottom lamp are added so a room looks the same, just bigger. The world therefore draws ~15% smaller on screen; the HUD, floating numbers and touch sticks are drawn on a `UW×UH` "UI canvas" scaled by `uiK`, and the DOM touch buttons and menus use `--ui-scale × uiK`, so they keep exactly their v1.13.1 on-screen size. **Endless keeps the old grid** (same waves for the same seed, Hall of Fame stays comparable). `?debug=1&legacyrooms=1` plays story at the old size (balance bot only).
- **Run log** (`src/runlog.js`): after every finished run (death, wing cleared, quit) one record is appended to the new localStorage key `overdue.runs.v1` (newest 50, ring buffer). Record `v: 1`: `ver`, `mode` (s/e), `wing`, `room`, `res` (c/d/q), `killer` + `elite` (enemy type, `page:fan|spiral|radial|charge|elite|elite-burst`, `ring`, `boss:charge`), `perks` in pick order, `ban` (banished), `cur` (cursed taken), `doors`, `reno` levels, `t` seconds, `hp` max hearts, `dealt` (damage by source: throw, crit, dash, orbit, burst = Spine Breaker, splash = Annotated, shhh, other) and `taken` (hearts lost by source). The balance bot reads the very same counters, so game and bot measure the same things.
- **Share stats** (Settings): copies `OVS1:` + base64url of `{"v":1,"runs":[…]}` + `.` + the 8-hex checksum (same scheme as the backup code) to the clipboard inside the tap, with a selectable text box as the fallback. It holds no name or other personal data. Turn a pasted code into tables with `node scripts/stats-decode.mjs "<code>"` (or a file / stdin): one row per run, then deaths by room, killers, perk pick rates and damage share by source.
- **The backup code does NOT include `overdue.runs.v1`** (it stays small); the run log lives only on the phone it was played on.
- **Balance bot additions:** `--renos=max` (every Renovation at its top tier; csv like `none,max` works), `--wings=6,7,8,9,10`, `--force-perks=dewey:3,interlibrary:3` (bot only, granted at run start), `--rooms=old|new`, `--viewport=844x390`, `--out=<dir>`. Runs use a per-run seed, so run k is the same seed in every batch. Reports add damage dealt / hearts lost by source, thrown-book hit rate, book life p95, books in flight p95, evictions/s, orbit share of damage, pages that flew through an orbit book and still hit you, and boss kill time. Baselines: `docs/balance/1.14.0a-baseline.md`.

## History

This game started life inside a university web-dev assignment, an Express and MongoDB "Meme Library" app, where the books came from the database. This repo is the standalone version.
