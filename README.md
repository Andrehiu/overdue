# OVERDUE! — Night Shift at the Meme Library

The library is closed. The books are not. You're the night librarian: throw books, dash through danger and **SHHH!** the chaos back into silence.

A free arcade roguelite for phone and desktop. It's fully static: no server, no database, no build step needed to play.

## Play

```bash
npm run dev      # http://localhost:5173  (zero-dependency static server)
```

Or play online at **https://andrehiu.github.io/overdue/**. On a phone, use **Share → Add to Home Screen** (iPhone, Safari) or **⋮ → Add to Home screen** (Android, Chrome). It installs with its own icon and opens full-screen like an app.

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Drag anywhere |
| Throw books | Aim + hold click | Right stick / RT | Automatic (2nd finger aims) |
| Dash (invulnerable) | Space / Shift | A / RB | DASH (shows a countdown while recharging) |
| SHHH! shockwave | E / Q / right-click | B / LB | SHHH |
| Pause | P / Esc | Start | ❚❚ |

**F** toggles auto-fire and **M** mutes.

## What's inside

- **Two modes:**
  - **Story: the library wings.** Ten handmade wings (Front Desk, Children's Wing, Periodicals … The Restricted Section), unlocked in order. A run is one wing of **10 rooms**: pick a perk after every room. Room 5 is an **elite room**, and room 10 is a **Rogue Author**. Each room is harder than the last, and each wing is harder than the one before it:
    - tougher, faster enemies, and more of them;
    - a growing share of **★ elites**, which wear a gold crown and fire pages at you (from wing 7, three at a time);
    - faster enemy pages;
    - elites burst into pages when they die (from wing 4);
    - bosses learn a new pattern every 3 wings.

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
  - **The perk screen**: cards are styled as library catalogue index cards and state plainly what each one gives you. A card is marked when it would complete a combo with a perk you already own, and NEW the first time you ever see it. You can **Banish** one perk per run, a "Your build" strip shows what you own, and cards ignore taps for half a second so a thumb that's still steering can't pick one by accident.
  - **Library Codex**: a title-screen collection of every combo and Masterwork you've discovered.
  - **Masterworks**: every perk tops out at 3/3. Taking it to 3/3 unlocks its Masterwork, a one-time card with outsized power. For example Hardcover leads to Leather-Bound Tome (every 5th throw is a giant tome that pierces everything) and Quiet Please leads to Absolute Silence (SHHH! freezes the whole library).
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
npm run qa           # full QA: every screen on phone/tablet/desktop, perf budget, privacy scan
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
src/meta.js         late fees: fines, Renovations, saved progress            (unit-tested)
src/upgrades.js     perk definitions + weighted roller                       (unit-tested)
src/util.js         seeded RNG, hashing, collision helpers                   (unit-tested)
src/audio.js        Web Audio synth: sound effects + look-ahead music sequencer
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

## History

This game started life inside a university web-dev assignment, an Express and MongoDB "Meme Library" app, where the books came from the database. This repo is the standalone version.
