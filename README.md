# OVERDUE! — Night Shift at the Meme Library

The library is closed. The books are not. You're the night librarian: throw books, dash through danger and **SHHH!** the chaos back into silence.

A free arcade roguelite for phone and desktop. It's fully static: no server, no database, no build step needed to play.

## Play

```bash
npm run dev      # http://localhost:5173  (zero-dependency static server)
```

Or open the GitHub Pages site once it's enabled (see **Deploy**).

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Drag anywhere |
| Throw books | Aim + hold click | Right stick / RT | Automatic (2nd finger aims) |
| Dash (invulnerable) | Space / Shift | A / RB | DASH |
| SHHH! shockwave | E / Q / right-click | B / LB | SHHH |
| Pause | P / Esc | Start | ❚❚ |

**F** toggles auto-fire and **M** mutes.

## What's inside

- **Enemies:** Dust Bunny, Overdue Notice, Loud Patron, Bookworm and Late Fee Golem, plus a three-phase **Rogue Author** boss every 5th wave.
- **Perks between waves:**
  - **15 core perks**, including shelf-play perks: Spine Breaker makes books burst on shelves, Reading Nook speeds up throwing next to a shelf, and Interlibrary Loan sends books back through the opposite wall.
  - **3 cursed books**: big upsides with a real cost.
  - **6 Collected Works combos** that unlock when you own both of their perks, for example Bouncy Bookmark + Dewey = *Choose Your Own Adventure*, where ricochets turn toward the nearest enemy.
  - **Renew**: beating a boss earns a free reroll of the perk choices.
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
npm install          # only dev dependency: esbuild (for the single-file build)
npm test             # unit tests for the pure game logic
npm run build        # dist/overdue.html — the whole game in one ~70 KB file
```

```
index.html          page shell + menus
src/main.js         game loop (fixed 120 Hz), entities, AI, rendering, lighting, input, UI
src/arena.js        procedural shelf layouts + connectivity check            (unit-tested)
src/flowfield.js    Dijkstra flow field + grid line of sight                 (unit-tested)
src/waves.js        budget-based, seeded wave composer                       (unit-tested)
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

## History

This game started life inside a university web-dev assignment, an Express and MongoDB "Meme Library" app, where the books came from the database. This repo is the standalone version.
